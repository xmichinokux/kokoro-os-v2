import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 60;

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

function buildGeneratePrompt(keyword: string, aestheticMap: string): string {
  return `あなたはカルチャー・ブランド・プロダクトなどあらゆる分野に精通した専門家です。
音楽・映画・本・漫画・アニメ・ゲームだけでなく、ファッションブランド・車・食・アート・テクノロジー・スポーツ・場所など、ジャンルの壁を越えて関連するものを推薦できます。

【入力キーワード】
${keyword}

${aestheticMap ? `【ユーザーの感性マップ】\n${aestheticMap}\n` : ''}
【タスク】
入力キーワードを起点に、ジャンルを問わず関連するおすすめをファミリーツリー形式で提案してください。
キーワードが音楽ならファッションブランドや映画も、ファッションなら音楽やアートも自由に横断してください。

【ルール】
・ルートノードは入力キーワードそのもの
・ルートから3〜4個の直接的なおすすめ（第1世代）
・各第1世代から2〜3個の派生おすすめ（第2世代）
・各第2世代から1〜2個のさらなる派生（第3世代）
・実在する作品・アーティスト・ブランド・製品・場所のみ推薦すること
・各ノードには「名前」「ジャンル」「一言説明（20文字以内、なぜおすすめか）」を含める
・ジャンルは music, movie, book, manga, anime, game, fashion, brand, food, art, place, tech, sports, other のいずれか
${aestheticMap ? '・ユーザーの感性マップを考慮して、より共鳴しそうなものを優先すること' : ''}
・「なぜこれが繋がるのか」が伝わる説明を書くこと

【出力形式】以下のJSON形式のみ（説明文不要）:
{
  "tree": {
    "name": "入力キーワード",
    "genre": "ジャンル",
    "description": "何であるかの一言",
    "children": [
      {
        "name": "おすすめ名",
        "genre": "ジャンル",
        "description": "なぜおすすめか",
        "children": [
          {
            "name": "派生おすすめ名",
            "genre": "ジャンル",
            "description": "なぜおすすめか",
            "children": [
              {
                "name": "さらなる派生",
                "genre": "ジャンル",
                "description": "なぜおすすめか",
                "children": []
              }
            ]
          }
        ]
      }
    ]
  }
}`;
}

function buildExpandPrompt(keyword: string, parentContext: string, aestheticMap: string): string {
  return `あなたはカルチャー・ブランド・プロダクトなどあらゆる分野に精通した専門家です。

【掘り下げ対象】
${keyword}

【文脈】
ユーザーは「${parentContext}」から辿って「${keyword}」に到達しました。ここからさらに掘り下げます。

${aestheticMap ? `【ユーザーの感性マップ】\n${aestheticMap}\n` : ''}
【タスク】
「${keyword}」を起点に、ジャンルを問わず関連するおすすめをさらに3世代のファミリーツリーで提案してください。

【ルール】
・ルートノードは「${keyword}」
・ルートから3〜4個の直接的なおすすめ（第1世代）
・各第1世代から2個の派生おすすめ（第2世代）
・各第2世代から1個のさらなる派生（第3世代）
・実在する作品・アーティスト・ブランド・製品・場所のみ推薦すること
・各ノードには name, genre, description を含める
・ジャンルは music, movie, book, manga, anime, game, fashion, brand, food, art, place, tech, sports, other のいずれか
・前のツリーに既出のものは避けること
${aestheticMap ? '・ユーザーの感性マップを考慮すること' : ''}

【出力形式】以下のJSON形式のみ:
{
  "children": [
    {
      "name": "おすすめ名",
      "genre": "ジャンル",
      "description": "なぜおすすめか",
      "children": [...]
    }
  ]
}`;
}

type GeminiCandidate = {
  content?: { parts?: { text?: string }[] };
};

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
    }

    const { keyword, mode, parentContext } = await req.json() as {
      keyword: string;
      mode: 'generate' | 'expand';
      parentContext?: string;
    };

    if (!keyword || !keyword.trim()) {
      return NextResponse.json({ error: 'キーワードを入力してください' }, { status: 400 });
    }

    const aestheticMap = await fetchAestheticMap();

    const prompt = mode === 'expand'
      ? buildExpandPrompt(keyword, parentContext || keyword, aestheticMap)
      : buildGeneratePrompt(keyword, aestheticMap);

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
    const text = candidate.content?.parts
      ?.filter((p: { text?: string }) => p.text)
      ?.map((p: { text?: string }) => p.text ?? '')
      ?.join('') ?? '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'AIからの応答を解析できませんでした' }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (mode === 'expand') {
      return NextResponse.json({
        children: parsed.children || [],
        hasAestheticMap: !!aestheticMap,
      });
    }

    return NextResponse.json({
      tree: parsed.tree || parsed,
      hasAestheticMap: !!aestheticMap,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
