import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 60;

type Model = 'haiku' | 'sonnet' | 'gemini-flash';

const MODEL_MAP: Record<Model, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  'gemini-flash': 'gemini-2.5-flash',
};

// mini-app からの LLM 呼び出しエンドポイント
export async function POST(req: NextRequest) {
  try {
    // 認証: ログインユーザーのみ利用可能
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const { prompt, model: modelKey, maxTokens } = await req.json() as {
      prompt: string;
      model?: Model;
      maxTokens?: number;
    };

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'prompt が必要です' }, { status: 400 });
    }
    if (prompt.length > 20000) {
      return NextResponse.json({ error: 'prompt が長すぎます（20000字以内）' }, { status: 400 });
    }

    const model: Model = modelKey && MODEL_MAP[modelKey] ? modelKey : 'haiku';
    const max_tokens = Math.min(Math.max(maxTokens ?? 1024, 1), 4096);

    if (model === 'gemini-flash') {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY が未設定' }, { status: 500 });
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: max_tokens },
          }),
        }
      );
      if (!res.ok) {
        const errText = await res.text();
        return NextResponse.json({ error: `Gemini API error (${res.status}): ${errText.slice(0, 200)}` }, { status: 500 });
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts
        ?.filter((p: { text?: string }) => p.text)
        ?.map((p: { text: string }) => p.text)
        ?.join('') ?? '';
      return NextResponse.json({ text: text.trim() });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY が未設定' }, { status: 500 });

    const body = JSON.stringify({
      model: MODEL_MAP[model],
      max_tokens,
      messages: [{ role: 'user', content: prompt }],
    });

    let res: Response | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body,
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
    return NextResponse.json({ text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
