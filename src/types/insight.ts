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
  interpretation: string;
};

export type InsightResult = {
  score: number;
  label: string;
  summary: string;
  axes: InsightAxisScores;
  reread: string;
  misreadSignals: ReviewMisreadSignal[];
  fiveComment: string;
  overratedBug?: string;
};
