import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 30;

// 感性マップ取得（短縮版）
async function fetchAestheticMapShort(): Promise<string> {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return '';

    const { data } = await supabase
      .from('user_profiles')
      .select('sensibility_cache, sensibility_thought_cache')
      .eq('user_id', user.id)
      .single();

    const parts: string[] = [];
    if (data?.sensibility_cache) parts.push(data.sensibility_cache.slice(0, 500));
    if (data?.sensibility_thought_cache) parts.push(data.sensibility_thought_cache.slice(0, 500));
    return parts.join('\n');
  } catch {
    return '';
  }
}

const EFFECTS_PROMPT = (styleRequest: string, aestheticMap: string) =>
  `あなたは画像エフェクトの専門家です。
ユーザーのリクエストに基づいて、画像に適用するエフェクトチェーン（効果の組み合わせ）を提案してください。

【ユーザーのリクエスト】
${styleRequest}
${aestheticMap ? `\n【ユーザーの美的感覚（参考）】\n${aestheticMap}\n` : ''}
【使用可能なエフェクト一覧】
- grayscale: モノクロ変換
- sepia: セピア調
- invert: 色反転
- posterize: ポスタリゼーション（色数削減）
- halftone: ハーフトーン（印刷ドット風）
- edgeDetect: エッジ検出（輪郭抽出）
- pixelate: ピクセル化
- glitch: グリッチ（デジタルノイズ）
- duotone: デュオトーン（2色マッピング、darkとlightの#hex色を指定可能）
- noise: ノイズ（フィルムグレイン）
- threshold: 閾値（白黒2値化）
- scanlines: スキャンライン（CRT走査線）
- brightness: 明るさ（50が中間、0-50で暗く、50-100で明るく）
- contrast: コントラスト
- saturation: 彩度
- rgbShift: RGBシフト（色ずれ）

【出力形式】JSONのみ返してください（説明不要）:
{
  "effects": [
    { "type": "エフェクト名", "intensity": 0-100の数値, "extra": {"dark":"#hex","light":"#hex"} }
  ]
}

・エフェクトは3〜6個を推奨（多すぎると重くなる）
・適用順序が重要: 先に基本変換（grayscale等）、次に加工（posterize等）、最後にオーバーレイ（noise, scanlines等）
・intensityは効果の強さ（0=なし、100=最大）
・extraはduotoneの場合のみ必要`;

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
    }

    const { styleRequest } = await req.json() as { styleRequest: string };
    if (!styleRequest) {
      return NextResponse.json({ error: 'スタイルの指定が必要です' }, { status: 400 });
    }

    const aestheticMap = await fetchAestheticMapShort();

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: EFFECTS_PROMPT(styleRequest, aestheticMap) }] }],
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
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.effects && Array.isArray(parsed.effects)) {
        // バリデーション: 有効なエフェクトタイプのみ通す
        const validTypes = new Set([
          'grayscale', 'sepia', 'invert', 'posterize', 'halftone',
          'edgeDetect', 'pixelate', 'glitch', 'duotone', 'noise',
          'threshold', 'scanlines', 'brightness', 'contrast', 'saturation', 'rgbShift',
        ]);
        const effects = parsed.effects
          .filter((e: { type: string }) => validTypes.has(e.type))
          .map((e: { type: string; intensity?: number; extra?: Record<string, string> }, i: number) => ({
            id: `ai_${i}`,
            type: e.type,
            label: e.type,
            intensity: Math.max(0, Math.min(100, e.intensity ?? 50)),
            enabled: true,
            extra: e.extra || undefined,
          }));
        return NextResponse.json({ effects });
      }
    }

    return NextResponse.json({ error: 'AIからの応答を解析できませんでした', effects: [] }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
