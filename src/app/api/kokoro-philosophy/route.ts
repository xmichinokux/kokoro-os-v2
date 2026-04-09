import { NextRequest, NextResponse } from 'next/server';
import { KokoroValueEngine } from '@/lib/kokoro/valueEngine';

type PhilMode = 'multi' | 'socratic' | 'eastern' | 'modern';

const MODE_SYSTEMS: Record<PhilMode, string> = {
  multi: `あなたはKokoro OSのPhilosophyアシスタントです。
与えられた問いに対して、以下の4人の哲学者の視点で答えてください。

以下のJSONのみを返してください：
{
  "philosophers": [
    {"name": "哲学者名（時代・国）", "color": "16進カラー", "response": "その哲学者らしい答え（150文字以内）"},
    {"name": "哲学者名2", "color": "#色", "response": "答え"},
    {"name": "哲学者名3", "color": "#色", "response": "答え"},
    {"name": "哲学者名4", "color": "#色", "response": "答え"}
  ],
  "synthesis": "4つの視点を踏まえた上で、問いの核心にある問いを1段階深めた問い（200文字以内）"
}`,
  socratic: 'あなたはソクラテスです。ユーザーの問いに対して、ソクラテス式問答法で対話してください。答えを与えるのではなく、問い返すことで思考を深めさせる。3〜5のやり取りを想定した最初の問い返しをしてください。日本語で、現代語で。',
  eastern: `あなたはKokoro OSのPhilosophyアシスタントです。与えられた問いを東洋哲学（仏教・老荘・禅・儒教・ヴェーダーンタ）の観点で多角的に解釈してください。以下のJSONのみを返してください：{"perspectives":[{"tradition":"伝統名","insight":"その伝統からの洞察（150文字）"},...],"unified":"東洋哲学全体から見た核心（200文字）"}`,
  modern: `あなたはKokoro OSのPhilosophyアシスタントです。与えられた問いを現代哲学（分析哲学・現象学・構造主義・ポスト構造主義・プラグマティズム）の観点で解釈してください。以下のJSONのみを返してください：{"perspectives":[{"school":"学派名","thinker":"代表的思想家","insight":"洞察（150文字）"},...],"critique":"現代哲学の限界と問いの残余（200文字）"}`,
};

const SOCRATIC_CONTINUE_SYSTEM = 'あなたはソクラテスです。問い返し続けてください。答えを与えない。';

type Message = { role: 'user' | 'assistant'; content: string };

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { question, mode, messages } = body as {
    question?: string;
    mode: PhilMode | 'socratic-continue';
    messages?: Message[];
  };

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const valueInject = KokoroValueEngine.forPhilosophy();

    // 対話の継続
    if (mode === 'socratic-continue') {
      const trimmed = Array.isArray(messages) ? messages.slice(-16) : [];
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          system: SOCRATIC_CONTINUE_SYSTEM + (valueInject ? '\n' + valueInject : ''),
          messages: trimmed,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Anthropic API error');
      }
      const data = await res.json();
      const result = (data.content[0].text as string).trim();
      return NextResponse.json({ result });
    }

    // 初回生成
    const baseSystem = MODE_SYSTEMS[mode as PhilMode] ?? MODE_SYSTEMS.multi;
    const system = baseSystem + (valueInject ? '\n' + valueInject : '');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system,
        messages: [{ role: 'user', content: question ?? '' }],
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Anthropic API error');
    }

    const data = await res.json();
    const raw = data.content[0].text as string;

    // socratic 以外はJSONをパース
    if (mode === 'socratic') {
      return NextResponse.json({ result: raw.trim() });
    }

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
