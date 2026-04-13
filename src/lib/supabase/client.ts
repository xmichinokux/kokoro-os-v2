import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabaseブラウザクライアント
 *
 * ビルド時に環境変数がない場合はダミー値で初期化（実行時には正しい値が入る）。
 * createBrowserClientは環境変数が空でもエラーにならない（API呼び出し時に失敗する）。
 */
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'
);
