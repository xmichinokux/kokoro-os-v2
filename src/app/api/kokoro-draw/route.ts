import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';

const STYLE_SUFFIXES: Record<string, string> = {
  auto:         '',
  photo:        ', photorealistic, photograph, DSLR, natural lighting, high resolution',
  illustration: ', illustration, anime style, digital art, vibrant colors, clean lines',
  art:          ', oil painting, fine art, masterpiece, artistic, gallery quality',
  minimal:      ', minimalist, simple, clean, whitespace, geometric, modern design',
  dark:         ', dark, cinematic, moody, dramatic lighting, film noir, atmospheric',
};

const PROMPT_SYSTEM = `あなたはStable Diffusion XL用のプロンプトエンジニアです。
ユーザーの入力を高品質な画像生成プロンプトに変換してください。

ルール：
・英語で出力する
・視覚的な描写を具体的に
・スタイル・照明・構図・品質を追加する
・ネガティブプロンプトも生成する

以下のJSONのみを返してください：
{
  "prompt": "英語のプロンプト, high quality, detailed, 8k",
  "negative_prompt": "low quality, blurry, ugly, deformed"
}`;

function safeParseJSON(raw: string): { prompt: string; negative_prompt: string } {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON not found in response');
  return JSON.parse(match[0]);
}

export async function POST(req: NextRequest) {
  try {
    const { text, style } = await req.json();

    if (!text || !text.trim()) {
      return NextResponse.json({ error: '入力テキストが必要です' }, { status: 400 });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 });
    }

    const replicateToken = process.env.REPLICATE_API_TOKEN;
    if (!replicateToken) {
      return NextResponse.json({ error: 'REPLICATE_API_TOKEN が設定されていません' }, { status: 500 });
    }

    // Step 1: Claude でプロンプト変換
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: PROMPT_SYSTEM,
        messages: [{ role: 'user', content: text.trim() }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.json();
      const message = err.error?.message || 'Claude API error';
      if (claudeRes.status === 529 || /overloaded/i.test(message)) {
        return NextResponse.json({ error: message, overloaded: true }, { status: 529 });
      }
      throw new Error(message);
    }

    const claudeData = await claudeRes.json();
    const raw = claudeData.content[0].text as string;
    const parsed = safeParseJSON(raw);

    // スタイルサフィックスを追加
    const styleSuffix = STYLE_SUFFIXES[style ?? 'auto'] ?? '';
    const finalPrompt = parsed.prompt + styleSuffix;

    // Step 2: Replicate で画像生成
    const replicate = new Replicate({ auth: replicateToken });

    const output = await replicate.run(
      'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc',
      {
        input: {
          prompt: finalPrompt,
          negative_prompt: parsed.negative_prompt,
          width: 1024,
          height: 1024,
          num_outputs: 1,
          guidance_scale: 7.5,
          num_inference_steps: 25,
        },
      }
    );

    // output は FileOutput オブジェクトの配列（新SDK）or 文字列URLの配列（旧SDK）
    const results = output as unknown[];
    let imageUrl: string | null = null;

    if (results && results[0]) {
      const first = results[0];
      if (typeof first === 'string') {
        imageUrl = first;
      } else if (typeof first === 'object' && first !== null) {
        // FileOutput: .url() or .toString()
        const fo = first as { url?: () => string; toString?: () => string };
        imageUrl = fo.url?.() ?? fo.toString?.() ?? null;
      }
    }

    if (!imageUrl) {
      throw new Error('画像URLが取得できませんでした');
    }

    return NextResponse.json({
      imageUrl,
      prompt: finalPrompt,
      negativePrompt: parsed.negative_prompt,
    });
  } catch (e) {
    const isOverloaded = (e as Error & { isOverloaded?: boolean })?.isOverloaded === true;
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json(
      { error: msg, overloaded: isOverloaded },
      { status: isOverloaded ? 529 : 500 }
    );
  }
}
