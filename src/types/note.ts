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
};

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
