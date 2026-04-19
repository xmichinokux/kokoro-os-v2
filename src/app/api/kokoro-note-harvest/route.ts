import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

type NoteInput = {
  id: string;
  title: string;
  body: string;
  createdAt?: string;
};

type ClusterRequest = {
  mode: 'cluster';
  notes: NoteInput[];
};

type EssayRequest = {
  mode: 'essay';
  clusterTitle: string;
  clusterSummary?: string;
  notes: NoteInput[];
};

type HarvestRequest = ClusterRequest | EssayRequest;

const CLUSTER_SYSTEM = `あなたは Kokoro OS の Note まとめアシスタントです。
ユーザーが散らばった Note を俯瞰できるよう、意味の近さで 3〜7 のテーマにクラスタリングしてください。

【見つけるべきもの】
- 繰り返し書いている主題
- 意識せずに考え続けていること
- 矛盾や葛藤を含むテーマ
- 深まってきている問い
- 時系列で変化している考え

【各クラスタに含めるもの】
- title: 「〜について」ではなく、本質を一言で（10〜20字、詩的に）
- emoji: テーマを象徴する絵文字 1 つ
- summary: 2 行のサマリー（「あなたは〜を書いている」の形）
- noteIds: 所属する Note の id リスト
- themes: キーワード 3〜5 個

【重要ルール】
- すべての Note をどこかのクラスタに含める
- 1 つの Note は 1 つのクラスタにのみ所属
- クラスタは大きさ順ではなく、深さ順に並べる

以下の JSON のみを返してください：
{
  "clusters": [
    {
      "id": "cluster_1",
      "title": "本質を一言で",
      "emoji": "🌿",
      "summary": "2行のサマリー",
      "noteIds": ["..."],
      "themes": ["...", "..."]
    }
  ]
}`;

const ESSAY_SYSTEM = `あなたは Kokoro OS のエッセイ生成者です。
ユーザーが書いた複数の Note を統合し、「自分自身が書いたような」一人称のエッセイに仕立ててください。

【重要ルール】
- 単なる要約ではなく、統合と発展
- 「私」一人称で書く（「あなたは」と突き放さない）
- 矛盾があれば矛盾として描く
- 時系列の変化があれば示す
- 最後は「今、問われていること」で静かに締める
- 長さ 800〜1500 字
- 「AI が書いた」ではなく「私自身が書いた気配」にする

【HTML 形式】
- <h2 class="wh2">見出し</h2>
- <p class="wp">本文段落</p>
- <blockquote class="wbq" data-note-id="NOTE_ID">「元 Note からの短い引用」</blockquote>

【引用】
- 元 Note から 2〜4 箇所、印象的な一節を直接引用する
- 引用には必ず data-note-id 属性をつける

以下の JSON のみを返してください：
{
  "title": "エッセイのタイトル（本質を一言で）",
  "html": "<h2 class=\\"wh2\\">...</h2><p class=\\"wp\\">...</p>...",
  "quotes": [
    { "noteId": "...", "excerpt": "引用した文", "reason": "なぜ引用したか" }
  ],
  "question": "今、問われていること（1 文）"
}`;

function buildClusterUser(notes: NoteInput[]): string {
  const body = notes.map(n => {
    const date = n.createdAt ? new Date(n.createdAt).toISOString().slice(0, 10) : '';
    return `[id: ${n.id}]${date ? ` (${date})` : ''}\nタイトル: ${n.title}\n本文:\n${n.body}`;
  }).join('\n\n---\n\n');
  return `以下は私が書いた Note 群（${notes.length} 件）です。クラスタリングしてください。\n\n${body}`;
}

function buildEssayUser(title: string, summary: string | undefined, notes: NoteInput[]): string {
  const body = notes.map(n => {
    const date = n.createdAt ? new Date(n.createdAt).toISOString().slice(0, 10) : '';
    return `[id: ${n.id}]${date ? ` (${date})` : ''}\nタイトル: ${n.title}\n本文:\n${n.body}`;
  }).join('\n\n---\n\n');
  return `テーマ: ${title}${summary ? `\nサマリー: ${summary}` : ''}\n\n以下の Note 群（${notes.length} 件）を統合したエッセイを書いてください。\n\n${body}`;
}

async function callClaude(system: string, user: string, model: string, maxTokens: number) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('API key not configured');

  const MAX_RETRIES = 3;
  let res: Response | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (res.status !== 529 || attempt === MAX_RETRIES) break;
    await new Promise(r => setTimeout(r, 3000));
  }

  if (!res!.ok) {
    if (res!.status === 529) {
      throw new Error('overloaded');
    }
    const err = await res!.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Anthropic API error');
  }

  const data = await res!.json();
  const raw = data.content[0].text as string;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSONの解析に失敗しました');
  return JSON.parse(match[0]);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as HarvestRequest;

    if (!body.notes || body.notes.length === 0) {
      return NextResponse.json({ error: 'Note がありません' }, { status: 400 });
    }

    if (body.mode === 'cluster') {
      if (body.notes.length < 3) {
        return NextResponse.json({ error: '3 件以上の Note が必要です' }, { status: 400 });
      }
      if (body.notes.length > 120) {
        return NextResponse.json({ error: '一度に扱える Note は 120 件までです' }, { status: 400 });
      }
      // Haiku でクラスタリング
      const result = await callClaude(
        CLUSTER_SYSTEM,
        buildClusterUser(body.notes),
        'claude-haiku-4-5-20251001',
        4000,
      );
      return NextResponse.json({ data: result });
    }

    if (body.mode === 'essay') {
      // Sonnet でエッセイ生成
      const result = await callClaude(
        ESSAY_SYSTEM,
        buildEssayUser(body.clusterTitle, body.clusterSummary, body.notes),
        'claude-sonnet-4-20250514',
        4000,
      );
      return NextResponse.json({ data: result });
    }

    return NextResponse.json({ error: 'unknown mode' }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'overloaded' ? 529 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
