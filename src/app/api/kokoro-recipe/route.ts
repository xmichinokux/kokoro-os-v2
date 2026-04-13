import { NextRequest, NextResponse } from 'next/server';
import type { KokoroRecipeInput } from '@/types/recipe';
import { buildRecipeProfileContext, type KokoroUserProfile } from '@/lib/profileTypes';
import { KokoroValueEngine } from '@/lib/kokoro/valueEngine';

type RequestBody = KokoroRecipeInput & { kokoroProfile?: KokoroUserProfile | null };

const CONCEPT_MAP: Record<string, string> = {
  '停滞': '小さな変化の週',
  '不安': '安定と余白の週',
  '混乱': 'シンプル回復の週',
  '倦怠': '感覚を取り戻す週',
  '希望': '前に進む週',
  '孤独': '自分と向き合う週',
};

function safeParseJSON(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON not found in response');
  return JSON.parse(match[0]);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as RequestBody;
  const { kokoroProfile, ...input } = body;

  const sourceLabels: Record<string, string> = {
    talk: 'Talk由来', zen: 'Zen由来', note: 'Note由来', manual: '',
  };

  const emotionHint = input.emotionTone?.[0] ?? '';
  const weekConcept = CONCEPT_MAP[emotionHint] ?? '今週のための週';

  const profileCtx = buildRecipeProfileContext(kokoroProfile ?? null);

  const contextBlock = [
    profileCtx,
    input.relatedSummary ? `状態の要約: ${input.relatedSummary}` : '',
    input.currentTheme?.length ? `テーマ: ${input.currentTheme.join('、')}` : '',
    input.emotionTone?.length ? `感情トーン: ${input.emotionTone.join('、')}` : '',
    input.weeklyStateText ? `今週の状態: ${input.weeklyStateText}` : '',
  ].filter(Boolean).join('\n\n');

  const prompt = `あなたはKokoro OSのRecipeエンジンです。
料理は媒体ですが、本質は「内面状態に合う1週間の生活体験の設計」です。

以下の内面状態・文脈から、月〜日の7日分のレシピを生成してください。

${contextBlock}

重要ルール：
- 最適化（カロリー・時短）に寄せすぎない
- 週の流れを持たせる（月曜リセット、水曜に少し外す、金曜解放、日曜準備）
- 各日に「飛躍ポイント」（小さなズレ・意外な組み合わせ）を必ず入れる
- 「次の一手」は押し付けず、余韻と継続性を作る短い提案にする
- 家庭で実行可能であること
- 料理アプリに寄せすぎない（詩的な視点を残す）

以下のJSON形式のみで返答してください（コードブロック不要）：
{
  "weekConcept": "週全体のコンセプト（20文字以内）",
  "days": [
    {
      "day": "月",
      "title": "料理タイトル",
      "concept": "その日のコンセプト一文（30文字以内）",
      "ingredients": ["食材1", "食材2", "食材3"],
      "steps": ["手順1", "手順2", "手順3"],
      "leap": "飛躍ポイント（この料理の小さなズレや意外な視点）",
      "nextAction": "次の一手（食後や翌日への余韻、20文字以内）"
    }
  ]
}

月〜日の7日分を必ず生成してください。`;

  const valueInject = KokoroValueEngine.forRecipe();
  const finalPrompt = prompt + (valueInject ? '\n' + valueInject : '');

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
        max_tokens: 3000,
        messages: [{ role: 'user', content: finalPrompt }],
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
      weekConcept: parsed.weekConcept ?? weekConcept,
      sourceLabel: sourceLabels[input.source] ?? '',
      days: parsed.days ?? [],
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '生成に失敗しました' }, { status: 500 });
  }
}
