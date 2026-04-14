import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

type ModuleInput = {
  id: number;
  name: string;
  description: string;
  dependencies: number[];
  implementation_notes: string;
};

const INTERFACE_PROMPT = (designDoc: string, modulesJson: string) =>
  `あなたは優秀なソフトウェアアーキテクトです。
以下の設計書とモジュール構成に基づいて、全モジュールのインターフェース定義（クラス名・メソッド名・プロパティ名・グローバル関数名）を生成してください。

【目的】
このインターフェース定義は、各モジュールを順番にコード生成する際の「設計図」として使います。
全モジュールがこのインターフェースに従って実装することで、モジュール間の整合性が保たれます。

【設計書】
${designDoc}

【モジュール構成】
${modulesJson}

【出力形式】
以下のような形式で、全モジュールのインターフェースを定義してください：

=== Module 1: モジュール名 ===
定義するもの:
- class ClassName extends ParentClass
  - constructor(引数)
  - method1(引数): 戻り値の説明
  - method2(引数): 戻り値の説明
  - property: 型の説明
- function functionName(引数): 戻り値の説明
- const CONSTANT_NAME = { 構造の説明 }

=== Module 2: モジュール名 ===
（Module 1で定義されたクラスを使用可能）
定義するもの:
- class ClassName2 extends Module1のClassName
  ...

【ルール】
・各モジュールで定義すべきクラス・関数・定数を全て列挙する
・メソッドの引数と戻り値を明記する
・モジュール間の依存関係を明確にする（「Module 1のXxxClassを使用」等）
・Phaserのシーンクラスにはkeyを明記する（例：super({ key: 'GameScene' })）
・export/importは使わない前提で書く（全てグローバルスコープ）
・アセットファイル（画像・音声）は存在しない前提。描画はプリミティブ（rectangle, circle, text）で行う
・クラス名は重複しないようにする
・テキスト形式で返す（JSONではない）
・マークダウンのコードブロックは使わない`;

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

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
    }

    const { designDoc, modules } = await req.json() as {
      designDoc: string;
      modules: ModuleInput[];
    };

    if (!designDoc || !modules || modules.length === 0) {
      return NextResponse.json({ error: '設計書とモジュール一覧が必要です' }, { status: 400 });
    }

    const modulesJson = modules
      .map(m => `Module ${m.id}: ${m.name}\n  説明: ${m.description}\n  依存: [${m.dependencies.join(', ')}]\n  注意: ${m.implementation_notes}`)
      .join('\n\n');

    const interfaceDoc = await callGemini(geminiKey, INTERFACE_PROMPT(designDoc, modulesJson));

    return NextResponse.json({ interfaceDoc });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
