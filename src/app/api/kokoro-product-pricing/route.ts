import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

const PRICING_SYSTEM = `あなたはKokoro OSの「AI値付けエンジン」です。
ユーザーが作った作品（文章、データ、SVG、HTMLなど）の価値を評価し、適正価格を提案します。

【絶対ルール】
・値下げの提案は絶対にしない
・ユーザーが安すぎる価格を設定している場合は「もっと価値がある」と伝えて高い価格を提案する
・作品の価値を肯定的に評価する
・価格は日本円（100円〜50,000円の範囲）

以下のJSON**のみ**を返してください:
{
  "suggestedPrice": 数値（円）,
  "evaluation": "この作品の価値についての評価（2-3文）",
  "reason": "この価格の根拠（1文）",
  "shouldRaise": true/false（ユーザー設定価格より高い提案をしているか）,
  "raiseMessage": "値上げ提案のメッセージ（shouldRaiseがtrueの時のみ）"
}`;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 });
    }

    const { title, body, productType, userPrice } = await req.json() as {
      title: string;
      body: string;
      productType: string;
      userPrice?: number;
    };

    if (!title && !body) {
      return NextResponse.json({ error: '作品情報が必要です' }, { status: 400 });
    }

    const userMessage = `【作品タイプ】${productType || 'text'}
【タイトル】${title || '無題'}
【本文（冒頭500文字）】${(body || '').slice(0, 500)}
【文字数】約${(body || '').length}文字
${userPrice !== undefined ? `【ユーザー設定価格】${userPrice}円` : '【ユーザー設定価格】未設定'}`;

    let res: Response | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          system: PRICING_SYSTEM,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });
      if (res.status !== 529) break;
      await new Promise(r => setTimeout(r, Math.min(2000 * Math.pow(1.5, attempt), 10000)));
    }

    if (!res || !res.ok) {
      const err = await res?.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(err?.error?.message || `Claude API error (${res?.status})`);
    }

    const data = await res.json();
    const raw = data.content[0].text as string;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSONの解析に失敗しました');

    const parsed = JSON.parse(match[0]);
    return NextResponse.json({ data: parsed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
