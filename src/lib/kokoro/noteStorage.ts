import type { KokoroNote } from '@/types/note';

const STORAGE_KEY = 'kokoro_notes';

/**
 * 旧 saveToNote 形式 ({id:number, date, text, source}) の壊れエントリも
 * 拾って KokoroNote 形に正規化する。完全に未知の形は捨てる。
 */
function normalizeEntry(raw: unknown): KokoroNote | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;

  // すでに正規 KokoroNote
  if (typeof e.id === 'string' && typeof e.body === 'string' && Array.isArray(e.tags)) {
    return e as unknown as KokoroNote;
  }

  // 旧 saveToNote 形式: {id:number, date, text, source}
  if (typeof e.text === 'string') {
    const ts = typeof e.id === 'number' ? e.id : Date.now();
    const iso = new Date(ts).toISOString();
    const source = typeof e.source === 'string' ? e.source : 'unknown';
    const text = e.text as string;
    const firstLine = text.split('\n').find(l => l.trim()) ?? text;
    return {
      id: `note_${ts}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: iso,
      updatedAt: iso,
      source: 'manual',
      title: `${source}: ${firstLine.slice(0, 30)}`,
      body: text,
      tags: [source.toLowerCase()],
      pinned: false,
    };
  }

  return null;
}

export function getAllNotes(): KokoroNote[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeEntry)
      .filter((n): n is KokoroNote => n !== null);
  } catch {
    return [];
  }
}

export function saveNote(note: KokoroNote): void {
  const notes = getAllNotes();
  const idx = notes.findIndex(n => n.id === note.id);
  if (idx >= 0) {
    notes[idx] = { ...note, updatedAt: new Date().toISOString() };
  } else {
    notes.unshift(note);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export function deleteNote(id: string): void {
  const notes = getAllNotes().filter(n => n.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export function togglePin(id: string): void {
  const notes = getAllNotes();
  const note = notes.find(n => n.id === id);
  if (note) {
    note.pinned = !note.pinned;
    note.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }
}

export function createNoteId(): string {
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
