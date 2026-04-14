import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 60;

// 感性マップ取得
async function fetchAestheticMap(): Promise<string> {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return '';

    const { data } = await supabase
      .from('user_profiles')
      .select('sensibility_cache, sensibility_thought_cache, sensibility_structure_cache')
      .eq('user_id', user.id)
      .single();

    const parts: string[] = [];
    if (data?.sensibility_cache) parts.push(`【文章の感性】${data.sensibility_cache.slice(0, 600)}`);
    if (data?.sensibility_thought_cache) parts.push(`【思想・価値観】${data.sensibility_thought_cache.slice(0, 400)}`);
    if (data?.sensibility_structure_cache) parts.push(`【構造化の傾向】${data.sensibility_structure_cache.slice(0, 400)}`);
    return parts.join('\n');
  } catch {
    return '';
  }
}

type EffectInfo = {
  type: string;
  label: string;
  intensity: number;
  enabled: boolean;
};

const ADJUST_PROMPT = (currentEffects: EffectInfo[], aestheticMap: string, round: number, styleHint: string) =>
  `あなたは画像エフェクトの調整専門家です。
添付された画像を分析し、ユーザーの美的感覚により合うようにエフェクトパラメータを調整してください。

【現在のエフェクト設定】
${currentEffects.map(e => `- ${e.label}(${e.type}): ${e.enabled ? e.intensity : 'OFF'}`).join('\n')}

${styleHint ? `【ユーザーの意図するスタイル】\n${styleHint}\n` : ''}
${aestheticMap ? `【ユーザーの美意識・感性マップ】\n${aestheticMap}\n` : ''}
【調整ラウンド】${round}/3（${round === 1 ? '初回評価' : '前回の調整結果を評価'}）

【タスク】
1. 画像の現在の状態を評価してください
2. 感性マップやスタイルの意図と照らし合わせて、改善点を特定してください
3. エフェクトの intensity を調整してください（0-100）
4. 必要なら新しいエフェクトを追加するか、不要なエフェクトを無効化してください

【使用可能なエフェクト】
grayscale, sepia, invert, posterize, halftone, edgeDetect, pixelate, glitch,
duotone, noise, threshold, scanlines, brightness, contrast, saturation, rgbShift

【出力形式】JSONのみ（説明文不要）:
{
  "evaluation": "画像の現在の状態を1文で評価",
  "adjustments": "何をどう変えるかを1文で説明",
  "effects": [
    { "type": "エフェクト名", "intensity": 0-100, "enabled": true/false }
  ],
  "score": 0-100,
  "done": true/false
}

・score: 感性マップとの一致度（80以上なら十分）
・done: これ以上の調整が不要ならtrue
・effectsには現在のエフェクト＋追加したいエフェクトの全てを含めてください
・大きな変更（intensity ±30以上）は避け、段階的に調整してください`;

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
    }

    const { imageBase64, currentEffects, round, styleHint } = await req.json() as {
      imageBase64: string;       // data:image/png;base64,... の形式
      currentEffects: EffectInfo[];
      round: number;
      styleHint?: string;
    };

    if (!imageBase64) {
      return NextResponse.json({ error: '画像データが必要です' }, { status: 400 });
    }

    // base64 data URLからデータ部分を抽出
    const base64Match = imageBase64.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
    if (!base64Match) {
      return NextResponse.json({ error: '無効な画像データ形式です' }, { status: 400 });
    }
    const mimeType = `image/${base64Match[1]}`;
    const base64Data = base64Match[2];

    const aestheticMap = await fetchAestheticMap();
    const prompt = ADJUST_PROMPT(currentEffects || [], aestheticMap, round || 1, styleHint || '');

    // Gemini Vision API 呼び出し
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: base64Data } },
            ],
          }],
          generationConfig: {
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts
      ?.filter((p: { text?: string }) => p.text)
      ?.map((p: { text: string }) => p.text)
      ?.join('') ?? '';

    // JSONを抽出
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'AIからの応答を解析できませんでした' }, { status: 200 });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // バリデーション
    const validTypes = new Set([
      'grayscale', 'sepia', 'invert', 'posterize', 'halftone',
      'edgeDetect', 'pixelate', 'glitch', 'duotone', 'noise',
      'threshold', 'scanlines', 'brightness', 'contrast', 'saturation', 'rgbShift',
    ]);

    const effects = (parsed.effects || [])
      .filter((e: { type: string }) => validTypes.has(e.type))
      .map((e: { type: string; intensity?: number; enabled?: boolean; extra?: Record<string, string> }, i: number) => ({
        id: `auto_${round}_${i}`,
        type: e.type,
        intensity: Math.max(0, Math.min(100, e.intensity ?? 50)),
        enabled: e.enabled !== false,
        extra: e.extra || undefined,
      }));

    return NextResponse.json({
      evaluation: parsed.evaluation || '',
      adjustments: parsed.adjustments || '',
      effects,
      score: Math.max(0, Math.min(100, parsed.score ?? 50)),
      done: !!parsed.done,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
