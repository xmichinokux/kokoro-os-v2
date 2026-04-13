import { GoogleGenerativeAI } from '@google/generative-ai';
import { google, type drive_v3 } from 'googleapis';
import { createServerSupabase } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// 対象MIMEタイプ
const TARGET_MIME_TYPES = [
  'text/plain',
  'application/vnd.google-apps.document',
  'application/pdf',
];

const MIME_QUERY = TARGET_MIME_TYPES
  .map(t => `mimeType='${t}'`)
  .join(' or ');

// 指定フォルダとそのサブフォルダのIDを再帰的に収集
async function collectFolderIds(
  drive: drive_v3.Drive,
  folderName: string
): Promise<string[]> {
  // ルートフォルダを検索
  const rootRes = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
  });
  const rootFolder = rootRes.data.files?.[0];
  if (!rootFolder) throw new Error(`Googleドライブに「${folderName}」フォルダが見つかりません`);

  const folderIds: string[] = [rootFolder.id!];

  // BFSでサブフォルダを再帰的に収集
  const queue = [rootFolder.id!];
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
        q: `'${folderId}' in parents and (${MIME_QUERY}) and trashed=false`,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, parents)',
        pageSize: 100,
        orderBy: 'modifiedTime desc',
        pageToken,
      });

      const files = res.data.files || [];
      allFiles.push(...files);

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
  if (file.mimeType === 'application/vnd.google-apps.document') {
    // Google Docs → テキスト書き出し
    const res = await drive.files.export({
      fileId: file.id!,
      mimeType: 'text/plain',
    });
    return String(res.data);
  }

  if (file.mimeType === 'application/pdf') {
    // PDF → バイナリ取得 → 動的importでpdf-parse
    try {
      const { PDFParse } = await import('pdf-parse');
      const res = await drive.files.get(
        { fileId: file.id!, alt: 'media' },
        { responseType: 'arraybuffer' }
      );
      const buffer = Buffer.from(res.data as ArrayBuffer);
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      return result.text;
    } catch {
      // pdf-parseが使えない環境（Vercel等）ではスキップ
      throw new Error('PDF解析不可（サーバーレス環境）');
    }
  }

  // プレーンテキスト
  const res = await drive.files.get({
    fileId: file.id!,
    alt: 'media',
  });
  return String(res.data);
}

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
    }

    const { accessToken, userId, folderName } = await req.json();
    if (!accessToken) {
      return NextResponse.json({ error: 'Googleアクセストークンがありません' }, { status: 401 });
    }
    if (!userId) {
      return NextResponse.json({ error: 'ユーザーIDがありません' }, { status: 401 });
    }

    const targetFolder = folderName || 'Scan Data';

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth });

    // 対象フォルダ + サブフォルダを再帰的に収集
    const folderIds = await collectFolderIds(drive, targetFolder);

    // フォルダ内のファイル一覧取得
    const allFiles = await listFilesInFolders(drive, folderIds);

    // ファイル一覧（デバッグ用にレスポンスにも含める）
    const fileList = allFiles.map(f => ({
      name: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
    }));

    // 内容を読み込む（最大40ファイル・合計50000文字）
    let allContent = '';
    let loadedCount = 0;
    const loadedFiles: string[] = [];
    const skippedFiles: string[] = [];

    for (const file of allFiles.slice(0, 40)) {
      if (allContent.length > 50000) break;
      try {
        const content = await readFileContent(drive, file);
        const truncated = content.slice(0, 3000);
        allContent += `\n\n[${file.name}]\n${truncated}`;
        loadedFiles.push(file.name || 'unknown');
        loadedCount++;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'unknown';
        console.error(`スキップ: ${file.name} (${errMsg})`);
        skippedFiles.push(`${file.name} (${errMsg})`);
      }
    }

    // Geminiで感性ベクターを生成
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const result = await model.generateContent(`
以下はあるユーザーの文章・メモ・ZINEの内容です。

${allContent}

---

このユーザーの「文体・思想・センス・価値観・語彙・リズム・こだわり」を
3000文字以内で詳細に分析・要約してください。

以下の観点で：
・文体の特徴（語尾・文長・リズム・改行の癖）
・思想・哲学・価値観の核心
・繰り返し使う語彙・表現
・好むテーマ・嫌うもの
・文章の温度感・強度
・独自の切り口・視点

この要約はAIがこのユーザーの代わりに文章を書く時の「感性の設計図」として使います。
できるだけ具体的に、このユーザーらしさが再現できるように書いてください。
`);

    const sensibilityCache = result.response.text();

    // Supabaseに保存
    const supabase = await createServerSupabase();
    const { error: dbError } = await supabase
      .from('user_profiles')
      .upsert({
        user_id: userId,
        sensibility_cache: sensibilityCache,
        sensibility_updated_at: new Date().toISOString(),
        sensibility_file_count: loadedCount,
      }, { onConflict: 'user_id' });

    if (dbError) {
      console.error('Supabase保存エラー:', dbError);
      throw new Error(`データベース保存エラー: ${dbError.message}`);
    }

    return NextResponse.json({
      success: true,
      totalFound: allFiles.length,
      fileCount: loadedCount,
      cacheLength: sensibilityCache.length,
      fileList,
      loadedFiles,
      skippedFiles,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
