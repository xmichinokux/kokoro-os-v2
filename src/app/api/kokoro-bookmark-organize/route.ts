import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

type BmInput = {
  noteId: string;
  title: string;
  authorName: string;
  type: 'note' | 'product';
};

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 });
    }

    const { bookmarks } = await req.json() as { bookmarks: BmInput[] };
    if (!bookmarks || bookmarks.length === 0) {
      return NextResponse.json({ categories: [] });
    }

    const listText = bookmarks.map((b, i) =>
      `${i + 1}. [${b.type}] "${b.title}" by ${b.authorName}`
    ).join('\n');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `以下のブックマーク一覧を「大ジャンル」と「小ジャンル」に分類してください。
大ジャンルは3〜7個程度、小ジャンルは大ジャンルごとに2〜5個にしてください。
日本語で自然な分類名をつけてください。

${listText}

以下のJSON形式のみで返してください（説明文不要）:
{
  "categories": [
    { "index": 1, "major": "大ジャンル名", "minor": "小ジャンル名" },
    ...
  ]
}`,
        }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return NextResponse.json({ categories: [] });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const categories = (parsed.categories || []).map((c: { index: number; major: string; minor: string }) => ({
      noteId: bookmarks[c.index - 1]?.noteId || '',
      major: c.major || '未分類',
      minor: c.minor || 'その他',
    })).filter((c: { noteId: string }) => c.noteId);

    return NextResponse.json({ categories });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
