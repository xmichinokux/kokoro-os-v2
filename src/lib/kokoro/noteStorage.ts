import type { KokoroNote } from '@/types/note';

const STORAGE_KEY = 'kokoro_notes';

export function getAllNotes(): KokoroNote[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
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
