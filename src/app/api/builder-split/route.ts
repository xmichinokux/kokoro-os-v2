import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 60;

const DESIGN_PROMPT = (spec: string, aestheticMap: string) =>
  `あなたは優秀なソフトウェアアーキテクトです。
以下の仕様書を読んで、実装のための詳細な設計書を作成してください。
使用ライブラリ・アーキテクチャ・データ構造・処理フローを明確に定義してください。

【仕様書】
${spec}
${aestheticMap ? `
【ユーザーの美意識・感性マップ】
以下はユーザーの創作物から分析した美的感覚・価値観・構造化の傾向です。
設計書のUI/UXデザイン方針（配色・余白・アニメーション・テキストのトーン・情報の構造化）に、この美意識を反映してください。

${aestheticMap}
` : ''}
【設計書に含めること】
・使用するライブラリとそのバージョン（CDN URL）
・全体のアーキテクチャ（クラス構成・モジュール構成）
・主要なデータ構造（変数・オブジェクトの定義）
・処理フロー（初期化→メインループ→イベント処理）
・画面構成（HTML/CSS の構造）
・UI/UXデザイン方針（配色・フォント・余白・アニメーション）
・外部リソース（フォント・画像・音声など）
・エラーハンドリング方針`;

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.filter((p: { text?: string }) => p.text)
    ?.map((p: { text: string }) => p.text)
    ?.join('') ?? '';

  if (!text) throw new Error('Geminiから応答がありませんでした');
  return text.trim();
}

// Supabaseから感性マップを取得
async function fetchAestheticMap(): Promise<string> {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return '';

    const { data } = await supabase
      .from('user_profiles')
      .select('sensibility_cache, sensibility_thought_cache, sensibility_structure_cache')
      .eq('user_id', user.id)
      .single();

    const parts: string[] = [];
    if (data?.sensibility_cache) {
      parts.push(`【文章の感性】\n${data.sensibility_cache}`);
    }
    if (data?.sensibility_thought_cache) {
      parts.push(`【思想・価値観】\n${data.sensibility_thought_cache}`);
    }
    if (data?.sensibility_structure_cache) {
      parts.push(`【構造化の傾向】\n${data.sensibility_structure_cache}`);
    }

    const combined = parts.join('\n\n');
    // プロンプトが大きくなりすぎないよう3000文字に制限
    return combined.length > 3000 ? combined.slice(0, 3000) + '...(省略)' : combined;
  } catch {
    return '';
  }
}

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
    }

    const { spec } = await req.json() as { spec: string };

    if (!spec) {
      return NextResponse.json({ error: '仕様書が必要です' }, { status: 400 });
    }

    // 感性マップを取得（失敗しても続行）
    const aestheticMap = await fetchAestheticMap();

    const designDoc = await callGemini(geminiKey, DESIGN_PROMPT(spec, aestheticMap));

    return NextResponse.json({ designDoc });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
