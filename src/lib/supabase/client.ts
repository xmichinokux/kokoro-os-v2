import { createBrowserClient } from '@supabase/auth-helpers-nextjs';

let _supabase: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Supabaseクライアント（遅延初期化）。
 * ビルド時に環境変数がなくてもエラーにならない。
 */
export function getSupabase() {
  if (!_supabase) {
    _supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

// 後方互換: import { supabase } で使えるように
// ただしビルド時ではなく実行時に初期化
export const supabase = new Proxy({} as ReturnType<typeof createBrowserClient>, {
  get(_target, prop, receiver) {
    const client = getSupabase();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
