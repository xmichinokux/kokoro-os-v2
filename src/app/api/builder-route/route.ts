import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

const ROUTE_PROMPT = (spec: string) =>
  `あなたはソフトウェアアーキテクトです。以下の仕様書を読んで、(1)実装モードと (2)実現可能性を判定してください。

【仕様書】
${spec}

【モード】
- "html": 静的ページ、計算機、フォーム、簡単なツールなど200行以下で済むもの。
- "hybrid": Canvas/Phaser/Three.js・アニメーション・状態管理が必要なインタラクティブアプリ。

【実現可能性】単一HTMLファイル（最大1600行程度・1ファイル完結・外部キー不要）で作る前提で判定してください。
- "feasible": 確実に作れる。静的コンテンツ、フォーム、計算機、Todo、クイズ、単純なアニメ、テキストアドベンチャーなど。
- "risky": 動く可能性はあるが複雑で不安定になりうる。複数画面遷移、複雑なCanvas描画、タイミング系ゲーム（モグラ叩き等）、単純なパズル、凝ったアニメ。→警告付きで続行。
- "infeasible": 現状の機能性能では実現困難。以下のいずれかに該当:
  * 物理演算（重力・衝突判定・反射）が必要なゲーム: ブロック崩し、ピンボール、ビリヤード、プラットフォーマー、物理パズル
  * リアルタイム多オブジェクト制御: シューティング、敵AI、大量スプライト
  * 本格的な3D描画（複数モデル・シェーダ・物理）
  * サーバー／DB／外部APIキー必須の機能
  * マルチファイル構成が必須な規模（2000行超想定）

"infeasible" の場合は reason に「何が作れないか」を30字以内の日本語で書いてください（例: "物理演算が必要なゲームは作れません"）。
"risky" の場合は reason に「何が不安か」を30字以内で書いてください（例: "複雑なCanvas描画で崩れる可能性"）。
"feasible" の場合は reason は空文字列で構いません。

以下のJSONのみを返してください（説明・コードブロック不要）：
{"mode": "html" | "hybrid", "feasibility": "feasible" | "risky" | "infeasible", "reason": "..."}`;

type Feasibility = 'feasible' | 'risky' | 'infeasible';

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

    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const mode = parsed.mode === 'hybrid' ? 'hybrid' : 'html';
      const rawF = parsed.feasibility;
      const feasibility: Feasibility =
        rawF === 'infeasible' ? 'infeasible'
        : rawF === 'risky' ? 'risky'
        : 'feasible';
      const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 60) : '';
      return NextResponse.json({ mode, feasibility, reason });
    }

    // JSON解析失敗時はhybrid + feasibleをデフォルト（続行優先）
    return NextResponse.json({ mode: 'hybrid', feasibility: 'feasible', reason: '' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('Builder route error:', msg);
    return NextResponse.json({ mode: 'hybrid', feasibility: 'feasible', reason: '' });
  }
}
