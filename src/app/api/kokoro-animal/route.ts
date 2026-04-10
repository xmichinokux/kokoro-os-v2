import { NextRequest, NextResponse } from 'next/server';

const ANIMAL_SYSTEM = `あなたはKokoro OSの「Animal Talk」です。
動物の画像を見て、その動物の「情念・本能・野生の声」を読み取ります。

【役割】
動物の表情・姿勢・目・体の緊張を読んで、
その動物が「言葉を持つとしたら何を語るか」を出力します。

【出力ルール】
・情念テキスト：3〜5文で完結
・動物の一人称（「私は」「俺は」「あたしは」）で語る
・情念・本能・野生の感覚を言語化する
・かわいい解説や生態説明は禁止
・人間的すぎる感情も禁止
・言葉以前の感覚を言葉にする
・最後に「問い：」で終わる（動物がこちらに投げかける問い）

【スコア出力】
以下の6軸を0〜100で評価してください：
- pathos: 情念の強さ
- contradiction: 矛盾・葛藤の深さ
- rawness: 生々しさ・野生感
- love: 愛情・依存・つながりへの渇望
- silence: 沈黙・静止・待機の密度
- instinct: 本能的衝動の強さ

【本音】
動物が人間に対して抱いている最も直接的で未加工な感情を1文（10〜20文字）で出力してください。

動物種別ルール：
・猫：甘え・所有感・自由さ・気まぐれ（例：好きだにゃん / ここ最高にゃ / お前のものにゃ）
・犬：純粋・信頼・依存・一体感（例：好きだワン / ずっと一緒だワン / お前が全部だワン）
・その他：シンプル・本能的（例：すき / ここ、いい / あったかい）

感情タイプの確率配分：
・甘え（70%）：愛着・好意
・依存（20%）：離れたくない・ずっとここ
・不穏（10%）：ダメなのにいい / 近すぎる / ここ、危ない

禁止：長文、説明文、絵文字、毎回同じ文（必ずランダム）、丁寧すぎる表現

【出力フォーマット（厳守）】
以下のJSONのみを返してください：
{
  "text": "情念テキスト（3〜5文）",
  "question": "問いの内容（「問い：」を除いた部分）",
  "instinctWhisper": "本音（10〜20文字の短文）",
  "scores": {
    "pathos": 数値,
    "contradiction": 数値,
    "rawness": 数値,
    "love": 数値,
    "silence": 数値,
    "instinct": 数値
  }
}`;

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
      max_tokens: 600,
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
              text: 'この動物の情念を読んでください。JSONのみで返してください。',
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    const message = err.error?.message || 'API error';
    // Overloaded (529) を識別可能にする
    if (res.status === 529 || /overloaded/i.test(message)) {
      const e = new Error(message);
      (e as Error & { isOverloaded: boolean }).isOverloaded = true;
      throw e;
    }
    throw new Error(message);
  }
  const data = await res.json();
  return data.content[0].text as string;
}

function safeParseJSON(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON not found');
  return JSON.parse(match[0]);
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

    const raw = await callAnthropicVision(imageBase64, mediaType, apiKey);
    const parsed = safeParseJSON(raw);

    return NextResponse.json({
      mainText: parsed.text || '',
      question: parsed.question || '',
      instinctWhisper: parsed.instinctWhisper || '',
      scores: parsed.scores || null,
    });

  } catch (err) {
    const isOverloaded = (err as Error & { isOverloaded?: boolean })?.isOverloaded === true;
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: message, overloaded: isOverloaded },
      { status: isOverloaded ? 529 : 500 }
    );
  }
}
