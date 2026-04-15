import type { Persona } from "./kokoroOutput";

export type HonneSourceMode = "normal" | "stay";
export type HonneSource = "talk" | "zen";

export type HonneLog = {
  id: string;
  createdAt: string;
  sourceMode: HonneSourceMode;
  source?: HonneSource;
  activePersona?: Persona;
  topic: string;
  surfaceText: string;
  subFeeling?: string;
  deepFeeling?: string;
  emotionTone?: string[];
  conflictAxes?: string[];
  detectedNeeds?: string[];
  riskFlags?: string[];
  confidence: number;
};

export type PersonalDiagnosis = {
  summary: string;
  coreThemes: string[];
  repeatedConflicts: string[];
  hiddenNeeds: string[];
  personaBalance: {
    dominant: Persona[];
    suppressed: Persona[];
  };
  currentState?: string[];
  growthEdges?: string[];
  cautionPoints?: string[];
  sourceLogCount: number;
  updatedAt: string;
};

export type CountMap = Record<string, number>;
export type PersonaCountMap = Record<Persona, number>;

export type DiagnosisAggregate = {
  topicCounts: CountMap;
  needCounts: CountMap;
  conflictCounts: CountMap;
  riskCounts: CountMap;
  emotionCounts: CountMap;
  personaCounts: PersonaCountMap;
  deepFeelingSamples: string[];
  subFeelingSamples: string[];
  totalLogs: number;
};
