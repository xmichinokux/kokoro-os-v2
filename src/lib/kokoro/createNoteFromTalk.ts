import type { KokoroNote, CommonInsightData } from '@/types/note';
import { createNoteId } from './noteStorage';
import { generateAutoNoteMeta } from '@/lib/kokoro-note/generateAutoNoteMeta';
import type { KokoroNoteDraft } from '@/types/noteMeta';

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

// Zen結果からnoteを生成
type ZenResultForNote = {
  core: {
    main_story: string;
    tensions: string[];
    needs: string[];
    key_question: string;
  };
  emiMain: string;
  emiQuestion: string;
  personas: { id: string; name: string; text: string }[];
  zenLevel: 'soft' | 'insight' | 'deep';
};

export function createNoteFromZen(result: ZenResultForNote): KokoroNote {
  const now = new Date().toISOString();

  // body: main_story + emiMain + key_question をまとめる
  const bodyParts = [
    result.core.main_story,
    result.emiMain ? `\nエミ: ${result.emiMain}` : '',
    result.core.key_question ? `\n核心の問い: ${result.core.key_question}` : '',
    result.core.needs.length > 0 ? `\n必要なもの: ${result.core.needs.join('、')}` : '',
  ].filter(Boolean);
  const body = bodyParts.join('');

  // generateAutoNoteMeta でタイトル・タグを自動生成
  const draft: KokoroNoteDraft = {
    source: 'zen',
    body,
    emotionTone: result.core.tensions.length > 0 ? [result.core.tensions[0]] : undefined,
  };
  const meta = generateAutoNoteMeta(draft);

  return {
    id: createNoteId(),
    createdAt: now,
    updatedAt: now,
    source: 'zen',
    title: meta.title,
    body,
    tags: meta.tags,
    topic: meta.topic,
    pinned: false,
  };
}
