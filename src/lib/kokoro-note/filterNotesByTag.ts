import type { KokoroNote } from '@/types/note';

export function filterNotesByTag(
  notes: KokoroNote[],
  tag: string
): KokoroNote[] {
  return notes.filter(n => n.tags?.includes(tag));
}
