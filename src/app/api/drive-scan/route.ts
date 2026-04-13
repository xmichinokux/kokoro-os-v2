import { GoogleGenerativeAI } from '@google/generative-ai';
import { google, type drive_v3 } from 'googleapis';
import { createServerSupabase } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// スキャンタイプ定義
type ScanType = 'writing' | 'thought' | 'structure' | 'trip';

// フォルダ別Geminiプロンプト
const PROMPTS: Record<ScanType, string> = {
  writing: `以下はユーザーの文章作品です。
このユーザーの文体・リズム・語調の特徴を分析してください。

【重要】
・特定の固有名詞・造語・専門用語はそのまま使わない
・文体の傾向を抽象的に記述する
・例：「短文を好む」「断定的な語調」「余白を大切にする」

分析観点（3000文字以内）：
・文の長さ・リズムの特徴
・語調（断定的/柔らかい/乾いている等）
・改行・余白の使い方
・どんな言葉を削ぎ落とすか
・読者への語りかけ方`,

  thought: `以下はユーザーの思想・哲学的な文章です。
このユーザーの価値観・思想・世界観の特徴を分析してください。

【重要】
・特定の固有名詞・造語・専門用語はそのまま使わない
・思想の傾向を抽象的に記述する

分析観点（3000文字以内）：
・価値観の核心（何を大切にして何を嫌うか）
・思考の方向性（批判的/建設的/懐疑的等）
・世界の捉え方
・問いの立て方・解の出し方
・感情の温度感`,

  structure: `以下はユーザーの構造的な文章・企画書・仕様書です。
このユーザーの情報整理・構造化の特徴を分析してください。

【重要】
・特定の固有名詞・造語・専門用語はそのまま使わない
・構造化の傾向を抽象的に記述する

分析観点（3000文字以内）：
・情報の整理の仕方
・章立て・見出しの使い方
・優先順位の付け方
・抽象と具体の使い分け
・結論の出し方`,

  trip: `以下はある存在がトリップした時の文章です。

この文章の「文体・語彙・飛躍・熱量・独自の概念・造語」を
3000文字以内で詳細に分析してください。

特に以下の観点で：
・独自の造語・概念（例：受肉・SYNC・0.82mm・兆確定）
・文章の飛躍パターン（どのように論理を飛ばすか）
・熱量の表現方法
・句読点・改行・強調の癖
・宇宙的・哲学的な大げさな表現パターン

この分析はAIがこの文体を再現するための「トリップ設計図」として使います。`,
};

// scanTypeに応じた対象フォルダパス
const FOLDER_PATHS: Record<ScanType, string> = {
  writing: '文章',
  thought: '思想',
  structure: '構造',
  trip: 'Scan Trip',
};

// scanTypeに応じたDB保存カラム
function getUpsertData(scanType: ScanType, userId: string, cacheText: string, loadedCount: number) {
  const now = new Date().toISOString();
  switch (scanType) {
    case 'writing':
      return { user_id: userId, sensibility_cache: cacheText, sensibility_updated_at: now, sensibility_file_count: loadedCount };
    case 'thought':
      return { user_id: userId, sensibility_thought_cache: cacheText, sensibility_thought_updated_at: now, sensibility_thought_file_count: loadedCount };
    case 'structure':
      return { user_id: userId, sensibility_structure_cache: cacheText, sensibility_structure_updated_at: now, sensibility_structure_file_count: loadedCount };
    case 'trip':
      return { user_id: userId, trip_cache: cacheText, trip_updated_at: now, trip_file_count: loadedCount };
  }
}

// 検索クエリ: テキスト系のみ
const FILE_QUERY = [
  "mimeType='text/plain'",
  "mimeType='application/vnd.google-apps.document'",
  "mimeType='text/markdown'",
  "mimeType='text/x-markdown'",
  "name contains '.md'",
].join(' or ');

// 指定フォルダIDを名前から検索（親フォルダ内）
async function findFolderByName(
  drive: drive_v3.Drive,
  name: string,
  parentId?: string
): Promise<string | null> {
  const q = parentId
    ? `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await drive.files.list({ q, fields: 'files(id, name)' });
  return res.data.files?.[0]?.id || null;
}

// 指定フォルダとそのサブフォルダのIDを再帰的に収集
async function collectSubFolderIds(
  drive: drive_v3.Drive,
  rootId: string
): Promise<string[]> {
  const folderIds: string[] = [rootId];
  const queue = [rootId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const subRes = await drive.files.list({
      q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      pageSize: 100,
    });
    for (const sub of subRes.data.files || []) {
      folderIds.push(sub.id!);
      queue.push(sub.id!);
    }
  }
  return folderIds;
}

// 指定フォルダ群の中のファイルをページネーションで取得（上限200件）
async function listFilesInFolders(
  drive: drive_v3.Drive,
  folderIds: string[],
  maxFiles = 200
): Promise<drive_v3.Schema$File[]> {
  const allFiles: drive_v3.Schema$File[] = [];
  for (const folderId of folderIds) {
    if (allFiles.length >= maxFiles) break;
    let pageToken: string | undefined;
    while (allFiles.length < maxFiles) {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and (${FILE_QUERY}) and trashed=false`,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, parents)',
        pageSize: 100,
        orderBy: 'modifiedTime desc',
        pageToken,
      });
      allFiles.push(...(res.data.files || []));
      pageToken = res.data.nextPageToken ?? undefined;
      if (!pageToken) break;
    }
  }
  return allFiles.slice(0, maxFiles);
}

