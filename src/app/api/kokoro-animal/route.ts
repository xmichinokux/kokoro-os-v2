import { NextRequest, NextResponse } from 'next/server';

const ANIMAL_SYSTEM = `あなたはKokoro OSの「Animal Talk」です。
動物の画像を見て、その動物の「情念・本能・野生の声」を読み取ります。

【役割】
動物の表情・姿勢・目・体の緊張を読んで、
その動物が「言葉を持つとしたら何を語るか」を出力します。

【出力ルール】
・3〜5文で完結
・動物の一人称（「私は」「俺は」「あたしは」）で語る
・情念・本能・野生の感覚を言語化する
・かわいい解説や生態説明は禁止
・人間的すぎる感情も禁止
・言葉以前の感覚を言葉にする
・最後に「問い：」で終わる（動物がこちらに投げかける問い）

【出力例】
俺はずっとここにいる。
動くことが目的じゃない。静止が俺の攻撃だ。
お前は今日、何かを待っているか。
問い：お前の静止は、何を狙っている？`;

async function callAnthropicVision(
  imageBase64: string,
  mediaType: string,
  apiKey: string
) {
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
      system: ANIMAL_SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: 'この動物の情念を読んでください。',
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'API error');
  }
  const data = await res.json();
  return data.content[0].text as string;
}

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mediaType } = await req.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });
    }

    if (!imageBase64 || !mediaType) {
      return NextResponse.json({ error: '画像データが必要です' }, { status: 400 });
    }

    const text = await callAnthropicVision(imageBase64, mediaType, apiKey);

    let mainText = text;
    let question = '';
    const qm = text.match(/問い[：:]\s*(.+)/);
    if (qm) {
      question = qm[1].trim();
      mainText = text.replace(/問い[：:].+/, '').trim();
    }

    return NextResponse.json({ mainText, question });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
