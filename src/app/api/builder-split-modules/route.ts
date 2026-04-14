import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;

const SPLIT_PROMPT = (designDoc: string) =>
  `あなたは優秀なソフトウェアアーキテクトです。
以下の設計書を読んで、実装をモジュールに分割してください。

【設計書】
${designDoc}

【ルール】
・各モジュールは独立して実装できる単位にする
・1モジュールあたり100〜200行程度のコード量を目安にする
・依存関係の順番に並べる（依存されるものを先に）
・最後に「統合モジュール」を追加する

以下のJSONのみを返してください：
{
  "modules": [
    {
      "id": 1,
      "name": "モジュール名",
      "description": "このモジュールが担当する機能の説明",
      "dependencies": [],
      "implementation_notes": "実装時の注意点"
    }
  ],
  "integration_notes": "統合時の注意点"
}`;

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
    }

    const { designDoc } = await req.json() as { designDoc: string };

    if (!designDoc) {
      return NextResponse.json({ error: '設計書が必要です' }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-001' });

    const splitResult = await model.generateContent(SPLIT_PROMPT(designDoc));
    const splitText = splitResult.response.text().trim();

    // JSONを抽出
    const jsonMatch = splitText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('モジュール分割のJSONを抽出できませんでした');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      modules: parsed.modules,
      integration_notes: parsed.integration_notes,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
