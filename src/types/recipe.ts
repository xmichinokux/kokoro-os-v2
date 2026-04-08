export type RecipeSource = 'manual' | 'talk' | 'zen' | 'note';

export type KokoroRecipeInput = {
  source: RecipeSource;
  weeklyStateText?: string;
  currentTheme?: string[];
  emotionTone?: string[];
  relatedSummary?: string;
  relatedInsightType?: 'contradiction' | 'emotion' | 'pattern' | 'desire' | 'avoidance';
};

export type DayRecipe = {
  day: string;        // '月' | '火' | '水' | '木' | '金' | '土' | '日'
  title: string;      // 料理タイトル
  concept: string;    // その日のコンセプト一文
  ingredients: string[];
  steps: string[];
  leap: string;       // 飛躍ポイント（小さなズレ）
  nextAction: string; // 次の一手（余韻）
};

export type KokoroRecipeResult = {
  weekConcept: string;   // 週全体のコンセプト
  sourceLabel: string;   // 'Talk由来' | 'Zen由来' | 'Note由来' | ''
  days: DayRecipe[];
};
