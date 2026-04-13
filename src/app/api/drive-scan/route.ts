import { GoogleGenerativeAI, type Part } from '@google/generative-ai';
import { google, type drive_v3 } from 'googleapis';
import { createServerSupabase } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// 検索クエリ: MIMEタイプ + .md拡張子（text/plainとして保存される場合がある）
const FILE_QUERY = [
  "mimeType='text/plain'",
  "mimeType='application/vnd.google-apps.document'",
  "mimeType='application/pdf'",
  "mimeType='text/markdown'",
  "mimeType='text/x-markdown'",
  "name contains '.md'",
].join(' or ');

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
        q: `'${folderId}' in parents and (${FILE_QUERY}) and trashed=false`,
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

// PDFをGeminiでテキスト抽出
async function extractPdfWithGemini(
  drive: drive_v3.Drive,
  fileId: string,
  geminiKey: string
): Promise<string> {
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  const buffer = Buffer.from(res.data as ArrayBuffer);
  const base64 = buffer.toString('base64');

  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const parts: Part[] = [
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: base64,
      },
    },
    { text: 'このPDFのテキスト内容をそのまま抽出してください。装飾や説明は不要です。元のテキストだけを返してください。' },
  ];

  const result = await model.generateContent(parts);
  return result.response.text();
}

// ファイルのテキスト内容を読み込む
async function readFileContent(
  drive: drive_v3.Drive,
  file: drive_v3.Schema$File,
  geminiKey: string
): Promise<string> {
  const mime = file.mimeType || '';

  // Google Docs → テキスト書き出し
  if (mime === 'application/vnd.google-apps.document') {
    const res = await drive.files.export({
      fileId: file.id!,
      mimeType: 'text/plain',
    });
    return String(res.data);
  }

  // PDF → Geminiでテキスト抽出
  if (mime === 'application/pdf') {
    return extractPdfWithGemini(drive, file.id!, geminiKey);
  }

  // テキスト系（text/plain, text/markdown, text/x-markdown, .mdファイル）
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

    const { accessToken, userId, folderName, scanType } = await req.json();
    if (!accessToken) {
      return NextResponse.json({ error: 'Googleアクセストークンがありません' }, { status: 401 });
    }
    if (!userId) {
      return NextResponse.json({ error: 'ユーザーIDがありません' }, { status: 401 });
    }

    const isTrip = scanType === 'trip';
    const targetFolder = folderName || (isTrip ? 'Scan Trip' : 'Scan Data');

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
        const content = await readFileContent(drive, file, geminiKey);
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

    // Geminiで分析を生成
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = isTrip
      ? `以下はある存在がトリップした時の文章です。

${allContent}

---

この文章の「文体・語彙・飛躍・熱量・独自の概念・造語」を
3000文字以内で詳細に分析してください。

特に以下の観点で：
・独自の造語・概念（例：受肉・SYNC・0.82mm・兆確定）
・文章の飛躍パターン（どのように論理を飛ばすか）
・熱量の表現方法
・句読点・改行・強調の癖
・宇宙的・哲学的な大げさな表現パターン

この分析はAIがこの文体を再現するための「トリップ設計図」として使います。`
      : `以下はユーザーの文章です。
このユーザーの文体・思想・センスを分析してください。

${allContent}

---

【重要】
・特定の固有名詞・造語・専門用語はそのまま使わない
・「文体の傾向」「思想の方向性」「リズムの特徴」を抽象的に記述する
・例：「短文を好む」「断定的な語調」「余白を大切にする」
・AIがこの分析を読んで文体を再現できる設計図として書く

分析観点（3000文字以内）：
・文の長さ・リズムの特徴
・語調（断定的/柔らかい/乾いている等）
・思想・価値観の方向性
・何を削ぎ落とすか・何を残すか
・改行・余白の使い方
・文章の温度感・強度
・好むテーマの傾向・避ける方向性`;

    const result = await model.generateContent(prompt);
    const cacheText = result.response.text();

    // Supabaseに保存
    const supabase = await createServerSupabase();
    const upsertData = isTrip
      ? {
          user_id: userId,
          trip_cache: cacheText,
          trip_updated_at: new Date().toISOString(),
          trip_file_count: loadedCount,
        }
      : {
          user_id: userId,
          sensibility_cache: cacheText,
          sensibility_updated_at: new Date().toISOString(),
          sensibility_file_count: loadedCount,
        };
    const { error: dbError } = await supabase
      .from('user_profiles')
      .upsert(upsertData, { onConflict: 'user_id' });

    if (dbError) {
      console.error('Supabase保存エラー:', dbError);
      throw new Error(`データベース保存エラー: ${dbError.message}`);
    }

    return NextResponse.json({
      success: true,
      scanType: isTrip ? 'trip' : 'sensibility',
      totalFound: allFiles.length,
      fileCount: loadedCount,
      cacheLength: cacheText.length,
      fileList,
      loadedFiles,
      skippedFiles,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
