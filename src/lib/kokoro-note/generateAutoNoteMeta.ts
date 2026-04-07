import type { KokoroNoteDraft, AutoNoteMeta } from '@/types/noteMeta';
import { generateAutoTitle } from './generateAutoTitle';
import { generateAutoTags }  from './generateAutoTags';

export function generateAutoNoteMeta(draft: KokoroNoteDraft): AutoNoteMeta {
  const title = generateAutoTitle({
    body:        draft.body,
    topic:       draft.topic,
    insightType: draft.insightType,
    emotionTone: draft.emotionTone,
  });

  const tags = generateAutoTags(draft);

  return { title, tags, topic: draft.topic };
}
