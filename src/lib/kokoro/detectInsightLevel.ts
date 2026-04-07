import type { InsightLevel, InsightScores } from '@/types/emi';

/**
 * InsightLevel を判定する
 * スコア合計に基づき soft / medium / sharp を返す
 */
export function detectInsightLevel(scores: InsightScores): InsightLevel {
  const total = Object.values(scores).reduce((sum, v) => sum + v, 0);

  if (total >= 4) return 'sharp';
  if (total >= 2) return 'medium';
  return 'soft';
}
