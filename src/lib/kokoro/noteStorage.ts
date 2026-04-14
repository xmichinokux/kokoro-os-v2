import type { KokoroNote } from '@/types/note';
import { supabase } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/supabase/auth';

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

// --- localStorage fallback ---

function getAllNotesLocal(): KokoroNote[] {
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

function saveNoteLocal(note: KokoroNote): void {
  const notes = getAllNotesLocal();
  const idx = notes.findIndex(n => n.id === note.id);
  if (idx >= 0) {
    notes[idx] = { ...note, updatedAt: new Date().toISOString() };
  } else {
    notes.unshift(note);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function deleteNoteLocal(id: string): void {
  const notes = getAllNotesLocal().filter(n => n.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function togglePinLocal(id: string): void {
  const notes = getAllNotesLocal();
  const note = notes.find(n => n.id === id);
  if (note) {
    note.pinned = !note.pinned;
    note.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }
}

// --- Supabase ---

function dbToNote(row: Record<string, unknown>): KokoroNote {
  return {
    id: row.id as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    source: (row.source as KokoroNote['source']) ?? 'manual',
    title: (row.title as string) ?? '',
    body: row.text as string,
    tags: (row.tags as string[]) ?? [],
    pinned: false,
    isPublic: (row.is_public as boolean) ?? false,
    isProduct: (row.is_product as boolean) ?? false,
    productPrice: (row.product_price as number) ?? undefined,
    productDescription: (row.product_description as string) ?? undefined,
    productExternalUrl: (row.product_external_url as string) ?? undefined,
    productType: (row.product_type as KokoroNote['productType']) ?? undefined,
    authorName: (row.author_name as string) ?? undefined,
  };
}

async function getAllNotesDb(userId: string): Promise<KokoroNote[]> {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map(dbToNote);
}

async function saveNoteDb(userId: string, note: KokoroNote): Promise<void> {
  const now = new Date().toISOString();
  // upsert by id
  const { error } = await supabase.from('notes').upsert({
    id: note.id,
    user_id: userId,
    title: note.title,
    text: note.body,
    source: note.source,
    tags: note.tags,
    is_public: note.isPublic ?? false,
    created_at: note.createdAt,
    updated_at: now,
  });
  if (error) console.error('Note save error:', error.message);
}

async function deleteNoteDb(id: string): Promise<void> {
  const { error } = await supabase.from('notes').delete().eq('id', id);
  if (error) console.error('Note delete error:', error.message);
}

async function togglePinDb(_id: string): Promise<void> {
  // DBにpinnedカラムがないのでローカルのみ（将来追加可能）
}

// --- Public API ---

export async function getAllNotes(): Promise<KokoroNote[]> {
  const userId = await getCurrentUserId();
  if (userId) return getAllNotesDb(userId);
  return getAllNotesLocal();
}

export async function saveNote(note: KokoroNote): Promise<void> {
  const userId = await getCurrentUserId();
  if (userId) return saveNoteDb(userId, note);
  saveNoteLocal(note);
}

export async function deleteNote(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (userId) return deleteNoteDb(id);
  deleteNoteLocal(id);
}

export async function togglePin(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (userId) return togglePinDb(id);
  togglePinLocal(id);
}

export function createNoteId(): string {
  // Supabase の notes.id は uuid 型なので UUID v4 を生成
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
