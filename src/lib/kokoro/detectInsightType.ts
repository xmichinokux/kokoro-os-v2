import type { InsightType, InsightScores } from '@/types/emi';

// 優先順位（同点時の解決順）
const PRIORITY: InsightType[] = [
  'contradiction', 'emotion', 'pattern', 'desire', 'avoidance',
];

// 初期バイアス（出やすさ調整）
const INITIAL_BIAS: Record<InsightType, number> = {
  contradiction: 0.5,
  emotion:       0.3,
  pattern:       0.0,
  desire:        0.0,
  avoidance:     0.2,
};

// キーワード辞書
const KEYWORDS: Record<InsightType, string[]> = {
  contradiction: [
    '気にしてない', 'そんなことない', '大丈夫', '別にいい',
    '関係ない', 'どうでもいい', '違うと思う', 'そういうわけじゃ',
    '別に', 'でも', 'けど',
  ],
  emotion: [
    '本当は', 'なんでか分からない', 'うまく言えない',
    'なんとなく', '気づいたら', '気がする', 'モヤモヤ',
    'しんどい', 'つらい', '苦しい', '不安',
  ],
  pattern: [
    'いつも', 'また', '毎回', '何度も', '結局',
    '繰り返し', 'ずっと', '前も',
  ],
  desire: [
    'したい', 'ほしい', 'なりたい', 'できたら',
    '変わりたい', '認めてほしい', '分かってほしい',
    '聞いてほしい', '見てほしい',
  ],
  avoidance: [
    '考えたくない', '見ないふり', '後回し', '逃げ',
    'やめとく', '無理', '面倒', 'どうせ',
    '仕方ない', 'しょうがない',
  ],
};

/**
 * InsightType を判定する
 * @param text ユーザーの入力テキスト
 * @param recentTexts 直近のユーザーテキスト（反復検出用）
 * @param lastType 前回のInsightType（連続回避用）
 * @returns { type, scores }
 */
export function detectInsightType(
  text: string,
  recentTexts: string[],
  lastType?: InsightType,
): { type: InsightType; scores: InsightScores } {
  // スコア初期化（バイアス込み）
  const scores: InsightScores = { ...INITIAL_BIAS };

  // キーワードマッチング
  for (const insightType of PRIORITY) {
    for (const kw of KEYWORDS[insightType]) {
      if (text.includes(kw)) {
        scores[insightType] += 1;
      }
    }
  }

  // パターン反復ボーナス: 直近テキストとの単語重複
  const words = text.split(/[\s、。,．！？!?]+/).filter(w => w.length >= 2);
  const repeatMatches = recentTexts.filter(prev =>
    words.some(w => prev.includes(w))
  ).length;
  if (repeatMatches >= 2) {
    scores.pattern += 1.5;
  }

  // 前回と同じタイプにペナルティ（連続回避）
  if (lastType) {
    scores[lastType] = Math.max(0, scores[lastType] - 1);
  }

  // 最高スコアのタイプを選択（同点時はPRIORITY順）
  let bestType: InsightType = 'contradiction';
  let bestScore = -1;
  for (const t of PRIORITY) {
    if (scores[t] > bestScore) {
      bestScore = scores[t];
      bestType = t;
    }
  }

  return { type: bestType, scores };
}
