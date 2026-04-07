import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { body, apiKey } = await req.json();
  if (!body) return NextResponse.json({ title: '', tags: [] });

  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({
      title: body.slice(0, 15),
      tags: [],
    });
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `以下のメモから、タイトル（15文字以内）とタグ（2〜3個）を生成してください。
JSONのみ返してください。例: {"title": "自己認識のズレ", "tags": ["感情", "パターン"]}

メモ内容:
${body.slice(0, 300)}`
        }]
      }),
    });

    if (!res.ok) throw new Error('API error');

    const data = await res.json();
    const raw = data.content?.[0]?.text ?? '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return NextResponse.json({
        title: parsed.title ?? '',
        tags: parsed.tags ?? [],
      });
    }
  } catch {
    // フォールバック
  }

  return NextResponse.json({ title: body.slice(0, 15), tags: [] });
}
