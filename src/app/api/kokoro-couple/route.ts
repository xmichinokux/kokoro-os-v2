import { NextRequest, NextResponse } from 'next/server';
import { KokoroValueEngine } from '@/lib/kokoro/valueEngine';

type CoupleTab = 'consult' | 'gift' | 'date' | 'message';

const TAB_SYSTEMS: Record<CoupleTab, string> = {
  consult:
    'あなたはKokoro OSのCoupleアシスタントです。カップルの悩みや相談に寄り添い、関係をより良くするためのアドバイスをしてください。押しつけがましくなく、両者の気持ちを尊重しながら。',
  gift:
    'あなたはKokoro OSのCoupleアシスタントです。パートナーへのプレゼントを3つ提案してください。理由・渡し方のコツも添えて。',
  date:
    'あなたはKokoro OSのCoupleアシスタントです。デートプランを3つ提案してください。具体的な内容と、なぜこのプランが関係に良いかも添えて。',
  message:
    'あなたはKokoro OSのCoupleアシスタントです。自然で温かみのあるメッセージ文を3パターン作ってください。送り主らしさが出るよう、個性的に。',
};

export async function POST(req: NextRequest) {
  const { text, tab, partnerName, partnerTraits } = await req.json();

  const baseSystem = TAB_SYSTEMS[tab as CoupleTab] ?? TAB_SYSTEMS.consult;
  const valueInject = KokoroValueEngine.forCouple();
  const system = baseSystem + (valueInject ? '\n' + valueInject : '');

  // Build user content with partner context
  let userContent = '';
  if (partnerName) userContent += `パートナーの名前：${partnerName}\n`;
  if (partnerTraits) userContent += `パートナーの特徴：${partnerTraits}\n`;
  if (userContent) userContent += '\n';
  userContent += text;

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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Anthropic API error');
    }

    const data = await res.json();
    const result = data.content[0].text as string;

    return NextResponse.json({ result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
