import type { HonneLog, HonneSourceMode } from "@/types/kokoroDiagnosis";
import type { Persona } from "@/types/kokoroOutput";

type CreateHonneLogInput = {
  sourceMode: HonneSourceMode;
  activePersona?: Persona;
  topic: string;
  surfaceText: string;
  subFeeling?: string;
  deepFeeling?: string;
  emotionTone?: string[];
  conflictAxes?: string[];
  detectedNeeds?: string[];
  riskFlags?: string[];
  confidence?: number;
};

export function createHonneLog(input: CreateHonneLogInput): HonneLog {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(),
    createdAt: new Date().toISOString(),
    sourceMode: input.sourceMode,
    activePersona: input.activePersona,
    topic: input.topic,
    surfaceText: input.surfaceText,
    subFeeling: input.subFeeling,
    deepFeeling: input.deepFeeling,
    emotionTone: input.emotionTone,
    conflictAxes: input.conflictAxes,
    detectedNeeds: input.detectedNeeds,
    riskFlags: input.riskFlags,
    confidence: input.confidence ?? 0.5,
  };
}
