/**
 * Kokoro Profile 共通読み込み関数
 *
 * - localStorage キー: `kokoro_profile`
 * - Fashion / Recipe / Plan / Talk など各アプリから参照される
 * - 既存の `@/lib/profile` (KokoroProfile) とは別の新しいユーザー主導型プロフィール
 */

export type KokoroUserProfile = {
  p_name: string;
  p_age: string;
  p_gender: string;
  p_location: string;
  p_style: string;
  p_brands: string;
  p_colors: string;
  p_budget: string;
  p_usage: string;
  p_fashion_memo: string;
  p_family_size: string;
  p_cook_skill: string;
  p_allergy: string;
  p_diet: string;
  p_food_pref: string;
  p_recipe_memo: string;
  p_work: string;
  p_living: string;
  p_hobbies: string;
  p_memo: string;
  updatedAt: string;
};

export const PROFILE_STORAGE_KEY = 'kokoro_profile';

export const PROFILE_FIELDS: (keyof Omit<KokoroUserProfile, 'updatedAt'>)[] = [
  'p_name', 'p_age', 'p_gender', 'p_location',
  'p_style', 'p_brands', 'p_colors', 'p_budget', 'p_usage', 'p_fashion_memo',
  'p_family_size', 'p_cook_skill', 'p_allergy', 'p_diet', 'p_food_pref', 'p_recipe_memo',
  'p_work', 'p_living', 'p_hobbies', 'p_memo',
];

export function createEmptyProfile(): KokoroUserProfile {
  return {
    p_name: '', p_age: '', p_gender: '', p_location: '',
    p_style: '', p_brands: '', p_colors: '', p_budget: '', p_usage: '', p_fashion_memo: '',
    p_family_size: '', p_cook_skill: '', p_allergy: '', p_diet: '', p_food_pref: '', p_recipe_memo: '',
    p_work: '', p_living: '', p_hobbies: '', p_memo: '',
    updatedAt: '',
  };
}

/**
 * localStorage から KokoroUserProfile を読み込む。
 * 未保存の場合は null を返す。
 */
export function getProfile(): KokoroUserProfile | null {
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

/**
 * プロフィールが1つでも埋まっているか判定。
 * Fashion / Recipe バナー表示の判定に使う。
 */
export function hasProfileData(profile: KokoroUserProfile | null): boolean {
  if (!profile) return false;
  return PROFILE_FIELDS.some(f => (profile[f] ?? '').trim() !== '');
}

/**
 * Fashion 用のプロフィール文脈文字列を組み立てる。
 * 空フィールドは含めない。
 */
export function buildFashionProfileContext(profile: KokoroUserProfile | null): string {
  if (!profile || !hasProfileData(profile)) return '';
  const lines: string[] = ['[プロフィール情報]'];
  if (profile.p_name) lines.push(`名前: ${profile.p_name}`);
  if (profile.p_age) lines.push(`年代: ${profile.p_age}`);
  if (profile.p_style) lines.push(`好みのスタイル: ${profile.p_style}`);
  if (profile.p_brands) lines.push(`よく使うブランド: ${profile.p_brands}`);
  if (profile.p_colors) lines.push(`好きな色・NG: ${profile.p_colors}`);
  if (profile.p_budget) lines.push(`予算感: ${profile.p_budget}`);
  if (profile.p_usage) lines.push(`主な用途: ${profile.p_usage}`);
  if (profile.p_fashion_memo) lines.push(`その他: ${profile.p_fashion_memo}`);
  return lines.length > 1 ? lines.join('\n') : '';
}

/**
 * Recipe 用のプロフィール文脈文字列を組み立てる。
 */
export function buildRecipeProfileContext(profile: KokoroUserProfile | null): string {
  if (!profile || !hasProfileData(profile)) return '';
  const lines: string[] = ['[プロフィール情報]'];
  if (profile.p_family_size) lines.push(`人数: ${profile.p_family_size}`);
  if (profile.p_cook_skill) lines.push(`料理スキル: ${profile.p_cook_skill}`);
  if (profile.p_allergy) lines.push(`アレルギー・NG食材: ${profile.p_allergy}`);
  if (profile.p_diet) lines.push(`食の制限: ${profile.p_diet}`);
  if (profile.p_food_pref) lines.push(`好きな料理: ${profile.p_food_pref}`);
  if (profile.p_recipe_memo) lines.push(`料理環境: ${profile.p_recipe_memo}`);
  return lines.length > 1 ? lines.join('\n') : '';
}
