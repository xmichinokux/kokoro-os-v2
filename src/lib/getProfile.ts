/**
 * Kokoro Profile — Supabase対応のCRUD関数
 *
 * 型定義・ユーティリティは profileTypes.ts から再エクスポート
 * （APIルートからはprofileTypes.tsを直接importすること）
 */

import { supabase } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/supabase/auth';
import {
  type KokoroUserProfile,
  PROFILE_FIELDS,
  PROFILE_STORAGE_KEY,
  createEmptyProfile,
} from '@/lib/profileTypes';

// 再エクスポート（クライアントページ用）
export {
  type KokoroUserProfile,
  PROFILE_FIELDS,
  PROFILE_STORAGE_KEY,
  createEmptyProfile,
  hasProfileData,
  buildFashionProfileContext,
  buildRecipeProfileContext,
} from '@/lib/profileTypes';

// --- localStorage ---

function getProfileLocal(): KokoroUserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<KokoroUserProfile>;
    return { ...createEmptyProfile(), ...parsed };
  } catch {
    return null;
  }
}

function saveProfileLocal(profile: KokoroUserProfile): void {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

// --- Supabase ---

function dbToProfile(row: Record<string, unknown>): KokoroUserProfile {
  const empty = createEmptyProfile();
  for (const key of PROFILE_FIELDS) {
    if (typeof row[key] === 'string') {
      (empty as Record<string, string>)[key] = row[key] as string;
    }
  }
  empty.updatedAt = (row.updated_at as string) ?? '';
  return empty;
}

async function getProfileDb(userId: string): Promise<KokoroUserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error || !data) return null;
  return dbToProfile(data);
}

async function saveProfileDb(userId: string, profile: KokoroUserProfile): Promise<void> {
  const row: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
  for (const key of PROFILE_FIELDS) {
    row[key] = profile[key] ?? '';
  }
  const { error } = await supabase.from('user_profiles').upsert(row, { onConflict: 'user_id' });
  if (error) console.error('Profile save error:', error.message);
}

// --- Public API ---

export async function getProfile(): Promise<KokoroUserProfile | null> {
  const userId = await getCurrentUserId();
  if (userId) return getProfileDb(userId);
  return getProfileLocal();
}

export async function saveProfile(profile: KokoroUserProfile): Promise<void> {
  const userId = await getCurrentUserId();
  if (userId) return saveProfileDb(userId, profile);
  saveProfileLocal(profile);
}
