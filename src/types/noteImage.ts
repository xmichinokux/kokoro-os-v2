export type PersonaKey = 'gnome' | 'shin' | 'canon' | 'dig';

export type NoteImageBase = {
  id: string;
  sourceType: 'animal-talk' | 'fashion' | 'manual';
  createdAt: string;
  updatedAt?: string;
  imageUrl: string;        // base64またはpreview URL
  userPrompt?: string;
  autoTitle: string;
  personaInterpretations?: PersonaInterpretation[];
  selectedPersona?: PersonaKey;  // 刺さった人格
  selectedPersonaAt?: string;
};

export type AnimalResonanceMap = {
  pathos: number;
  contradiction: number;
  rawness: number;
  love: number;
  silence: number;
  instinct: number;
};

export type AnimalTalkNoteEntry = NoteImageBase & {
  sourceType: 'animal-talk';
  result: {
    emotionText: string;
    resonanceMap: AnimalResonanceMap;
    trueVoice: string;
    question: string;
  };
};

export type FashionScores = {
  styleMatch: number;
  realityFit: number;
};

export type FashionNoteEntry = NoteImageBase & {
  sourceType: 'fashion';
  result: {
    styleName: string;
    tags: string[];
    summary: string;
    scores: FashionScores;
    strengths: string;
    gapAndSuggestion: string;
    impression: string;
    ageContext: string;
  };
};

export type PersonaInterpretation = {
  id: string;
  persona: PersonaKey;
  createdAt: string;
  focus: string[];
  interpretation: string;
  highlights: string[];
  mood?: string;
};

export type ManualImageNoteEntry = NoteImageBase & {
  sourceType: 'manual';
  result: {
    emotionText?: string;
  };
};

export type NoteImageEntry = AnimalTalkNoteEntry | FashionNoteEntry | ManualImageNoteEntry;
