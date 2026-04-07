import type { KokoroNoteDraft } from '@/types/noteMeta';
import {
  NOTE_TAG_DICTIONARY,
  INSIGHT_TYPE_TO_TAG,
  PERSONA_TO_TAG,
  BODY_KEYWORD_TO_TAGS,
} from './noteTagDictionary';

export function generateAutoTags(draft: KokoroNoteDraft): string[] {
  const scores: Record<string, number> = {};

  const add = (tag: string, score: number) => {
    scores[tag] = (scores[tag] ?? 0) + score;
  };

  // topic → テーマタグ +3
  if (draft.topic && NOTE_TAG_DICTIONARY.topics.includes(draft.topic as never)) {
    add(draft.topic, 3);
  }

  // insightType → 気づきタグ +2
  if (draft.insightType) {
    const tag = INSIGHT_TYPE_TO_TAG[draft.insightType];
    if (tag) add(tag, 2);
  }

  // emotionTone → 感情タグ +2
  if (draft.emotionTone) {
    for (const tone of draft.emotionTone) {
      if (NOTE_TAG_DICTIONARY.emotions.includes(tone as never)) {
        add(tone, 2);
      }
    }
  }

  // linkedPersona → 人格タグ +1
  if (draft.linkedPersona) {
    const tag = PERSONA_TO_TAG[draft.linkedPersona];
    if (tag) add(tag, 1);
  }

  // 本文キーワードマッチ +1〜2
  if (draft.body) {
    for (const { keywords, tags } of BODY_KEYWORD_TO_TAGS) {
      if (keywords.some(kw => draft.body.includes(kw))) {
        for (const tag of tags) add(tag, 1);
      }
    }
  }

  // スコア順で上位7個・重複除去
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([tag]) => tag);
}
