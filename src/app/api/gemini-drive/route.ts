import { GoogleGenerativeAI } from '@google/generative-ai';
import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
    }

    const { prompt, accessToken } = await req.json();
    if (!prompt) {
      return NextResponse.json({ error: 'プロンプトが空です' }, { status: 400 });
    }
    if (!accessToken) {
      return NextResponse.json({ error: 'Googleアクセストークンがありません。Googleでログインしてください。' }, { status: 401 });
    }

    // Google Drive APIでzineフォルダを検索
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const drive = google.drive({ version: 'v3', auth });

    // zineフォルダを検索
    const folderRes = await drive.files.list({
      q: "name='zine' and mimeType='application/vnd.google-apps.folder'",
      fields: 'files(id, name)',
    });

    const folder = folderRes.data.files?.[0];
    if (!folder) {
      return NextResponse.json({ error: 'Googleドライブに「zine」フォルダが見つかりません' }, { status: 404 });
    }

    // フォルダ内のファイルを取得（テキスト系のみ）
    const filesRes = await drive.files.list({
      q: `'${folder.id}' in parents and (mimeType='text/plain' or mimeType='application/vnd.google-apps.document')`,
      fields: 'files(id, name, mimeType)',
      pageSize: 10,
    });

    const files = filesRes.data.files || [];

    // ファイルの内容を読み込む（最大5ファイル）
    let driveContext = '';
    for (const file of files.slice(0, 5)) {
      try {
        if (file.mimeType === 'application/vnd.google-apps.document') {
          // Google Docsの場合はテキストでエクスポート
          const content = await drive.files.export({
            fileId: file.id!,
            mimeType: 'text/plain',
          });
          driveContext += `\n\n[${file.name}]\n${content.data}`;
        } else {
          // テキストファイルの場合
          const content = await drive.files.get({
            fileId: file.id!,
            alt: 'media',
          });
          driveContext += `\n\n[${file.name}]\n${content.data}`;
        }
      } catch (e) {
        console.error(`ファイル読み込みエラー: ${file.name}`, e);
      }
    }

    // コンテキストを8000文字に制限
    if (driveContext.length > 8000) {
      driveContext = driveContext.slice(0, 8000) + '...(省略)';
    }

    // Gemini APIに渡す
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const fullPrompt = driveContext
      ? `以下はユーザーの過去の文章・ZINEの内容です。このユーザーの文体・思想・センスを参考にして、最後のリクエストに答えてください。\n\n${driveContext}\n\n---\n\n${prompt}`
      : prompt;

    const result = await model.generateContent(fullPrompt);
    const text = result.response.text();

    return NextResponse.json({
      text,
      filesLoaded: files.slice(0, 5).map(f => f.name),
      contextLength: driveContext.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
