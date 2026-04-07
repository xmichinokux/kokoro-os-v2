import type { KokoroNote } from '@/types/note';

// localStorageの一時キー
const TALK_NOTE_KEY = 'kokoro_note_to_talk';
const ZEN_NOTE_KEY  = 'kokoro_note_to_zen';

// Note → Talk に渡すデータを保存
export function setNoteForTalk(note: KokoroNote): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TALK_NOTE_KEY, JSON.stringify({
    noteId:      note.id,
    title:       note.title,
    body:        note.body,
    topic:       note.topic,
    insightType: note.insightType,
    emotionTone: note.emotionTone,
    createdAt:   note.createdAt,
  }));
}

// Note → Zen に渡すデータを保存
export function setNoteForZen(note: KokoroNote): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ZEN_NOTE_KEY, JSON.stringify({
    noteId:      note.id,
    title:       note.title,
    body:        note.body,
    topic:       note.topic,
    insightType: note.insightType,
    emotionTone: note.emotionTone,
    createdAt:   note.createdAt,
  }));
}

// Talk側で取得（取得後は削除する）
export function consumeNoteForTalk(): Partial<KokoroNote> | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(TALK_NOTE_KEY);
  if (!raw) return null;
  localStorage.removeItem(TALK_NOTE_KEY);
  try { return JSON.parse(raw); } catch { return null; }
}

// Zen側で取得（取得後は削除する）
export function consumeNoteForZen(): Partial<KokoroNote> | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(ZEN_NOTE_KEY);
  if (!raw) return null;
  localStorage.removeItem(ZEN_NOTE_KEY);
  try { return JSON.parse(raw); } catch { return null; }
}

// Talk用の初期メッセージ文を生成
export function buildTalkPromptFromNote(note: Partial<KokoroNote>): string {
  const lines = [`以前書いたメモ「${note.title}」について続きを話したいです。`];
  if (note.body)  lines.push(`\nメモの内容：\n${note.body}`);
  if (note.topic) lines.push(`\nテーマ：${note.topic}`);
  return lines.join('');
}

// Zen用の初期メッセージ文を生成
export function buildZenPromptFromNoteData(note: Partial<KokoroNote>): string {
  const lines = [`以前書いたメモ「${note.title}」をもう少し深く整理したいです。`];
  if (note.body)  lines.push(`\nメモの内容：\n${note.body}`);
  if (note.topic) lines.push(`\nテーマ：${note.topic}`);
  if (note.emotionTone) lines.push(`\n感情トーン：${note.emotionTone}`);
  return lines.join('');
}
