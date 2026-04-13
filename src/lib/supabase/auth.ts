import { supabase } from './client';

/**
 * 現在ログイン中のユーザーIDを返す。未ログインなら null。
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}
