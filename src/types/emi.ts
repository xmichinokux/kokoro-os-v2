// エミ InsightType システム型定義

export type InsightType =
  | 'contradiction'  // 矛盾・否認
  | 'emotion'        // 感情のズレ
  | 'pattern'        // 反復パターン
  | 'desire'         // 隠れた欲求
  | 'avoidance';     // 回避行動

export type InsightLevel =
  | 'soft'    // やわらかい気づき
  | 'medium'  // 中程度の指摘
  | 'sharp';  // 鋭い問いかけ

export type InsightScores = Record<InsightType, number>;

export type InsightDetectionResult = {
  type: InsightType;
  level: InsightLevel;
  scores: InsightScores;
};
