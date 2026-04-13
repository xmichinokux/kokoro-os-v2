import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { KokoroValueEngine } from '@/lib/kokoro/valueEngine';

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

const MICHI_SYSTEM = (cache: string) => `あなたはKokoro OSの「Buddy（ディグ）」です。
アイデアの壁打ち相手。ユーザーのアイデアを広げ、深め、別の角度から照らす。

【ユーザーの背景知識（参考程度に）】
${cache}

【役割】
・アイデアの可能性を広げる（「それって〇〇にも使えない？」）
・盲点を指摘する（「逆に△△はどう？」）
・具体化を促す（「それ、最初の一歩は何？」）
・矛盾を面白がる（解決しようとしない）

【口調】
乾いているが冷たくない。好奇心旺盛。「正直いうと」「これ面白いのが」など。
短め・テンポよく。押しつけがましくない。
感性キャッシュの語彙・造語は使わない。

【禁止】
長文・まとめ・正解提示・アドバイス的な締め
哲学的すぎる問い・難解な概念の使用`;

type BuddyMessage = { role: 'user' | 'assistant'; content: string };

export async function POST(req: NextRequest) {
  const { messages, mode } = await req.json();

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    // 直近16件までに制限（長すぎる履歴を防ぐ）
    const trimmed: BuddyMessage[] = Array.isArray(messages) ? messages.slice(-16) : [];

    let system: string;

    if (mode === 'michi') {
      // Michiモード: 感性キャッシュを背景知識として薄く注入
      // 配合: writing 50% + thought 30% + structure 20%
      let cache = '';
      try {
        const supabase = await createServerSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('user_profiles')
            .select('sensibility_cache, sensibility_thought_cache, sensibility_structure_cache')
            .eq('user_id', user.id)
            .single();
          const writing = data?.sensibility_cache || '';
          const thought = data?.sensibility_thought_cache || '';
          const structure = data?.sensibility_structure_cache || '';
          // writing 50%
          if (writing) cache += writing.slice(0, Math.floor(writing.length * 0.5));
          // thought 30%
          if (thought) cache += '\n\n' + thought.slice(0, Math.floor(thought.length * 0.3));
          // structure 20%
          if (structure) cache += '\n\n' + structure.slice(0, Math.floor(structure.length * 0.2));
        }
      } catch {
        // キャッシュ取得失敗はフォールバック
      }

      if (cache) {
        const trimmedCache = cache.length > 4000 ? cache.slice(0, 4000) + '...(省略)' : cache;
        system = MICHI_SYSTEM(trimmedCache);
      } else {
        // キャッシュなし → 通常のBuddyにフォールバック
        const valueInject = KokoroValueEngine.forBuddy();
        system = BUDDY_SYSTEM + (valueInject ? '\n' + valueInject : '');
      }
    } else {
      // 通常モード
      const valueInject = KokoroValueEngine.forBuddy();
      system = BUDDY_SYSTEM + (valueInject ? '\n' + valueInject : '');
    }

    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: mode === 'michi' ? 600 : 300,
      system,
      messages: trimmed,
    });
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };

    // 529 Overloaded 自動リトライ（最大5回・3秒間隔）
    let res: Response | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body,
      });
      if (res.status !== 529) break;
      await new Promise(r => setTimeout(r, 3000));
    }

    if (!res || !res.ok) {
      const errBody = await res?.text() ?? '';
      let errMsg = `Anthropic API error (${res?.status ?? 'unknown'})`;
      try {
        const err = JSON.parse(errBody);
        errMsg = err.error?.message || errMsg;
      } catch { /* non-JSON response */ }
      throw new Error(errMsg);
    }

    const data = await res.json();
    const result = (data.content[0].text as string).trim();

    return NextResponse.json({ result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
