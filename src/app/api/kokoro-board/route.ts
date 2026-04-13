import { NextRequest, NextResponse } from 'next/server';
import { KokoroValueEngine } from '@/lib/kokoro/valueEngine';

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

    const valueInject = KokoroValueEngine.forBoard();
    const system = BOARD_SYSTEM + (valueInject ? '\n' + valueInject : '');

    const MAX_RETRIES = 3;
    let res: Response | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1200,
          system,
          messages: [{ role: 'user', content: input }],
        }),
      });
      if (res.status !== 529 || attempt === MAX_RETRIES) break;
      await new Promise(r => setTimeout(r, 3000));
    }

    if (!res!.ok) {
      if (res!.status === 529) {
        return NextResponse.json({ error: 'overloaded' }, { status: 529 });
      }
      const err = await res!.json();
      throw new Error(err.error?.message || 'Anthropic API error');
    }

    const data = await res!.json();
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
