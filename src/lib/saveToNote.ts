/**
 * 全アプリ共通の Note 保存関数
 *
 * 仕様:
 * - localStorage キー: `kokoro_notes`
 * - 配列の先頭に unshift
 * - 上限 200 件（超えたら古いものを削除）
 * - HTML 版と互換のシンプルなデータ構造
 */

export type KokoroNoteEntry = {
  id: number;
  date: string;
  text: string;
  source: string;
};

const STORAGE_KEY = 'kokoro_notes';
const MAX_NOTES = 200;

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
    const list: KokoroNoteEntry[] = raw ? JSON.parse(raw) : [];

    list.unshift({
      id: Date.now(),
      date: new Date().toLocaleString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      text: text.trim(),
      source,
    });

    if (list.length > MAX_NOTES) {
      list.splice(MAX_NOTES);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/**
 * 共通 Note ストアから全件取得する。
 */
export function loadKokoroNotes(): KokoroNoteEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as KokoroNoteEntry[]) : [];
  } catch {
    return [];
  }
}
