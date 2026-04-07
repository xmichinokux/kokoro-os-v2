import type { KokoroNote, CommonInsightData } from '@/types/note';
import { createNoteId } from './noteStorage';

export function createNoteFromTalkTurn(
  userText: string,
  insight: CommonInsightData,
  persona: string
): KokoroNote {
  const now = new Date().toISOString();
  return {
    id: createNoteId(),
    createdAt: now,
    updatedAt: now,
    source: 'talk',
    title: insight.topic ?? userText.slice(0, 30),
    body: insight.summary,
    tags: insight.detectedNeeds ?? [],
    topic: insight.topic,
    insightType: insight.insightType,
    emotionTone: insight.emotionTone,
    linkedPersona: persona,
    pinned: false,
  };
}

export function createNoteFromEmi(
  emiLine: string,
  insightType: string,
  topic?: string
): KokoroNote {
  const now = new Date().toISOString();
  return {
    id: createNoteId(),
    createdAt: now,
    updatedAt: now,
    source: 'emi',
    title: topic ?? 'エミの気づき',
    body: emiLine,
    tags: [insightType],
    topic,
    insightType,
    pinned: false,
  };
}
