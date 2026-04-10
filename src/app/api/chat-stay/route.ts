import { NextRequest, NextResponse } from 'next/server';
import type { Persona } from '@/types/kokoroOutput';

/* ── 人格定義 ── */
const PERSONA_DEFS: Record<Persona, { name: string; description: string }> = {
  gnome: {
    name: 'ノーム',
    description: '安心・現実・生活防衛。やわらかく警戒。不安を和らげる。語り口は穏やかで、相手の安全を第一に考える。',
  },
  shin: {
    name: 'シン',
    description: '論理・構造・合理。簡潔で構造的。問題を分解する。感情より事実を重視し、整理された言葉で伝える。',
  },
  canon: {
    name: 'カノン',
    description: '美・意味・物語。少し詩的。感情を言語化する。言葉の余韻を大切にし、本質的な意味を探る。',
  },
  dig: {
    name: 'ディグ',
    description: '逸脱・発見・可能性。率直で刺激的。制約を壊す。常識を疑い、新しい視点を提示する。',
  },
  emi: {
    name: 'エミ',
    description: '共感・直感・波。感情の深い部分に寄り添う。言葉にならないものを言葉にする。矛盾や揺れをそのまま受け止める。',
  },
};

/* ── Anthropic呼び出し ── */
async function callAnthropic(
  system: string,
  userMessage: string,
  apiKey: string,
  maxTokens = 600
) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Anthropic API error');
  }
  const data = await res.json();
  return data.content[0].text as string;
}

function safeParseJSON(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

/* ── POSTハンドラ ── */
export async function POST(req: NextRequest) {
  try {
    const { message, history, persona, style } = await req.json() as {
      message: string;
      history: { role: string; content: string }[];
      persona: Persona;
      style: 'pure' | 'balanced';
    };

    const def = PERSONA_DEFS[persona];
    if (!def) {
      return NextResponse.json({ error: '不明な人格です' }, { status: 400 });
    }

    const otherPersonas = (Object.keys(PERSONA_DEFS) as Persona[]).filter(p => p !== persona);

    let system: string;

    if (style === 'pure') {
      system = `あなたはKokoro OSの「${def.name}」です。
他の人格は表示しません。
${def.name}の価値観・口調・視点のみで応答してください。

人格定義：${def.description}

必ず以下のJSON形式のみで返答してください。マークダウンや説明文は一切不要です。
{
  "main": "${def.name}としての返答（2〜4文で。人格らしい語り口で）"
}
JSONのみ出力。それ以外のテキストは一切禁止。`;
    } else {
      // balanced mode
      const whisperDefs = otherPersonas
        .map(p => `  - ${PERSONA_DEFS[p].name}（${p}）: ${PERSONA_DEFS[p].description}`)
        .join('\n');

      system = `あなたはKokoro OSの「${def.name}」です。
メインの応答は${def.name}の価値観・口調・視点で行ってください。

人格定義：${def.description}

応答の最後に、他の3人格からの一言をwhispersとして含めてください。
各whisperは1文のみ、その人格らしい視点で。

他の人格：
${whisperDefs}

必ず以下のJSON形式のみで返答してください。マークダウンや説明文は一切不要です。
{
  "main": "${def.name}としてのメイン返答（2〜4文で。人格らしい語り口で）",
  "whispers": [
${otherPersonas.map(p => `    {"persona": "${p}", "text": "一言"}`).join(',\n')}
  ]
}
JSONのみ出力。それ以外のテキストは一切禁止。`;
    }

    const userMsg = history.length > 0
      ? `[会話履歴]\n${history.slice(-10).map((m: { role: string; content: string }) => `${m.role === 'user' ? 'ユーザー' : def.name}: ${m.content}`).join('\n')}\n\n[今回の入力]\n${message}`
      : message;

    const apiKey = process.env.ANTHROPIC_API_KEY!;
    const raw = await callAnthropic(system, userMsg, apiKey, 600);

    const parsed = safeParseJSON(raw);

    if (parsed) {
      return NextResponse.json({
        main: parsed.main || '',
        whispers: parsed.whispers || [],
        persona,
        style,
      });
    }

    // フォールバック
    return NextResponse.json({
      main: raw,
      whispers: [],
      persona,
      style,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
