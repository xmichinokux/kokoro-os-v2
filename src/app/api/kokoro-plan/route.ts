import { NextRequest, NextResponse } from 'next/server';
import { KokoroValueEngine } from '@/lib/kokoro/valueEngine';

function safeParseJSON(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON not found in response');
  return JSON.parse(match[0]);
}

export async function POST(req: NextRequest) {
  const { goal, heat, grain, motive, notDoList } = await req.json() as {
    goal: string;
    heat: number;
    grain: number;
    motive?: string;
    notDoList?: string;
  };

  const valueInject = KokoroValueEngine.forPlan();

  const motiveBlock = motive && motive.trim()
    ? `\n【動機（このゴールを選んだ理由）】\n${motive.trim()}\n→ タスクはこの動機を裏切らないように設計する`
    : '';
  const notDoBlock = notDoList && notDoList.trim()
    ? `\n【やらないと決めていること】\n${notDoList.trim()}\n→ これらを含むタスクは絶対に生成しない`
    : '';

  const system = `あなたはKokoro OSのPlanアシスタントです。
ユーザーの目標を実行可能なタスクに分解してください。

設定：
・熱量レベル: ${heat}/5（高いほど野心的なタスク量）
・粒度レベル: ${grain}/5（高いほど細かいタスク）
${motiveBlock}${notDoBlock}
${valueInject ? '\n' + valueInject + '\n' : ''}
タスク数の目安：熱量${heat}×粒度${grain}に応じて5〜15個

必ず以下のJSON形式のみを返してください。説明文や前置きは一切含めないでください：
{"tasks":[{"text":"タスク内容","estimate":"所要時間の目安","priority":"high/mid/low"},...]}`;

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
        system,
        messages: [{ role: 'user', content: goal }],
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Anthropic API error');
    }

    const data = await res.json();
    const raw = data.content[0].text as string;
    const parsed = safeParseJSON(raw);

    return NextResponse.json({ tasks: parsed.tasks ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
