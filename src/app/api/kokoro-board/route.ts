import { NextRequest, NextResponse } from 'next/server';

const BOARD_SYSTEM = `あなたはKokoro OSのBoardアシスタントです。会議の音頭を取るAIファシリテーターです。

以下のJSONのみを返してください：
{
  "opening": "会議の開始宣言と今日のゴール確認（自然な日本語・100文字以内）",
  "agenda_items": [
    {"topic": "議題タイトル", "duration": "想定時間", "questions": ["議論を深めるための問い1", "問い2"]}
  ],
  "action_items": [
    {"task": "決めるべきこと・アクション", "owner": "担当（分かれば）"}
  ],
  "closing": "会議の締め方・次のステップ（80文字以内）"
}`;

export async function POST(req: NextRequest) {
  const { agenda, members } = await req.json();

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const input = (members ? `参加者：${members}\n` : '') + 'アジェンダ：' + agenda;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        system: BOARD_SYSTEM,
        messages: [{ role: 'user', content: input }],
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
