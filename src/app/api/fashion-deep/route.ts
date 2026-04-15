import { NextRequest, NextResponse } from 'next/server';
import { buildFashionProfileContext, type KokoroUserProfile } from '@/lib/profileTypes';
import type { KokoroProfile } from '@/lib/profile';

export const maxDuration = 60;

const SYSTEM_INSTRUCTION = `あなたはKokoro OSの「Fashion / おすすめDeep」AIです。
Google検索を使い、ユーザーのスタイル・プロフィールに本当に合うブランドやショップを、実際にインターネット上に存在するものの中から選んで提案します。

【重要】
- 必ず Google検索で最新情報を確認してから提案する
- 実在し、現時点で購入可能なブランド・ショップを選ぶ
- 大手すぎず「少し知る人ぞ知る」ラインを優先
- 日本から購入可能（国内ブランド、国内展開、または海外通販可）
- 価格帯・エリア・入手しやすさの条件を厳守
- URLは実在する公式サイトか大手ECのもののみ

【出力形式】必ず以下のJSON形式のみで返してください。余計な説明・マークダウン・コードブロックは一切入れないでください。
{
  "summary": "全体の方向性（2〜3文）",
  "brands": [
    {
      "name": "ブランド名",
      "reason": "このスタイルに合う理由（1〜2文）",
      "price": "価格帯の目安",
      "url": "公式サイトまたは取扱店のURL",
      "shop": "取扱店舗 / 通販サイト（任意）"
    }
  ],
  "avoid": "避けるべきブランド・方向性（1〜2文）"
}

brandsは5〜8件。`;

function buildPrompt(
  profile: KokoroProfile | undefined,
  kokoroProfile: KokoroUserProfile | null | undefined,
  budget: string,
  access: string,
  area: string
): string {
  const parts: string[] = [];
  const profileCtx = buildFashionProfileContext(kokoroProfile ?? null);
  if (profileCtx) parts.push(profileCtx);

  if (profile) {
    const ctx: string[] = [];
    if (profile.explicit.age_range) ctx.push(`年齢層: ${profile.explicit.age_range}`);
    if (profile.explicit.style_keywords?.length) ctx.push(`スタイル: ${profile.explicit.style_keywords.join(', ')}`);
    if (profile.explicit.favorite_things?.length) ctx.push(`好きなもの: ${profile.explicit.favorite_things.join(', ')}`);
    if (profile.inferred.taste_clusters?.length) ctx.push(`趣味クラスター: ${profile.inferred.taste_clusters.join(', ')}`);
    if (ctx.length) parts.push(`【暗黙プロフィール】\n${ctx.join('\n')}`);
  }

  parts.push(`【条件】\n予算: ${budget}\n入手しやすさ: ${access}\nエリア: ${area || '指定なし'}`);
  parts.push('Google検索で実在するブランド・ショップを確認してから、上記JSON形式でのみ返してください。');

  return parts.join('\n\n');
}

function extractJSON(text: string): Record<string, unknown> | null {
  // コードブロックの除去
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { profile, kokoroProfile, budget, access, area } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini APIキーが設定されていません' }, { status: 500 });
    }

    const userPrompt = buildPrompt(profile, kokoroProfile, budget || '指定なし', access || '指定なし', area || '');

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2500,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      throw new Error(`Gemini API エラー: ${err.slice(0, 200)}`);
    }

    const data = await geminiRes.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map((p: { text?: string }) => p.text || '').join('\n') || '';

    if (!text) {
      throw new Error('Gemini から応答が得られませんでした');
    }

    const parsed = extractJSON(text);
    if (!parsed) {
      throw new Error('レスポンスの解析に失敗しました');
    }

    // グラウンディング情報（検索ソース）
    const grounding = candidate?.groundingMetadata;
    const sources: { title: string; uri: string }[] = [];
    if (grounding?.groundingChunks) {
      for (const chunk of grounding.groundingChunks) {
        if (chunk.web?.uri) {
          sources.push({
            title: chunk.web.title || chunk.web.uri,
            uri: chunk.web.uri,
          });
        }
      }
    }

    return NextResponse.json({
      summary: parsed.summary || '',
      brands: parsed.brands || [],
      avoid: parsed.avoid || '',
      sources,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
