import type { KokoroNote } from '@/types/note';
import type { RelatedTagItem } from '@/types/tagCloud';

export function findRelatedTags(params: {
  notes: KokoroNote[];
  selectedTag: string;
  limit?: number;
}): RelatedTagItem[] {
  const { notes, selectedTag, limit = 6 } = params;

  // selectedTagを含むnoteだけ抽出
  const targets = notes.filter(n => n.tags?.includes(selectedTag));
  if (targets.length === 0) return [];

  // 共起タグを集計
  const coCount: Record<string, number> = {};
  for (const note of targets) {
    for (const tag of note.tags ?? []) {
      if (tag === selectedTag) continue;
      coCount[tag] = (coCount[tag] ?? 0) + 1;
    }
  }

  return Object.entries(coCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, sharedCount]) => ({
      tag,
      score: sharedCount,
      sharedCount,
    }));
}
