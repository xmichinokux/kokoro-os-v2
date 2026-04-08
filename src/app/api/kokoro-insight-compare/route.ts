import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { summary, cfMode } = await req.json();
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ text: '' });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        system: `あなたはKokoro Insight Engineの5君です。複数の作品の判定結果を比較して、「なぜAは本物でBは偽物か」「両者の断絶はどこにあるか」を3〜4文で断定してください。${cfMode ? 'Context-Filterが有効なため毒舌モードで。' : ''}JSONではなく純粋なテキストで返してください。`,
        messages: [{ role: 'user', content: `以下の作品を比較してください：\n${summary}\nContext-Filter: ${cfMode ? 'ON（伝説の去勢モード）' : 'OFF'}` }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ text: '' });
    }

    const data = await res.json();
    const text = data.content?.[0]?.type === 'text' ? data.content[0].text : '';
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ text: '' });
  }
}
