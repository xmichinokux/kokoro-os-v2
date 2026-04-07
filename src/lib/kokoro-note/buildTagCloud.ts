import type { KokoroNote } from '@/types/note';
import type { TagCloudItem } from '@/types/tagCloud';

export function buildTagCloud(
  notes: KokoroNote[],
  options?: { minCount?: number; maxItems?: number }
): TagCloudItem[] {
  const { minCount = 1, maxItems = 25 } = options ?? {};

  // タグ集計
  const counts: Record<string, number> = {};
  for (const note of notes) {
    const seen = new Set<string>();
    for (const tag of note.tags ?? []) {
      if (!seen.has(tag)) {
        counts[tag] = (counts[tag] ?? 0) + 1;
        seen.add(tag);
      }
    }
  }

  const entries = Object.entries(counts)
    .filter(([, c]) => c >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxItems);

  if (entries.length === 0) return [];

  const maxCount = entries[0][1];

  return entries.map(([tag, count]) => {
    const weight = count / maxCount;
    const size =
      count >= 11 ? 'xl' :
      count >= 7  ? 'lg' :
      count >= 4  ? 'md' :
      count >= 2  ? 'sm' : 'xs';
    return { tag, count, weight, size };
  });
}
