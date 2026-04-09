import { NextRequest, NextResponse } from 'next/server';
import { KokoroValueEngine } from '@/lib/kokoro/valueEngine';

const WRITER_SYSTEMS: Record<string, string> = {
  lite: `あなたはKokoro OSのWriterアシスタント（Liteモード）です。
入力された文章を以下の観点で軽く整形してください：
・読点の調整・段落整理・言い換え・自然な流れに修正
改変は最小限に。元の意図を尊重する。整形後の文章のみ返してください。`,
  core: `あなたはKokoro OSのWriterアシスタント（Coreモード）です。
入力された文章を本格的に構造化・改善してください：
・論理構造の整理・MECE化・読みやすい段落構成・適切な文体
元の内容を活かしながら、より伝わる文章に。改善後の文章のみ返してください。`,
};

export async function POST(req: NextRequest) {
  const { text, mode } = await req.json();

  const baseSystem = WRITER_SYSTEMS[mode] ?? WRITER_SYSTEMS.lite;
  // Coreモードのみ MECE_CORE + REVO_CYCLE を注入
  // valueInjectは先頭に置き、baseSystemの「〜のみ返してください」を最後の指示として残す
  const valueInject = mode === 'core' ? KokoroValueEngine.forWriterCore() : '';
  const system = (valueInject ? valueInject + '\n\n' : '') + baseSystem;

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
        max_tokens: 1500,
        system,
        messages: [{ role: 'user', content: text }],
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Anthropic API error');
    }

    const data = await res.json();
    const result = data.content[0].text as string;

    return NextResponse.json({ result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
