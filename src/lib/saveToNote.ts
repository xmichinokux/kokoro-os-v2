/**
 * 全アプリ共通の Note 保存関数
 *
 * 仕様:
 * - localStorage キー: `kokoro_notes`（既存 noteStorage.ts と同一）
 * - 既存 KokoroNote 型と互換のデータを書き込む（kokoro-note ページで読める）
 * - 上限 200 件（超えたら古いものを削除）
 */

import type { KokoroNote } from '@/types/note';

const STORAGE_KEY = 'kokoro_notes';
const MAX_NOTES = 200;

function createId(): string {
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * テキストを共通 Note ストア (`kokoro_notes`) に保存する。
 *
 * @param text 保存するテキスト（空文字は保存しない）
 * @param source アプリ名（例: 'Fashion', 'Recipe', 'Insight' など）
 * @returns 成功したら true / 失敗したら false
 */
export function saveToNote(text: string, source: string): boolean {
  if (typeof window === 'undefined') return false;
  if (!text || !text.trim()) return false;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: KokoroNote[] = raw ? JSON.parse(raw) : [];

    const now = new Date().toISOString();
    const trimmed = text.trim();
    const firstLine = trimmed.split('\n').find(l => l.trim()) ?? trimmed;

    const note: KokoroNote = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      source: 'manual',
      title: `${source}: ${firstLine.slice(0, 30)}`,
      body: trimmed,
      tags: [source.toLowerCase()],
      pinned: false,
    };

    list.unshift(note);
    if (list.length > MAX_NOTES) list.splice(MAX_NOTES);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}
