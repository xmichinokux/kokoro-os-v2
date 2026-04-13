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

const MICHI_PREFIX = (cache: string) => `以下はこのユーザーの文体・思想・センスの分析です：

${cache}

---

あなたはKokoro OSの「Buddy（ディグ）」です。
上記のユーザーのセンス・価値観・思想を完全に理解した上で
アイデアの壁打ち相手として返答してください。

このユーザーのセンスで「それは面白い」「それはちゃらくせー」を判断する。
甘い評価はしない。核心を突く。無駄を削る。

口調はディグのまま（乾いているが冷たくない）。
ただし返答の質・視点はユーザーのセンスに寄せる。`;

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
      // Michiモード: 感性キャッシュを注入
      let cache = '';
      try {
        const supabase = await createServerSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('user_profiles')
            .select('sensibility_cache')
            .eq('user_id', user.id)
            .single();
          if (data?.sensibility_cache) {
            cache = data.sensibility_cache;
          }
        }
      } catch {
        // キャッシュ取得失敗はフォールバック
      }

      if (cache) {
        // 感性キャッシュが長すぎる場合は切り詰め
        const trimmedCache = cache.length > 4000 ? cache.slice(0, 4000) + '...(省略)' : cache;
        system = MICHI_PREFIX(trimmedCache);
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
      model: 'claude-sonnet-4-20250514',
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
