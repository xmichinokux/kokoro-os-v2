export type KokoroNoteDraft = {
  source: 'manual' | 'talk' | 'zen' | 'emi';
  body: string;
  topic?: string;
  insightType?: 'contradiction' | 'emotion' | 'pattern' | 'desire' | 'avoidance';
  emotionTone?: string[];
  linkedPersona?: 'gnome' | 'shin' | 'canon' | 'dig';
};

export type AutoNoteMeta = {
  title: string;
  tags: string[];
  topic?: string;
};
