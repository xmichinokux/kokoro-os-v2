import type { PublicNote, GamesenNote } from '@/types/browser';

// ゲーセンノートのキーワードとNoteのタグ・本文・トピックを照合
export function matchNotesToGamesen(
  notes: PublicNote[],
  gamesen: GamesenNote
): PublicNote[] {
  const keywords = gamesen.keywords.map(k => k.toLowerCase());

  return notes.filter(note => {
    const searchTargets = [
      ...(note.tags ?? []),
      note.topic ?? '',
      note.title,
      note.body?.slice(0, 200) ?? '',
    ].join(' ').toLowerCase();

    return keywords.some(kw => searchTargets.includes(kw));
  });
}

// 全ゲーセンノートに対してマッチ数を返す（将来の重み付け用）
export function countMatchScore(note: PublicNote, gamesen: GamesenNote): number {
  const keywords = gamesen.keywords.map(k => k.toLowerCase());
  const searchTargets = [
    ...(note.tags ?? []),
    note.topic ?? '',
    note.title,
    note.body?.slice(0, 200) ?? '',
  ].join(' ').toLowerCase();

  return keywords.filter(kw => searchTargets.includes(kw)).length;
}
