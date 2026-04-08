import type { KokoroRecipeInput } from '@/types/recipe';

const STORAGE_KEY = 'kokoro_recipe_input';

// Recipe画面に渡す入力をlocalStorageに保存
export function setRecipeInput(input: KokoroRecipeInput): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(input));
}

// Recipe画面側で取得（取得後削除）
export function consumeRecipeInput(): KokoroRecipeInput | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  localStorage.removeItem(STORAGE_KEY);
  try { return JSON.parse(raw); } catch { return null; }
}

// Talk → Recipe の入力を生成
export function createRecipeInputFromTalk(params: {
  summary: string;
  emotionTone?: string[];
  topic?: string;
  insightType?: string;
}): KokoroRecipeInput {
  return {
    source: 'talk',
    relatedSummary: params.summary,
    emotionTone: params.emotionTone,
    currentTheme: params.topic ? [params.topic] : undefined,
    relatedInsightType: params.insightType as KokoroRecipeInput['relatedInsightType'],
  };
}

// Zen → Recipe の入力を生成
export function createRecipeInputFromZen(params: {
  headline: string;
  emotionTone?: string[];
  topic?: string;
  insightType?: string;
}): KokoroRecipeInput {
  return {
    source: 'zen',
    relatedSummary: params.headline,
    emotionTone: params.emotionTone,
    currentTheme: params.topic ? [params.topic] : undefined,
    relatedInsightType: params.insightType as KokoroRecipeInput['relatedInsightType'],
  };
}

// Note → Recipe の入力を生成
export function createRecipeInputFromNote(params: {
  title: string;
  body?: string;
  topic?: string;
  emotionTone?: string[];
}): KokoroRecipeInput {
  return {
    source: 'note',
    relatedSummary: params.body ?? params.title,
    currentTheme: params.topic ? [params.topic] : undefined,
    emotionTone: params.emotionTone,
  };
}
