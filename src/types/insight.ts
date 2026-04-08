export type InsightReviewInput = {
  id: string;
  text: string;
  isNegative?: boolean;
};

export type InsightInput = {
  workTitle: string;
  imageUrl?: string;
  contextFilterEnabled: boolean;
  reviews: InsightReviewInput[];
};

export type InsightAxisScores = {
  technical: number;
  soul: number;
  energy: number;
  distortion: number;
  resolution: number;
  contradiction: number;
  selfImpact: number;
  rawness: number;
  pathos: number;
  trueScore: number;
};

export type ReviewMisreadSignal = {
  quote: string;
  signal: string;
  isNegative?: boolean;
};

export type InsightResult = {
  // 基本
  score: number;
  technicalScore: number;
  soulScore: number;
  label: string;
  typeDesc?: string;
  summary: string;
  oneWord?: string;

  // 軸
  axes: InsightAxisScores;

  // 4象限
  wildness: number;     // -100〜100
  systemScore: number;  // -100〜100

  // Pathos拡張
  pathosFlip?: boolean;

  // 技巧判定
  wildPropulsion?: number;   // 0〜1
  frictionLevel?: number;    // 0〜1
  dirt?: number;             // 0〜1
  techniqueVerdict?: string;

  // Devotional Mimicry
  devotionalMimicry?: boolean;
  devotionalDesc?: string;

  // 過大評価バグ
  isFake?: boolean;
  fakeReason?: string;

  // テキスト
  reread: string;
  misreadSignals: ReviewMisreadSignal[];
  fiveComment: string;
  overratedBug?: string;
};
