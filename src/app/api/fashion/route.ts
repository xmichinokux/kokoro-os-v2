import { NextRequest, NextResponse } from 'next/server';
import type { KokoroProfile } from '@/lib/profile';
import { buildFashionProfileContext, type KokoroUserProfile } from '@/lib/profileTypes';

const FASHION_SYSTEM = `あなたはKokoro OSの「Fashion」診断AIです。

【役割】
服の正誤判定ではなく「その人の内面が外側にどう出ているか」を読む。
画像・テキスト・プロフィールから、その人の「装い」に宿る人格を言語化する。

【スタイル名】
「〇〇な△△」形式で人格表現にする。
例：「静かな狂気を日常に偽装する人」「柔らかさの中に刃を隠す人」

【禁止事項】
- 「似合っています」「おしゃれです」だけの文章
- 一般的なファッションアドバイス
- ブランド推奨

【文体】
やや詩的だが意味が通る。断定はしない。余白を残す。

【出力フォーマット（厳守）】
以下のJSONのみを返してください：
{
  "styleName": "スタイル名（〇〇な△△形式）",
  "keywords": ["キーワード3〜5個"],
  "summary": "一言総評（1〜2文）",
  "scores": {
    "styleMatch": 0〜100の数値,
    "realityFit": 0〜100の数値
  },
  "details": {
    "goodPoints": "良い点（2〜3文）",
    "mismatches": "ズレている点 / 改善提案（2〜3文）",
    "impression": "画像/テキストから読んだ印象（2〜3文）",
    "ageVision": "年齢・文脈のビジョン（1〜2文）"
  },
  "inferredUpdate": {
    "fashion_axes": { "rawness": 0〜1, "silence": 0〜1, "contradiction": 0〜1, "polish": 0〜1 },
    "taste_clusters": ["クラスター名"],
    "emotional_pattern": "パターン名"
  }
}`;

function buildUserMessage(
  textInput?: string,
  profile?: KokoroProfile,
  hasImage?: boolean,
  kokoroProfile?: KokoroUserProfile | null
): string {
  const parts: string[] = [];

  // ユーザー主導型プロフィール（/kokoro-profile）を最優先でプロンプト先頭に付与
  const userProfileCtx = buildFashionProfileContext(kokoroProfile ?? null);
  if (userProfileCtx) {
    parts.push(userProfileCtx);
  }

  if (hasImage) {
    parts.push('【画像あり】添付画像のファッションを診断してください。');
  }

  if (textInput) {
    parts.push(`【ユーザーの言葉】\n${textInput}`);
  }

  if (profile) {
    const ctx: string[] = [];
    if (profile.explicit.age_range) ctx.push(`年齢層: ${profile.explicit.age_range}`);
    if (profile.explicit.gender_expression) ctx.push(`表現: ${profile.explicit.gender_expression}`);
    if (profile.explicit.style_keywords?.length) ctx.push(`スタイル: ${profile.explicit.style_keywords.join(', ')}`);
    if (profile.explicit.favorite_things?.length) ctx.push(`好きなもの: ${profile.explicit.favorite_things.join(', ')}`);
    if (profile.explicit.life_context) ctx.push(`文脈: ${profile.explicit.life_context}`);
    if (profile.inferred.emotional_pattern) ctx.push(`感情パターン: ${profile.inferred.emotional_pattern}`);
    if (profile.inferred.taste_clusters?.length) ctx.push(`趣味クラスター: ${profile.inferred.taste_clusters.join(', ')}`);
    if (ctx.length > 0) {
      parts.push(`【プロフィール情報】\n${ctx.join('\n')}`);
    }
  }

  if (!hasImage && !textInput) {
    parts.push('プロフィール情報のみで暫定診断をしてください。');
  }

  parts.push('\nJSONのみで返してください。');
  return parts.join('\n\n');
}

function safeParseJSON(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON not found');
  return JSON.parse(match[0]);
}

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, imageMediaType, textInput, profile, kokoroProfile } = await req.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });
    }

    if (!imageBase64 && !textInput) {
      return NextResponse.json({ error: '画像またはテキストを入力してください' }, { status: 400 });
    }

    const hasImage = !!(imageBase64 && imageMediaType);
    const userText = buildUserMessage(textInput, profile, hasImage, kokoroProfile);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content: any[] = [];
    if (hasImage) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageMediaType,
          data: imageBase64,
        },
      });
    }
    content.push({ type: 'text', text: userText });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: FASHION_SYSTEM,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Anthropic API error');
    }

    const data = await res.json();
    const raw = data.content[0].text as string;
    const parsed = safeParseJSON(raw);

    return NextResponse.json({
      styleName: parsed.styleName || '',
      keywords: parsed.keywords || [],
      summary: parsed.summary || '',
      scores: parsed.scores || { styleMatch: 0, realityFit: 0 },
      details: parsed.details || {},
      inferredUpdate: parsed.inferredUpdate || {},
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
