/**
 * Kokoro Wishlist の共通ストレージ関数
 *
 * 仕様:
 * - localStorage キー: `kokoro_wishlist`
 * - DB は使わない・認証不要
 * - 上限 500 件（超えたら古いものを削除）
 */

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

/**
 * ウィッシュリストを読み込む。
 */
export function loadWishlist(): WishItem[] {
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

/**
 * ウィッシュリストに 1 件追加する。
 *
 * @returns 成功したら作成された WishItem / 失敗したら null
 */
export function saveToWishlist(input: {
  text: string;
  category?: WishCategory | string;
  intensity?: WishIntensity | string;
  source?: string;
}): WishItem | null {
  if (typeof window === 'undefined') return null;
  const text = (input.text ?? '').trim();
  if (!text) return null;

  try {
    const list = loadWishlist();
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

/**
 * id を指定して 1 件削除する。
 */
export function deleteFromWishlist(id: number): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const list = loadWishlist().filter((it) => it.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/**
 * 全件削除（テスト・初期化用）。
 */
export function clearWishlist(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
