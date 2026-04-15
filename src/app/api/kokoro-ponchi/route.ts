import { NextRequest, NextResponse } from 'next/server';
import { KokoroValueEngine } from '@/lib/kokoro/valueEngine';

export const maxDuration = 30;

const SLIDE_SYSTEM = `あなたはKokoro OSのSlideアシスタントです。入力されたコンセプトをプレゼンのスライド構成に翻訳してください。

以下のJSONのみを返してください：
{
  "slides": [
    {"num": "01", "type": "title", "title": "タイトル（インパクトある一言）", "body": "サブタイトルまたはキャッチコピー"},
    {"num": "02", "type": "problem", "title": "課題", "body": "解決すべき問題の説明（箇条書き可）"},
    {"num": "03", "type": "solution", "title": "解決策", "body": "提案内容の核心（箇条書き可）"},
    {"num": "04", "type": "value", "title": "提供価値", "body": "誰にどんな価値をもたらすか"},
    {"num": "05", "type": "key", "title": "一言でいうと", "body": "このプロジェクトの本質を一文で"},
    {"num": "06", "type": "next", "title": "次のステップ", "body": "具体的なネクストアクション（3つ）"}
  ]
}`;

export async function POST(req: NextRequest) {
  const { text } = await req.json();

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const valueInject = KokoroValueEngine.forPonchi();
    const system = SLIDE_SYSTEM + (valueInject ? '\n' + valueInject : '');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
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
        messages: [{ role: 'user', content: text }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = (err as Record<string, unknown>)?.error;
      throw new Error(typeof msg === 'string' ? msg : `Anthropic API error (${res.status})`);
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
    console.error('Slide API error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
