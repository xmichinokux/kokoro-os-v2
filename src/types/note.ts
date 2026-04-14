export type NoteSource = 'manual' | 'talk' | 'zen' | 'emi';

export type EmotionTone = 'positive' | 'negative' | 'neutral' | 'mixed';

export type KokoroNote = {
  id: string;
  createdAt: string;           // ISO8601
  updatedAt: string;
  source: NoteSource;
  title: string;
  body: string;
  tags: string[];
  topic?: string;
  insightType?: string;        // InsightTypeと同じ値
  emotionTone?: EmotionTone;
  linkedPersona?: string;
  pinned: boolean;
  isPublic?: boolean;

  // 商品フィールド
  isProduct?: boolean;
  productPrice?: number;          // 円
  productDescription?: string;
  productExternalUrl?: string;    // 外部決済リンク（Stripe Payment Links, BOOTH等）
  productType?: ProductType;
  authorName?: string;            // 売り手の表示名
  aiPricedAmount?: number;        // AI鑑定額（AI値付けを採用した場合）
  showAiBadge?: boolean;          // AI鑑定バッジ表示フラグ
};

export type ProductType = 'pdf' | 'data' | 'svg' | 'html' | 'text' | 'other';

export type NoteSearchHit = {
  noteId: string;
  title: string;
  snippet: string;
  topic?: string;
  source: NoteSource;
  score: number;
  matchedBy: 'keyword' | 'semantic' | 'contextual' | 'recurring';
};

export type CommonInsightData = {
  topic?: string;
  summary: string;
  deepFeeling?: string;
  conflictAxes?: string[];
  detectedNeeds?: string[];
  emotionTone?: EmotionTone;
  insightType?: string;
  linkedPersona?: string;
};
