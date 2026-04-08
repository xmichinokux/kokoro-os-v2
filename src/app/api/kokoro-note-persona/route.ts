import { NextRequest, NextResponse } from 'next/server';
import type { PersonaKey } from '@/types/noteImage';

const PERSONA_PROFILES: Record<PersonaKey, { name: string; style: string }> = {
  gnome: {
    name: 'ノーム',
    style: 'やわらかく、感情に寄り添い、安心感を与える語り口。相手の気持ちに共感し、肯定的に受け止める。',
  },
  shin: {
    name: 'シン',
    style: '簡潔で構造的。分析的に要点を見抜き、論理で整理する。無駄のない言葉で核心を突く。',
  },
  canon: {
    name: 'カノン',
    style: '少し詩的で、感情や意味を言語化する。美意識があり、言葉の質感を大切にする。',
  },
  dig: {
    name: 'ディグ',
    style: '率直で刺激的。本質を突く問いを投げ、固定観念を揺さぶる。遠慮しない。',
  },
};

function buildSystemPrompt(persona: PersonaKey, sourceType: 'animal-talk' | 'fashion'): string {
  const p = PERSONA_PROFILES[persona];
  const sourceLabel = sourceType === 'animal-talk' ? 'Animal Talk（動物の情念分析）' : 'Fashion（装い分析）';

  return `あなはKokoro OSの人格「${p.name}」です。
性格：${p.style}

ユーザーが${sourceLabel}の結果を保存しました。
この結果をあなたの人格で解釈し、ユーザーに語りかけてください。

以下のJSONのみで返答してください。マークダウンや説明文は一切不要です。

{
  "focus": ["着目した要素1", "着目した要素2"],
  "interpretation": "この結果に対するあなたの解釈（2〜3文、60字以内を目安）",
  "highlights": ["印象的なポイント1", "印象的なポイント2"],
  "mood": "この結果から感じた雰囲気を一言で"
}

ルール：
- ${p.name}の口調・視点で解釈すること
- 結果のデータ全体を踏まえて語ること
- 短く、印象的に
- 他の人格とは違う視点を出すこと`;
}

function buildUserMessage(sourceType: 'animal-talk' | 'fashion', resultData: Record<string, unknown>): string {
  if (sourceType === 'animal-talk') {
    return `Animal Talkの結果：
情念テキスト：${resultData.emotionText || ''}
本音：${resultData.trueVoice || ''}
問い：${resultData.question || ''}
共鳴マップ：${JSON.stringify(resultData.resonanceMap || {})}`;
  } else {
    return `Fashion分析の結果：
スタイル名：${resultData.styleName || ''}
タグ：${Array.isArray(resultData.tags) ? resultData.tags.join(', ') : ''}
サマリー：${resultData.summary || ''}
スコア：${JSON.stringify(resultData.scores || {})}
良い点：${resultData.strengths || ''}
ズレ・提案：${resultData.gapAndSuggestion || ''}
印象：${resultData.impression || ''}`;
  }
}

function safeParseJSON(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON not found in response');
  return JSON.parse(match[0]);
}

export async function POST(req: NextRequest) {
  try {
    const { persona, sourceType, resultData } = await req.json();

    if (!persona || !sourceType || !resultData) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const system = buildSystemPrompt(persona as PersonaKey, sourceType);
    const userMsg = buildUserMessage(sourceType, resultData);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system,
        messages: [{ role: 'user', content: userMsg }],
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
      focus: parsed.focus || [],
      interpretation: parsed.interpretation || '',
      highlights: parsed.highlights || [],
      mood: parsed.mood || '',
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
