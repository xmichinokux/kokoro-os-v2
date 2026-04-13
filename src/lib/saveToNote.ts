/**
 * 全アプリ共通の Note 保存関数
 *
 * ログイン時: Supabase に保存
 * 未ログイン時: localStorage に保存
 */

import type { KokoroNote } from '@/types/note';
import { supabase } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/supabase/auth';

const STORAGE_KEY = 'kokoro_notes';
const MAX_NOTES = 200;

function createId(): string {
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * テキストを Note に保存する。
 *
 * @param text 保存するテキスト（空文字は保存しない）
 * @param source アプリ名（例: 'Fashion', 'Recipe', 'Insight' など）
 * @returns 成功したら true / 失敗したら false
 */
export async function saveToNote(text: string, source: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!text || !text.trim()) return false;

  const trimmed = text.trim();
  const firstLine = trimmed.split('\n').find(l => l.trim()) ?? trimmed;
  const now = new Date().toISOString();
  const id = createId();

  const userId = await getCurrentUserId();

  if (userId) {
    // Supabase
    const { error } = await supabase.from('notes').insert({
      id,
      user_id: userId,
      title: `${source}: ${firstLine.slice(0, 30)}`,
      text: trimmed,
      source,
      tags: [source.toLowerCase()],
      is_public: false,
      created_at: now,
      updated_at: now,
    });
    return !error;
  }

  // localStorage fallback
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: KokoroNote[] = raw ? JSON.parse(raw) : [];

    const note: KokoroNote = {
      id,
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
