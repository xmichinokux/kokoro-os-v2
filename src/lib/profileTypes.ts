/**
 * プロフィール型定義とユーティリティ関数
 * Supabase依存なし — サーバーサイド（APIルート）からも安全にインポート可能
 */

export type KokoroUserProfile = {
  p_name: string;
  p_age: string;
  p_gender: string;
  p_location: string;
  p_prefecture: string;
  p_city: string;
  p_area_range: string;
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
  'p_prefecture', 'p_city', 'p_area_range',
  'p_style', 'p_brands', 'p_colors', 'p_budget', 'p_usage', 'p_fashion_memo',
  'p_family_size', 'p_cook_skill', 'p_allergy', 'p_diet', 'p_food_pref', 'p_recipe_memo',
  'p_work', 'p_living', 'p_hobbies', 'p_memo',
];

export function createEmptyProfile(): KokoroUserProfile {
  return {
    p_name: '', p_age: '', p_gender: '', p_location: '',
    p_prefecture: '', p_city: '', p_area_range: '',
    p_style: '', p_brands: '', p_colors: '', p_budget: '', p_usage: '', p_fashion_memo: '',
    p_family_size: '', p_cook_skill: '', p_allergy: '', p_diet: '', p_food_pref: '', p_recipe_memo: '',
    p_work: '', p_living: '', p_hobbies: '', p_memo: '',
    updatedAt: '',
  };
}

export function hasProfileData(profile: KokoroUserProfile | null): boolean {
  if (!profile) return false;
  return PROFILE_FIELDS.some(f => (profile[f] ?? '').trim() !== '');
}

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
