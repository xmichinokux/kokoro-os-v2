import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 60;

type Model = 'haiku' | 'sonnet';

const MODEL_MAP: Record<Model, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
};

type ContextNode = {
  question: string;
  hypothesis: string;
  reasoning: string;
  estimate: string;
};

type OracleResult = {
  hypothesis: string;
  reasoning: string;
  estimate: string;
  nextQuestions: string[];
};

const SYSTEM_PROMPT = `あなたは Kokoro Oracle、反復的に仮説を精錬する思考パートナーです。
ユーザーが投げた「問い」に対し、以下の要素を構造化して返答します：

- hypothesis: その問いに対する現時点での最有力仮説（1〜2文、断定調）
- reasoning: そう考える根拠・推論の道筋（2〜4文、論理を明示）
- estimate: 定量的または定性的な見積もり（数値があれば数値、無ければスケール感）
- nextQuestions: この仮説をさらに掘り下げるための次の問い（必ず3つ、具体的で実行可能）

ルール:
- 「誠実な仮説」を出す。確信度が低くても根拠と共に提示する。
- 誤差・不確実性がある場合は reasoning で明示する。
- nextQuestions は仮説の前提・反証・定量化・範囲変更など、異なる角度の3つを出す。
- 回答は **必ず** 以下のJSON形式で返す。余計な文章・前置き・マークダウン装飾は一切付けない：

{
  "hypothesis": "...",
  "reasoning": "...",
  "estimate": "...",
  "nextQuestions": ["...", "...", "..."]
}`;

function buildUserPrompt(question: string, context: ContextNode[]): string {
  if (context.length === 0) {
    return `問い: ${question}\n\n上記JSON形式で回答してください。`;
  }
  const contextText = context.map((n, i) =>
    `【${i + 1}. 問い】${n.question}\n【仮説】${n.hypothesis}\n【根拠】${n.reasoning}\n【見積】${n.estimate}`
  ).join('\n\n');
  return `これまでの探索チェーン:\n\n${contextText}\n\n---\n\n次の問い: ${question}\n\n前の仮説チェーンを踏まえて、上記JSON形式で回答してください。`;
}

function extractJson(text: string): OracleResult | null {
  const trimmed = text.trim();
  const candidates: string[] = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidates.unshift(fenced[1].trim());
  const braceStart = trimmed.indexOf('{');
  const braceEnd = trimmed.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) {
    candidates.push(trimmed.slice(braceStart, braceEnd + 1));
  }
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (typeof parsed.hypothesis === 'string'
        && typeof parsed.reasoning === 'string'
        && typeof parsed.estimate === 'string'
        && Array.isArray(parsed.nextQuestions)) {
        const nq = parsed.nextQuestions.filter((q: unknown) => typeof q === 'string' && q.trim()).slice(0, 3);
        return {
          hypothesis: parsed.hypothesis.trim(),
          reasoning: parsed.reasoning.trim(),
          estimate: parsed.estimate.trim(),
          nextQuestions: nq.map((q: string) => q.trim()),
        };
      }
    } catch { /* next */ }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const body = await req.json() as {
      question?: string;
      context?: ContextNode[];
      model?: Model;
    };
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question) {
      return NextResponse.json({ error: 'question が必要です' }, { status: 400 });
    }
    if (question.length > 2000) {
      return NextResponse.json({ error: 'question が長すぎます（2000字以内）' }, { status: 400 });
    }
    const context = Array.isArray(body.context) ? body.context.slice(-10) : [];
    const modelKey: Model = body.model && MODEL_MAP[body.model] ? body.model : 'haiku';

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY が未設定' }, { status: 500 });
    }

    const userPrompt = buildUserPrompt(question, context);

    const apiBody = JSON.stringify({
      model: MODEL_MAP[modelKey],
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    let res: Response | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: apiBody,
      });
      if (res.status !== 529) break;
      await new Promise(r => setTimeout(r, Math.min(2000 * Math.pow(1.5, attempt), 10000)));
    }
    if (!res || !res.ok) {
      const errBody = await res?.text() ?? '';
      let errMsg = `Claude API error (${res?.status ?? 'unknown'})`;
      try { const err = JSON.parse(errBody); errMsg = err.error?.message || errMsg; } catch { /* */ }
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    const data = await res.json();
    const text = (data.content?.[0]?.text as string ?? '').trim();
    const stopReason = data.stop_reason as string | undefined;
    const parsed = extractJson(text);
    if (!parsed) {
      const truncated = stopReason === 'max_tokens';
      const errMsg = truncated
        ? '応答が長すぎて途中で切れました（max_tokens 超過）。問いを短くするか、チェーンを浅くして再試行してください。'
        : 'LLM応答をJSON解析できませんでした';
      return NextResponse.json({
        error: errMsg,
        stopReason: stopReason ?? null,
        raw: text.slice(0, 800),
      }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