// ファイルのテキスト内容を読み込む
async function readFileContent(
  drive: drive_v3.Drive,
  file: drive_v3.Schema$File
): Promise<string> {
  const mime = file.mimeType || '';
  if (mime === 'application/vnd.google-apps.document') {
    const res = await drive.files.export({ fileId: file.id!, mimeType: 'text/plain' });
    return String(res.data);
  }
  const res = await drive.files.get({ fileId: file.id!, alt: 'media' });
  return String(res.data);
}

// 1フォルダ分のスキャン実行
async function scanFolder(
  drive: drive_v3.Drive,
  folderId: string,
  geminiKey: string,
  scanType: ScanType
): Promise<{
  fileCount: number;
  totalFound: number;
  cacheText: string;
  loadedFiles: string[];
  skippedFiles: string[];
}> {
  const folderIds = await collectSubFolderIds(drive, folderId);
  const allFiles = await listFilesInFolders(drive, folderIds);

  let allContent = '';
  let loadedCount = 0;
  const loadedFiles: string[] = [];
  const skippedFiles: string[] = [];

  for (const file of allFiles.slice(0, 40)) {
    if (allContent.length > 50000) break;
    try {
      const content = await readFileContent(drive, file);
      allContent += `\n\n[${file.name}]\n${content.slice(0, 3000)}`;
      loadedFiles.push(file.name || 'unknown');
      loadedCount++;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'unknown';
      skippedFiles.push(`${file.name} (${errMsg})`);
    }
  }

  if (loadedCount === 0) {
    return { fileCount: 0, totalFound: allFiles.length, cacheText: '', loadedFiles, skippedFiles };
  }

  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const prompt = PROMPTS[scanType] + '\n\n' + allContent;
  const result = await model.generateContent(prompt);
  const cacheText = result.response.text();

  return { fileCount: loadedCount, totalFound: allFiles.length, cacheText, loadedFiles, skippedFiles };
}

// Vercel関数のタイムアウトを延長
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
    }

    const { accessToken, userId, scanType } = await req.json();
    if (!accessToken) {
      return NextResponse.json({ error: 'Googleアクセストークンがありません' }, { status: 401 });
    }
    if (!userId) {
      return NextResponse.json({ error: 'ユーザーIDがありません' }, { status: 401 });
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth });

    // tripの場合は「Scan Trip」フォルダ直下
    if (scanType === 'trip') {
      const tripFolderId = await findFolderByName(drive, 'Scan Trip');
      if (!tripFolderId) throw new Error('Googleドライブに「Scan Trip」フォルダが見つかりません');

      const result = await scanFolder(drive, tripFolderId, geminiKey, 'trip');
      if (result.fileCount > 0) {
        const supabase = await createServerSupabase();
        const { error: dbError } = await supabase
          .from('user_profiles')
          .upsert(getUpsertData('trip', userId, result.cacheText, result.fileCount), { onConflict: 'user_id' });
        if (dbError) throw new Error(`データベース保存エラー: ${dbError.message}`);
      }

      return NextResponse.json({ success: true, scanType: 'trip', ...result });
    }

    // writing/thought/structure（1フォルダのみ）
    const type = scanType as ScanType;
    if (!['writing', 'thought', 'structure'].includes(type)) {
      return NextResponse.json({ error: `無効なscanType: ${scanType}` }, { status: 400 });
    }

    const scanDataId = await findFolderByName(drive, 'Scan Data');
    if (!scanDataId) throw new Error('Googleドライブに「Scan Data」フォルダが見つかりません');

    const subFolderName = FOLDER_PATHS[type];
    const subFolderId = await findFolderByName(drive, subFolderName, scanDataId);
    if (!subFolderId) throw new Error(`「Scan Data/${subFolderName}」フォルダが見つかりません`);

    const result = await scanFolder(drive, subFolderId, geminiKey, type);

    if (result.fileCount > 0) {
      const supabase = await createServerSupabase();
      const { error: dbError } = await supabase
        .from('user_profiles')
        .upsert(getUpsertData(type, userId, result.cacheText, result.fileCount), { onConflict: 'user_id' });
      if (dbError) throw new Error(`データベース保存エラー: ${dbError.message}`);
    }

    return NextResponse.json({ success: true, scanType: type, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
