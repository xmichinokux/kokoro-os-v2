import type { KokoroNote, NoteSearchHit } from '@/types/note';
import { getAllNotes } from './noteStorage';

// 1. キーワード検索
export async function searchNotes(query: string): Promise<NoteSearchHit[]> {
  const notes = await getAllNotes();
  const q = query.toLowerCase();
  return notes
    .filter(n =>
      n.title.toLowerCase().includes(q) ||
      n.body.toLowerCase().includes(q) ||
      n.tags.some(t => t.toLowerCase().includes(q)) ||
      n.topic?.toLowerCase().includes(q)
    )
    .map(n => ({
      noteId: n.id,
      title: n.title,
      snippet: n.body.slice(0, 80),
      topic: n.topic,
      source: n.source,
      score: 1,
      matchedBy: 'keyword' as const,
    }));
}

// 2. 意味検索（insightType / emotionTone / topic ベース）
export async function findRelatedNotes(
  insightType?: string,
  emotionTone?: string,
  topic?: string,
  limit = 3
): Promise<NoteSearchHit[]> {
  const notes = await getAllNotes();
  const scored = notes.map(n => {
    let score = 0;
    if (insightType && n.insightType === insightType) score += 2;
    if (emotionTone && n.emotionTone === emotionTone) score += 1;
    if (topic && n.topic && n.topic.includes(topic)) score += 1.5;
    return { note: n, score };
  });
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => ({
      noteId: s.note.id,
      title: s.note.title,
      snippet: s.note.body.slice(0, 80),
      topic: s.note.topic,
      source: s.note.source,
      score: s.score,
      matchedBy: 'semantic' as const,
    }));
}

// 3. 現在文脈検索（Talk/Zenの流れから関連noteを自動検索）
export async function findContextualNotes(
  currentText: string,
  limit = 2
): Promise<NoteSearchHit[]> {
  const notes = await getAllNotes();
  const words = currentText
    .replace(/[。、！？\s]/g, ' ')
    .split(' ')
    .filter(w => w.length >= 2);

  const scored = notes.map(n => {
    const score = words.filter(w =>
      n.body.includes(w) || n.title.includes(w) || n.topic?.includes(w)
    ).length;
    return { note: n, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => ({
      noteId: s.note.id,
      title: s.note.title,
      snippet: s.note.body.slice(0, 80),
      topic: s.note.topic,
      source: s.note.source,
      score: s.score,
      matchedBy: 'contextual' as const,
    }));
}

// 4. 反復テーマ検索（複数noteから繰り返しテーマを抽出）
export async function findRecurringNoteThemes(limit = 3): Promise<string[]> {
  const notes = await getAllNotes();
  const topicCount: Record<string, number> = {};
  for (const n of notes) {
    if (n.topic) {
      topicCount[n.topic] = (topicCount[n.topic] ?? 0) + 1;
    }
  }
  return Object.entries(topicCount)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([topic]) => topic);
}
