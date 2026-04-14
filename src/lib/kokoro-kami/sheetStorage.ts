import { supabase } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/supabase/auth';
import type { KamiSheet, KamiColumn } from '@/types/kami';

const LOCAL_KEY = 'kokoro_kami_sheets';

// ========================
// ID生成
// ========================
export function createSheetId(): string {
  return `kami_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ========================
// localStorage
// ========================
function getLocalSheets(): KamiSheet[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalSheets(sheets: KamiSheet[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(sheets));
}

// ========================
// Supabase ↔ KamiSheet 変換
// ========================
type SupabaseRow = {
  id: string;
  user_id: string;
  title: string;
  columns: KamiColumn[] | string;
  rows: string[][] | string;
  master_formula: string;
  description: string;
  created_at: string;
  updated_at: string;
};

function fromSupabase(row: SupabaseRow): KamiSheet {
  return {
    id: row.id,
    title: row.title,
    columns: typeof row.columns === 'string' ? JSON.parse(row.columns) : row.columns ?? [],
    rows: typeof row.rows === 'string' ? JSON.parse(row.rows) : row.rows ?? [],
    masterFormula: row.master_formula ?? '',
    description: row.description ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ========================
// 全シート取得
// ========================
export async function getAllSheets(): Promise<KamiSheet[]> {
  const userId = await getCurrentUserId();

  if (userId) {
    try {
      const { data, error } = await supabase
        .from('kami_sheets')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (!error && data) {
        return data.map(r => fromSupabase(r as unknown as SupabaseRow));
      }
    } catch { /* fall through to local */ }
  }

  return getLocalSheets().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

// ========================
// シート保存（upsert）
// ========================
export async function saveSheet(sheet: KamiSheet): Promise<void> {
  const now = new Date().toISOString();
  sheet.updatedAt = now;

  const userId = await getCurrentUserId();

  if (userId) {
    try {
      await supabase.from('kami_sheets').upsert({
        id: sheet.id,
        user_id: userId,
        title: sheet.title,
        columns: sheet.columns,
        rows: sheet.rows,
        master_formula: sheet.masterFormula,
        description: sheet.description,
        created_at: sheet.createdAt,
        updated_at: now,
      });
      return;
    } catch { /* fall through to local */ }
  }

  // localStorage fallback
  const local = getLocalSheets();
  const idx = local.findIndex(s => s.id === sheet.id);
  if (idx >= 0) {
    local[idx] = sheet;
  } else {
    local.unshift(sheet);
  }
  setLocalSheets(local);
}

// ========================
// シート削除
// ========================
export async function deleteSheet(id: string): Promise<void> {
  const userId = await getCurrentUserId();

  if (userId) {
    try {
      await supabase.from('kami_sheets').delete().eq('id', id).eq('user_id', userId);
    } catch { /* fall through */ }
  }

  // localStorageからも削除
  const local = getLocalSheets().filter(s => s.id !== id);
  setLocalSheets(local);
}

// ========================
// 新規シート作成
// ========================
export function createEmptySheet(): KamiSheet {
  const now = new Date().toISOString();
  return {
    id: createSheetId(),
    title: '無題のシート',
    columns: [],
    rows: [],
    masterFormula: '',
    description: '',
    createdAt: now,
    updatedAt: now,
  };
}
