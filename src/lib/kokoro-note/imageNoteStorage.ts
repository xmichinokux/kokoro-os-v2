import type { NoteImageEntry, PersonaInterpretation, PersonaKey } from '@/types/noteImage';

const STORAGE_KEY = 'kokoro_image_notes';

export function getAllImageNotes(): NoteImageEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as NoteImageEntry[];
  } catch {
    return [];
  }
}

export function saveImageNote(note: NoteImageEntry): void {
  const notes = getAllImageNotes();
  const idx = notes.findIndex(n => n.id === note.id);
  if (idx >= 0) {
    notes[idx] = note;
  } else {
    notes.unshift(note);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export function getImageNote(id: string): NoteImageEntry | undefined {
  return getAllImageNotes().find(n => n.id === id);
}

export function deleteImageNote(id: string): void {
  const notes = getAllImageNotes().filter(n => n.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export function addPersonaInterpretation(
  noteId: string,
  interpretation: PersonaInterpretation
): void {
  const notes = getAllImageNotes();
  const note = notes.find(n => n.id === noteId);
  if (!note) return;
  if (!note.personaInterpretations) note.personaInterpretations = [];
  // 同じペルソナの既存解釈を上書き
  const existIdx = note.personaInterpretations.findIndex(
    p => p.persona === interpretation.persona
  );
  if (existIdx >= 0) {
    note.personaInterpretations[existIdx] = interpretation;
  } else {
    note.personaInterpretations.push(interpretation);
  }
  note.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export function setSelectedPersona(noteId: string, persona: PersonaKey): void {
  const notes = getAllImageNotes();
  const note = notes.find(n => n.id === noteId);
  if (!note) return;
  note.selectedPersona = persona;
  note.selectedPersonaAt = new Date().toISOString();
  note.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export function createImageNoteId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
