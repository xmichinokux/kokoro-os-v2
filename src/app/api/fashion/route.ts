import { NextRequest, NextResponse } from 'next/server';
import type { KokoroProfile } from '@/lib/profile';
import { buildFashionProfileContext, type KokoroUserProfile } from '@/lib/profileTypes';

export const maxDuration = 30;

type Mode = 'check' | 'coord' | 'brand' | 'next';

const SYSTEM_CHECK = `あなたはKokoro OSの「Fashion」診断AIです。
服の正誤判定ではなく「その人の内面が外側にどう出ているか」を読む。

【2層採点】
① スタイル純度スコア（0〜100）— 美学的理想との純粋な一致度。意図的なズレは加点、方向性のない外れは減点
② 現実適合スコア（0〜100）— 年齢・居住地・ライフスタイルを考慮した現実的な評価
- 50代であれば「激情を抑制した大人の解釈」はむしろ高評価
- 「完全な理想形ではないが、この人の現実の中ではベスト」という視点

【文体】
やや詩的だが意味が通る。断定はしない。余白を残す。

【出力フォーマット（厳守）】JSONのみを返してください。
{
  "styleName": "スタイル名（〇〇な△△形式）",
  "keywords": ["キーワード3〜5個"],
  "summary": "一言総評（1〜2文）",
  "scores": {
    "styleMatch": 0〜100,
    "realityFit": 0〜100
  },
  "details": {
    "goodPoints": "良い点（2〜3文）",
    "mismatches": "ズレている点 / 改善提案（2〜3文）",
    "impression": "画像/テキストから読んだ印象（2〜3文）",
    "ageVision": "この年齢・文脈でのビジョン（1〜2文）"
  },
  "inferredUpdate": {
    "fashion_axes": { "rawness": 0〜1, "silence": 0〜1, "contradiction": 0〜1, "polish": 0〜1 },
    "taste_clusters": ["クラスター名"],
    "emotional_pattern": "パターン名"
  }
}`;

const SYSTEM_COORD = `あなたはKokoro OSの「Fashion」AIです。ユーザーのスタイル・プロフィールをもとに、今日のコーデを提案します。

【重要】
- スタイル名の世界観を「今日という現実」に着地させる
- 「整いすぎない」「意味のあるズレを1つ入れる」
- 実際に手持ちの服で再現できる提案にする
- 既存のファッション用語より「その人らしい言語」で語る

【出力形式】JSONのみ返してください。
{
  "main": "今日のコーデ説明（上・下・アウター・小物など具体的に。3〜5文）",
  "point": "今日のコーデのポイント・着こなしの注意点（2〜3文）",
  "leap": "このコーデとスタイルの接続・意図的なズレの説明（1〜2文）"
}`;

const SYSTEM_BRAND = `あなたはKokoro OSの「Fashion」AIです。スタイル・プロフィールに合うブランドを提案します。

【重要】
- 「このスタイルに本質的に合う」ブランドを選ぶ
- メジャーすぎるブランドより「少し知る人ぞ知る」ブランドを優先
- 日本で実際に入手できるブランド・ショップを選ぶ
- 価格帯・入手しやすさの条件を必ず守る
- 避けるべき方向性も正直に言う

【出力形式】JSONのみ返してください。
{
  "brands": [
    {"name": "ブランド名", "desc": "なぜこのスタイルに合うか（1〜2文）", "price": "価格帯の目安"}
  ],
  "avoid": "避けるべきブランドや方向性（1〜2文）"
}
（brandsは3〜5件）`;

const SYSTEM_NEXT = `あなたはKokoro OSの「Fashion」AIです。スタイルと現在のワードローブから「次に買うべき一点」を断定的に提案します。

【重要】
- 迷わず断定する。「〜がいいかもしれません」は禁止
- 「足りない一点」ではなく「このスタイルを完成させる一点」
- 具体的なアイテム名で言う（「黒のトレンチコート」など）
- 「ズレた理由」を添える

【出力形式】JSONのみ返してください。
{
  "item": "買うべきアイテム名（具体的に。例：くすんだオリーブのコート）",
  "reason": "なぜそれが必要か・スタイルとの接続（2〜3文）",
  "leap": "飛躍ポイント（なぜそれが普通の選択と違うのか・1文）",
  "how": "具体的な選び方・注意点・色や素材の指定（2〜3文）"
}`;

