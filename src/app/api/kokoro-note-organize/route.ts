import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

type NoteInput = {
  id: string;
  title: string;
  snippet: string;
};

type OrganizeResponse = {
  categories: { noteId: string; major: string; minor: string }[];
};

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 });
    }

    const { notes } = (await req.json()) as { notes: NoteInput[] };
    if (!notes || notes.length === 0) {
      return NextResponse.json({ categories: [] } satisfies OrganizeResponse);
    }

    const listText = notes.map((n, i) =>
      `${i + 1}. タイトル: "${n.title}"\n   抜粋: ${n.snippet.replace(/\s+/g, ' ').slice(0, 140)}`
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
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: `以下の Note 一覧を「大ジャンル」と「小ジャンル」の 2 階層で自動分類してください。

【分類の指針】
- 大ジャンルは 3〜6 個程度。本人の思考の主軸になる粒度
- 小ジャンルは大ジャンルごとに 2〜5 個。具体的なテーマの粒度
- 「仕事」「生活」のような無味乾燥な名前ではなく、その人らしさが滲む詩的な日本語で
  例: 「静けさと働くこと」「からだの声」「家族と時間」
- 雑多なものは「その他」に逃げず、最も近い大ジャンルに寄せる
- 同じ Note は必ずひとつの (major, minor) にのみ所属

【Note 一覧】
${listText}

以下の JSON 形式のみで返してください（説明文不要）:
{
  "categories": [
    { "index": 1, "major": "大ジャンル名", "minor": "小ジャンル名" }
  ]
}`,
        }],
      }),
    });

    if (!res.ok) {
      if (res.status === 529) {
        return NextResponse.json({ error: 'overloaded' }, { status: 529 });
      }
      const errText = await res.text();
      throw new Error(`API error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return NextResponse.json({ categories: [] } satisfies OrganizeResponse);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const categories = (parsed.categories || [])
      .map((c: { index: number; major: string; minor: string }) => ({
        noteId: notes[c.index - 1]?.id || '',
        major: c.major || '未分類',
        minor: c.minor || 'その他',
      }))
      .filter((c: { noteId: string }) => c.noteId);

    return NextResponse.json({ categories } satisfies OrganizeResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg.includes('overloaded') ? 529 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
