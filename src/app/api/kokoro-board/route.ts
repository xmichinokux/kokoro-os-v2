import { NextRequest, NextResponse } from 'next/server';
import { KokoroValueEngine } from '@/lib/kokoro/valueEngine';

export const maxDuration = 60;

const PERSONAS = [
  { id: 'gnome', name: 'ノーム', trait: '現実主義者。数字とリスクで語る。甘い見通しに容赦なくツッコむ。' },
  { id: 'shin',  name: 'シン',   trait: '分析家。構造を見抜き、論理の穴を突く。感情論に流されない。' },
  { id: 'canon', name: 'カノン', trait: '直感派。空気を読み、場の温度を整える。人間関係に敏感。' },
  { id: 'dig',   name: 'ディグ', trait: '挑発者。常識を疑い、別の視点を持ち込む。「それ本当に必要？」が口癖。' },
  { id: 'emi',   name: 'エミ',   trait: 'まとめ役。全員の意見を拾い、落としどころを見つける。最後に合意を形成する。' },
];

const BOARD_SYSTEM = `あなたはKokoro OSのBoardアシスタントです。5人の人格が会議する疑似会議AIです。

【5人格】
${PERSONAS.map(p => `- ${p.name}（${p.id}）：${p.trait}`).join('\n')}

【会議の進め方】
1. お題を受け取ったら、5人格が議論を始める
2. 各人格は自分の性格に基づいて発言する（1人2〜3文）
3. 互いの発言に反応し、賛同・反論・補足する
4. 3〜4ラウンドの議論を経て、自然に結論に収束する
5. 最後にエミがまとめ、アクションアイテムを提示する

【重要ルール】
- 各発言は短く鋭く（1人あたり2〜3文）
- 全員が馴れ合わない。ディグは必ず反論する。ノームは必ず数字やリスクを問う
- 会議は全体で3〜4ラウンド（15〜20発言程度）で収束させる
- 空虚な賛同は禁止。具体的な意見のみ

以下のJSONのみを返してください：
{
  "discussion": [
    {"persona": "人格id", "text": "発言内容"}
  ],
  "action_items": [
    {"task": "アクション内容", "persona": "担当の人格id"}
  ],
  "conclusion": "会議の結論（エミによるまとめ。2〜3文）"
}`;

export async function POST(req: NextRequest) {
  const { agenda } = await req.json();

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const valueInject = KokoroValueEngine.forBoard();
    const system = BOARD_SYSTEM + (valueInject ? '\n' + valueInject : '');

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
          model: 'claude-sonnet-4-20250514',
          max_tokens: 3000,
          system,
          messages: [{ role: 'user', content: `お題：${agenda}` }],
        }),
      });
      if (res.status !== 529 || attempt === MAX_RETRIES) break;
      await new Promise(r => setTimeout(r, 3000));
    }

    if (!res!.ok) {
      if (res!.status === 529) {
        return NextResponse.json({ error: 'overloaded' }, { status: 529 });
      }
      const err = await res!.json();
      throw new Error(err.error?.message || 'Anthropic API error');
    }

    const data = await res!.json();
    const raw = data.content[0].text as string;

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ error: 'JSONの解析に失敗しました' }, { status: 500 });
    }
    const parsed = JSON.parse(match[0]);
    return NextResponse.json({ data: parsed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
