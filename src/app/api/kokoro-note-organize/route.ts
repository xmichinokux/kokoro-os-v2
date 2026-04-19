import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

type NoteInput = {
  id: string;
  title: string;
  snippet: string;
};

type Taxonomy = {
  majors: { name: string; minors: string[] }[];
};

type OrganizeResponse = {
  categories: { noteId: string; major: string; minor: string }[];
};

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

async function callHaiku(apiKey: string, prompt: string, maxTokens: number): Promise<string> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    if (res.status === 529) throw new Error('overloaded');
    const errText = await res.text();
    throw new Error(`API error (${res.status}): ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

function extractJson<T = unknown>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

/* ─── Pass 1: taxonomy 設計 ─── */
async function designTaxonomy(apiKey: string, notes: NoteInput[]): Promise<Taxonomy> {
  // 全体の分類規模を Note 数から決める
  const n = notes.length;
  const majorTarget = n < 10 ? '3〜4' : n < 30 ? '3〜5' : '4〜6';
  const minorPerMajor = '2〜4';
  const minorTotalHint = Math.max(6, Math.min(20, Math.ceil(n / 5)));

  const listText = notes.map((note, i) => `${i + 1}. ${note.title}`).join('\n');

  const prompt = `以下は私が書いた Note のタイトル一覧（${n} 件）です。
これらを整理するための「棚」（分類体系）を設計してください。
まだ割り振りはしません。棚の名前だけ決めます。

【棚のルール】
- 大ジャンルは ${majorTarget} 個
- 大ジャンルごとに小ジャンル ${minorPerMajor} 個
- 小ジャンルの総数は ${minorTotalHint} 個前後が理想（多くなりすぎない）
- 各小ジャンルには複数の Note が入る前提で命名する（1 Note 専用の棚名は禁止）
- 小ジャンル名は 5〜10 字程度、抽象度は「本の背表紙」レベル
- 無味乾燥な「仕事」「生活」ではなく、本人らしさが滲む言葉
  良い例: 「静けさと働く」「からだの声」「家族と時間」「言葉の余白」
  悪い例: 「2025年3月の日記」「コーヒーの話」（具体的すぎて 1 Note 専用になる）
- 全ての Note がどこかに収まる網羅性を持たせる

【Note タイトル一覧】
${listText}

以下の JSON 形式のみで返してください（説明文不要）:
{
  "majors": [
    { "name": "大ジャンル名", "minors": ["小ジャンル名", "小ジャンル名"] }
  ]
}`;

  const raw = await callHaiku(apiKey, prompt, 1500);
  const parsed = extractJson<Taxonomy>(raw);
  if (!parsed || !Array.isArray(parsed.majors) || parsed.majors.length === 0) {
    throw new Error('棚の設計に失敗しました');
  }
  return parsed;
}

/* ─── Pass 2: Note を既存の棚に割り振る ─── */
async function assignNotes(apiKey: string, notes: NoteInput[], taxonomy: Taxonomy) {
  const shelfText = taxonomy.majors
    .map(m => `- 【${m.name}】 小ジャンル: ${m.minors.join(' / ')}`)
    .join('\n');

  const listText = notes.map((n, i) =>
    `${i + 1}. タイトル: "${n.title}"\n   抜粋: ${n.snippet.replace(/\s+/g, ' ').slice(0, 120)}`
  ).join('\n');

  const prompt = `すでに決まった棚（大ジャンルと小ジャンル）があります。各 Note を最も近い棚に割り振ってください。

【棚（これ以外は絶対に使わない）】
${shelfText}

【割り振りのルール】
- major と minor は必ず上記の棚から一字一句そのまま選ぶ（新しい棚を作らない）
- 選ぶ minor は major に属するものだけ
- 判断に迷ったら、最も意味的に近い既存棚に寄せる
- すべての Note を割り振る

【Note 一覧】
${listText}

以下の JSON 形式のみで返してください（説明文不要）:
{
  "categories": [
    { "index": 1, "major": "大ジャンル名", "minor": "小ジャンル名" }
  ]
}`;

  const raw = await callHaiku(apiKey, prompt, 3000);
  const parsed = extractJson<{ categories: { index: number; major: string; minor: string }[] }>(raw);
  if (!parsed || !Array.isArray(parsed.categories)) {
    throw new Error('割り振りに失敗しました');
  }
  return parsed.categories;
}

/* ─── 棚に存在しない major/minor を最も近い既存棚に寄せる ─── */
function normalizeToTaxonomy(
  major: string,
  minor: string,
  taxonomy: Taxonomy,
): { major: string; minor: string } {
  // 完全一致
  const hitMajor = taxonomy.majors.find(m => m.name === major);
  if (hitMajor) {
    if (hitMajor.minors.includes(minor)) return { major, minor };
    // major だけ一致 → その major の最初の minor
    return { major: hitMajor.name, minor: hitMajor.minors[0] ?? 'その他' };
  }
  // minor 側から逆引き
  const reverseHit = taxonomy.majors.find(m => m.minors.includes(minor));
  if (reverseHit) return { major: reverseHit.name, minor };
  // 何も一致しない → 最初の棚に放り込む
  const first = taxonomy.majors[0];
  return { major: first?.name ?? '未分類', minor: first?.minors[0] ?? 'その他' };
}

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

    // Pass 1: 棚を設計
    const taxonomy = await designTaxonomy(apiKey, notes);

    // Pass 2: Note を棚に割り振り
    const assignments = await assignNotes(apiKey, notes, taxonomy);

    // 棚外の名前は正規化
    const categories = assignments
      .map(c => {
        const note = notes[c.index - 1];
        if (!note) return null;
        const norm = normalizeToTaxonomy(c.major, c.minor, taxonomy);
        return { noteId: note.id, major: norm.major, minor: norm.minor };
      })
      .filter((c): c is { noteId: string; major: string; minor: string } => c !== null);

    // 割り振り漏れがあれば補完
    const assignedIds = new Set(categories.map(c => c.noteId));
    notes.forEach(n => {
      if (!assignedIds.has(n.id)) {
        const first = taxonomy.majors[0];
        categories.push({
          noteId: n.id,
          major: first?.name ?? '未分類',
          minor: first?.minors[0] ?? 'その他',
        });
      }
    });

    return NextResponse.json({ categories } satisfies OrganizeResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg.includes('overloaded') ? 529 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
