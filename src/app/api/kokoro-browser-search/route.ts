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
    if (data?.sensibility_cache) parts.push(`【文章の感性】${data.sensibility_cache.slice(0, 500)}`);
    if (data?.sensibility_thought_cache) parts.push(`【思想・価値観】${data.sensibility_thought_cache.slice(0, 400)}`);
    if (data?.sensibility_structure_cache) parts.push(`【構造化の傾向】${data.sensibility_structure_cache.slice(0, 300)}`);
    return parts.join('\n');
  } catch {
    return '';
  }
}

const SEARCH_PROMPT = (keywords: string[], aestheticMap: string) =>
  `あなたはユーザーの感性に共鳴する情報をインターネットから発掘する専門家です。

【検索キーワード】
${keywords.join('、')}

${aestheticMap ? `【ユーザーの感性マップ（Master Spec）】\n${aestheticMap}\n` : ''}
【タスク】
上記のキーワードに関連する最新の情報、記事、ブログ、考察、作品などをWeb検索し、
${aestheticMap ? 'ユーザーの感性マップに照らして共鳴度が高い順に' : '関連性が高い順に'}10件を厳選してください。

【重要なルール】
・実在する最新の情報を検索してください
・各結果には「なぜ今この人にこれが必要か」を1文で添えてください
・商業的な宣伝記事やSEOスパムは排除してください
・多様な視点を含めてください（ニュース、個人ブログ、論考、クリエイティブ作品など）

【出力形式】以下のJSON形式のみ（説明文不要）:
{
  "results": [
    {
      "title": "記事タイトル",
      "snippet": "内容の1-2文要約",
      "reason": "なぜ今あなたにこれが必要か（1文）",
      "category": "news" | "blog" | "essay" | "creative" | "tech" | "culture" | "other"
    }
  ]
}`;

type GroundingChunk = {
  web?: { uri: string; title: string };
};

type GeminiCandidate = {
  content?: { parts?: { text?: string }[] };
  groundingMetadata?: {
    groundingChunks?: GroundingChunk[];
    webSearchQueries?: string[];
  };
};

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
    }

    const { keywords } = await req.json() as { keywords: string[] };

    if (!keywords || keywords.length === 0) {
      return NextResponse.json({ error: 'キーワードが必要です' }, { status: 400 });
    }

    const aestheticMap = await fetchAestheticMap();
    const prompt = SEARCH_PROMPT(keywords, aestheticMap);

    // Gemini with Google Search grounding
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
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
    const candidate: GeminiCandidate = data.candidates?.[0] ?? {};

    // テキスト応答を抽出
    const text = candidate.content?.parts
      ?.filter((p: { text?: string }) => p.text)
      ?.map((p: { text?: string }) => p.text ?? '')
      ?.join('') ?? '';

    // Grounding chunks（実際のURL）を抽出
    const groundingChunks = candidate.groundingMetadata?.groundingChunks ?? [];
    const webUrls = groundingChunks
      .filter((c: GroundingChunk) => c.web?.uri)
      .map((c: GroundingChunk) => ({
        url: c.web!.uri,
        title: c.web!.title || '',
      }));

    // JSONを抽出してパース
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let results: {
      title: string;
      snippet: string;
      reason: string;
      category: string;
      url?: string;
    }[] = [];

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        results = (parsed.results || []).map((r: {
          title: string;
          snippet?: string;
          reason?: string;
          category?: string;
        }, i: number) => ({
          title: r.title || `Result ${i + 1}`,
          snippet: r.snippet || '',
          reason: r.reason || '',
          category: r.category || 'other',
          // Grounding chunks からURLをマッチ
          url: webUrls[i]?.url || '',
        }));
      } catch {
        // JSON parse失敗時はgrounding chunksから直接構築
        results = webUrls.slice(0, 10).map((u, i) => ({
          title: u.title || `Result ${i + 1}`,
          snippet: '',
          reason: '',
          category: 'other' as const,
          url: u.url,
        }));
      }
    } else {
      // テキスト応答がJSON形式でない場合もgrounding chunksから構築
      results = webUrls.slice(0, 10).map((u, i) => ({
        title: u.title || `Result ${i + 1}`,
        snippet: '',
        reason: '',
        category: 'other' as const,
        url: u.url,
      }));
    }

    // URLが空の結果にgrounding chunksを補完
    const unusedUrls = webUrls.filter(
      u => !results.some(r => r.url === u.url)
    );
    let unusedIdx = 0;
    results = results.map(r => {
      if (!r.url && unusedIdx < unusedUrls.length) {
        return { ...r, url: unusedUrls[unusedIdx++].url };
      }
      return r;
    });

    // URLのない結果を除外
    results = results.filter(r => r.url);

    return NextResponse.json({
      results: results.slice(0, 10),
      hasAestheticMap: !!aestheticMap,
      searchQueries: candidate.groundingMetadata?.webSearchQueries || [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
