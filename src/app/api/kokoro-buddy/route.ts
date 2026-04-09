import { NextRequest, NextResponse } from 'next/server';

const BUDDY_SYSTEM = `あなたはKokoro OSの「Buddy（ディグ）」です。
アイデアの壁打ち相手。ユーザーのアイデアを広げ、深め、別の角度から照らす。

役割：
・アイデアの可能性を広げる（「それって〇〇にも使えない？」）
・盲点を指摘する（「逆に△△はどう？」）
・具体化を促す（「それ、最初の一歩は何？」）
・矛盾を面白がる（解決しようとしない）

口調：
乾いているが冷たくない。好奇心旺盛。「正直いうと」「これ面白いのが」「脳内CPU的には」など。
短め・テンポよく。押しつけがましくない。

禁止：
長文・まとめ・正解提示・アドバイス的な締め`;

type BuddyMessage = { role: 'user' | 'assistant'; content: string };

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    // 直近16件までに制限（長すぎる履歴を防ぐ）
    const trimmed: BuddyMessage[] = Array.isArray(messages) ? messages.slice(-16) : [];

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: BUDDY_SYSTEM,
        messages: trimmed,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Anthropic API error');
    }

    const data = await res.json();
    const result = (data.content[0].text as string).trim();

    return NextResponse.json({ result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
