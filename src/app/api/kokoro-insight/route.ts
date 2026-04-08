import { NextRequest, NextResponse } from 'next/server';
import type { InsightInput, InsightResult } from '@/types/insight';

function safeParseJSON(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON not found in response');
  return JSON.parse(match[0]);
}

export async function POST(req: NextRequest) {
  const input: InsightInput = await req.json();

  const reviewsText = input.reviews
    .map((r, i) => `レビュー${i + 1}${r.isNegative ? '（酷評）' : ''}:\n${r.text}`)
    .join('\n\n');

  const contextNote = input.contextFilterEnabled
    ? '※ Context Filter ON：時代背景・アーティスト人気・メディア評価などの外部文脈は無視し、純粋な音・熱・歪み・衝撃のみを読め。'
    : '';

  const prompt = `あなたはKokoro InsightのAIエンジンです。
音楽作品のレビュー文・感想文の歪みから、作品の本当の衝撃を逆算してください。

作品名：${input.workTitle}
${contextNote}

${reviewsText}

重要ルール：
- レビューの要約ではなく「レビューという言説」を読む
- 酷評・拒絶反応から本来の影響を逆算する
- 過大評価・信仰化・誤読のパターンを検出する
- 5君からの一言は辛口かつ本質を突く1〜3文にする
- 全スコアは0〜5の数値で返す（trueScoreも0〜5）

以下のJSONのみで返答してください（コードブロック不要）：
{
  "score": 3.8,
  "label": "理解型 / 安全地帯の伝説",
  "summary": "総評2〜4文。作品の本当の衝撃と、レビュー群が何を語っているかを述べる。",
  "axes": {
    "technical": 4.2,
    "soul": 3.1,
    "energy": 2.8,
    "distortion": 3.5,
    "resolution": 4.0,
    "contradiction": 2.2,
    "selfImpact": 3.8,
    "rawness": 2.5,
    "pathos": 3.9,
    "trueScore": 3.6
  },
  "reread": "レビュー群を踏まえた読み直し。2〜4文。このレビュー群が作品のどの側面を照らし、どこを見落としているかを述べる。",
  "misreadSignals": [
    {
      "quote": "レビューから引用した一節",
      "interpretation": "そのフレーズが示す読みのズレの説明"
    }
  ],
  "fiveComment": "5君からの辛口コメント。1〜3文。Kokoro的な棘を持たせる。",
  "overratedBug": "過大評価の兆候がある場合のみ。何が信仰化され、どこで誤読が起きているか。なければ省略。"
}`;

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
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Anthropic API error');
    }

    const data = await res.json();
    const raw = data.content[0].text as string;
    const parsed: InsightResult = safeParseJSON(raw);
    return NextResponse.json(parsed);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '解析に失敗しました' }, { status: 500 });
  }
}
