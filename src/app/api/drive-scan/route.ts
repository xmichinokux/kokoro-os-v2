import { GoogleGenerativeAI } from '@google/generative-ai';
import { google } from 'googleapis';
import { createServerSupabase } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
    }

    const { accessToken, userId } = await req.json();
    if (!accessToken) {
      return NextResponse.json({ error: 'Googleアクセストークンがありません' }, { status: 401 });
    }
    if (!userId) {
      return NextResponse.json({ error: 'ユーザーIDがありません' }, { status: 401 });
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth });

    // 全テキストファイルを取得（最大50ファイル、最新順）
    const filesRes = await drive.files.list({
      q: "mimeType='text/plain' or mimeType='application/vnd.google-apps.document'",
      fields: 'files(id, name, mimeType, modifiedTime)',
      pageSize: 50,
      orderBy: 'modifiedTime desc',
    });

    const files = filesRes.data.files || [];

    // ファイルの内容を読み込む（最大20ファイル・合計30000文字）
    let allContent = '';
    let loadedCount = 0;

    for (const file of files.slice(0, 20)) {
      if (allContent.length > 30000) break;
      try {
        let content = '';
        if (file.mimeType === 'application/vnd.google-apps.document') {
          const res = await drive.files.export({
            fileId: file.id!,
            mimeType: 'text/plain',
          });
          content = String(res.data);
        } else {
          const res = await drive.files.get({
            fileId: file.id!,
            alt: 'media',
          });
          content = String(res.data);
        }
        allContent += `\n\n[${file.name}]\n${content.slice(0, 2000)}`;
        loadedCount++;
      } catch (e) {
        console.error(`スキップ: ${file.name}`, e);
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
      fileCount: loadedCount,
      cacheLength: sensibilityCache.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