function buildBaseContext(
  profile?: KokoroProfile,
  kokoroProfile?: KokoroUserProfile | null
): string {
  const parts: string[] = [];
  const userProfileCtx = buildFashionProfileContext(kokoroProfile ?? null);
  if (userProfileCtx) parts.push(userProfileCtx);

  if (profile) {
    const ctx: string[] = [];
    if (profile.explicit.age_range) ctx.push(`年齢層: ${profile.explicit.age_range}`);
    if (profile.explicit.gender_expression) ctx.push(`表現: ${profile.explicit.gender_expression}`);
    if (profile.explicit.style_keywords?.length) ctx.push(`スタイル: ${profile.explicit.style_keywords.join(', ')}`);
    if (profile.explicit.favorite_things?.length) ctx.push(`好きなもの: ${profile.explicit.favorite_things.join(', ')}`);
    if (profile.explicit.life_context) ctx.push(`文脈: ${profile.explicit.life_context}`);
    if (profile.inferred.emotional_pattern) ctx.push(`感情パターン: ${profile.inferred.emotional_pattern}`);
    if (profile.inferred.taste_clusters?.length) ctx.push(`趣味クラスター: ${profile.inferred.taste_clusters.join(', ')}`);
    if (ctx.length > 0) parts.push(`【暗黙プロフィール】\n${ctx.join('\n')}`);
  }

  return parts.join('\n\n');
}

function buildUserText(
  mode: Mode,
  baseCtx: string,
  opts: {
    textInput?: string;
    hasImage?: boolean;
    weather?: string;
    plan?: string;
    mood?: string;
    wardrobe?: string;
    budget?: string;
    access?: string;
  }
): string {
  const parts: string[] = [];
  if (baseCtx) parts.push(baseCtx);

  if (mode === 'check') {
    if (opts.hasImage) parts.push('【画像あり】添付画像のファッションを診断してください。');
    if (opts.textInput) parts.push(`【ユーザーの言葉】\n${opts.textInput}`);
    if (!opts.hasImage && !opts.textInput) parts.push('プロフィール情報のみで暫定診断をしてください。');
  } else if (mode === 'coord') {
    const lines: string[] = ['【今日の条件】'];
    if (opts.weather) lines.push(`天気: ${opts.weather}`);
    if (opts.plan) lines.push(`予定: ${opts.plan}`);
    if (opts.mood) lines.push(`気分: ${opts.mood}`);
    lines.push(opts.wardrobe ? `手持ちの服: ${opts.wardrobe}` : '（手持ちの服: 未入力）');
    parts.push(lines.join('\n'));
    parts.push('今日のコーデをJSONで提案してください。');
  } else if (mode === 'brand') {
    const lines: string[] = ['【条件】'];
    if (opts.budget) lines.push(`予算: ${opts.budget}`);
    if (opts.access) lines.push(`入手しやすさ: ${opts.access}`);
    parts.push(lines.join('\n'));
    parts.push('ブランド提案をJSONで返してください。');
  } else if (mode === 'next') {
    parts.push(opts.wardrobe ? `【今のワードローブ】\n${opts.wardrobe}` : '（ワードローブ: 未入力）');
    parts.push('次に買うべき一点をJSONで断定してください。');
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
    const body = await req.json();
    const {
      mode = 'check',
      imageBase64,
      imageMediaType,
      textInput,
      profile,
      kokoroProfile,
      weather,
      plan,
      mood,
      wardrobe,
      budget,
      access,
    } = body;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });
    }

    const hasImage = !!(imageBase64 && imageMediaType);

    if (mode === 'check' && !hasImage && !textInput) {
      return NextResponse.json({ error: '画像またはテキストを入力してください' }, { status: 400 });
    }

    let system: string;
    switch (mode as Mode) {
      case 'coord': system = SYSTEM_COORD; break;
      case 'brand': system = SYSTEM_BRAND; break;
      case 'next':  system = SYSTEM_NEXT;  break;
      case 'check':
      default:      system = SYSTEM_CHECK; break;
    }

    const baseCtx = buildBaseContext(profile, kokoroProfile);
    const userText = buildUserText(mode as Mode, baseCtx, {
      textInput, hasImage, weather, plan, mood, wardrobe, budget, access,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content: any[] = [];
    if (hasImage && mode === 'check') {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: imageMediaType, data: imageBase64 },
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
        max_tokens: 1200,
        system,
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

    if (mode === 'check') {
      return NextResponse.json({
        styleName: parsed.styleName || '',
        keywords: parsed.keywords || [],
        summary: parsed.summary || '',
        scores: parsed.scores || { styleMatch: 0, realityFit: 0 },
        details: parsed.details || {},
        inferredUpdate: parsed.inferredUpdate || {},
      });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
