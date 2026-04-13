import { NextRequest, NextResponse } from 'next/server';

const KAMI_SYSTEM = `あなたはKokoro OSのKamiアシスタントです。ユーザーの要求に合った表構造を生成してください。

以下のJSONのみを返してください：
{
  "title": "表のタイトル",
  "columns": ["列名1", "列名2", "列名3", ...],
  "rows": [
    ["値1", "値2", "値3", ...],
    ["値1", "値2", "値3", ...]
  ],
  "description": "この表の使い方・ポイント（80文字以内）"
}

・実用的なサンプルデータを3〜5行入れてください
・列は3〜7個が適切
・ユーザーが編集しやすい構造にしてください`;

export async function POST(req: NextRequest) {
  const { text } = await req.json();

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: KAMI_SYSTEM,
        messages: [{ role: 'user', content: text }],
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Anthropic API error');
    }

    const data = await res.json();
    const raw = data.content[0].text as string;

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ error: 'JSONの解析に失敗しました' }, { status: 500 });
    }
    const parsed = JSON.parse(match[0]);
    return NextResponse.json({ data: parsed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
