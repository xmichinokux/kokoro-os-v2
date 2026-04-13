/**
 * Kokoro Wishlist の共通ストレージ関数
 *
 * ログイン時: Supabase (wishlists テーブル)
 * 未ログイン時: localStorage (kokoro_wishlist)
 */

import { supabase } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/supabase/auth';

export type WishCategory = 'fashion' | 'food' | 'place' | 'person' | 'thing' | 'other';
export type WishIntensity = 'now' | 'soon' | 'someday';

export type WishItem = {
  id: number;
  date: string;
  text: string;
  category: WishCategory;
  intensity: WishIntensity;
  source: string;
};

const STORAGE_KEY = 'kokoro_wishlist';
const MAX_ITEMS = 500;

const VALID_CATEGORIES: ReadonlyArray<WishCategory> = [
  'fashion', 'food', 'place', 'person', 'thing', 'other',
];
const VALID_INTENSITIES: ReadonlyArray<WishIntensity> = ['now', 'soon', 'someday'];

export const CATEGORY_LABELS: Record<WishCategory, string> = {
  fashion: 'ファッション',
  food: '食べ物・料理',
  place: '場所・お店',
  person: '人・出会い',
  thing: 'モノ・買い物',
  other: 'その他',
};

export const INTENSITY_LABELS: Record<WishIntensity, string> = {
  now: '今すぐ',
  soon: 'そのうち',
  someday: 'いつか',
};

function normalizeCategory(value: unknown): WishCategory {
  return typeof value === 'string' && (VALID_CATEGORIES as readonly string[]).includes(value)
    ? (value as WishCategory)
    : 'other';
}

function normalizeIntensity(value: unknown): WishIntensity {
  return typeof value === 'string' && (VALID_INTENSITIES as readonly string[]).includes(value)
    ? (value as WishIntensity)
    : 'someday';
}

// --- localStorage ---

function loadWishlistLocal(): WishItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
      .map((it) => ({
        id: typeof it.id === 'number' ? it.id : Date.now(),
        date: typeof it.date === 'string' ? it.date : new Date().toISOString(),
        text: typeof it.text === 'string' ? it.text : '',
        category: normalizeCategory(it.category),
        intensity: normalizeIntensity(it.intensity),
        source: typeof it.source === 'string' ? it.source : 'unknown',
      }))
      .filter((it) => it.text.trim().length > 0);
  } catch {
    return [];
  }
}

function saveToWishlistLocal(input: {
  text: string;
  category?: WishCategory | string;
  intensity?: WishIntensity | string;
  source?: string;
}): WishItem | null {
  if (typeof window === 'undefined') return null;
  const text = (input.text ?? '').trim();
  if (!text) return null;

  try {
    const list = loadWishlistLocal();
    const item: WishItem = {
      id: Date.now(),
      date: new Date().toISOString(),
      text,
      category: normalizeCategory(input.category),
      intensity: normalizeIntensity(input.intensity),
      source: input.source ?? 'manual',
    };
    list.unshift(item);
    if (list.length > MAX_ITEMS) list.splice(MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return item;
  } catch {
    return null;
  }
}

function deleteFromWishlistLocal(id: number): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const list = loadWishlistLocal().filter((it) => it.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

function clearWishlistLocal(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

// --- Supabase ---

function dbToWish(row: Record<string, unknown>): WishItem {
  return {
    id: new Date(row.created_at as string).getTime(),
    date: row.created_at as string,
    text: row.text as string,
    category: normalizeCategory(row.category),
    intensity: normalizeIntensity(row.intensity),
    source: (row.source as string) ?? 'manual',
  };
}

async function loadWishlistDb(userId: string): Promise<WishItem[]> {
  const { data, error } = await supabase
    .from('wishlists')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map(dbToWish);
}

async function saveToWishlistDb(userId: string, input: {
  text: string;
  category?: WishCategory | string;
  intensity?: WishIntensity | string;
  source?: string;
}): Promise<WishItem | null> {
  const text = (input.text ?? '').trim();
  if (!text) return null;

  const now = new Date().toISOString();
  const { error } = await supabase.from('wishlists').insert({
    user_id: userId,
    text,
    category: normalizeCategory(input.category),
    intensity: normalizeIntensity(input.intensity),
    source: input.source ?? 'manual',
    created_at: now,
  });
  if (error) { console.error('Wishlist save error:', error.message); return null; }

  return {
    id: new Date(now).getTime(),
    date: now,
    text,
    category: normalizeCategory(input.category),
    intensity: normalizeIntensity(input.intensity),
    source: input.source ?? 'manual',
  };
}

async function deleteFromWishlistDb(userId: string, id: number): Promise<boolean> {
  // idはcreated_atのタイムスタンプ。一致するレコードを削除
  const isoDate = new Date(id).toISOString();
  const { error } = await supabase
    .from('wishlists')
    .delete()
    .eq('user_id', userId)
    .eq('created_at', isoDate);
  return !error;
}

async function clearWishlistDb(userId: string): Promise<void> {
  await supabase.from('wishlists').delete().eq('user_id', userId);
}

// --- Public API ---

export async function loadWishlist(): Promise<WishItem[]> {
  const userId = await getCurrentUserId();
  if (userId) return loadWishlistDb(userId);
  return loadWishlistLocal();
}

export async function saveToWishlist(input: {
  text: string;
  category?: WishCategory | string;
  intensity?: WishIntensity | string;
  source?: string;
}): Promise<WishItem | null> {
  const userId = await getCurrentUserId();
  if (userId) return saveToWishlistDb(userId, input);
  return saveToWishlistLocal(input);
}

export async function deleteFromWishlist(id: number): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (userId) return deleteFromWishlistDb(userId, id);
  return deleteFromWishlistLocal(id);
}

export async function clearWishlist(): Promise<void> {
  const userId = await getCurrentUserId();
  if (userId) return clearWishlistDb(userId);
  clearWishlistLocal();
}
