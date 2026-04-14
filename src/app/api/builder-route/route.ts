import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

const ROUTE_PROMPT = (spec: string) =>
  `あなたはソフトウェアアーキテクトです。以下の仕様書を読んで、最適な実装モードを判定してください。

【仕様書】
${spec}

【モード一覧】
- "html": シンプルなコンテンツ。静的ページ、簡単なツール、計算機、フォームなど。200行以下で実装できるもの。
- "hybrid": 複雑なインタラクティブアプリ。ゲーム、アニメーション、複数画面、状態管理が必要なもの。Canvas/Phaser/Three.jsを使うもの。

以下のJSONのみを返してください（説明不要）：
{"mode": "html" or "hybrid"}`;

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

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: ROUTE_PROMPT(spec) }] }],
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

    // JSONを抽出
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const mode = parsed.mode === 'hybrid' ? 'hybrid' : 'html';
      return NextResponse.json({ mode });
    }

    // JSON解析失敗時はhybridをデフォルト（安全側）
    return NextResponse.json({ mode: 'hybrid' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    // ルーティング失敗時はhybridをデフォルト
    console.error('Builder route error:', msg);
    return NextResponse.json({ mode: 'hybrid' });
  }
}
