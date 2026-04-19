'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { getAllNotes } from '@/lib/kokoro/noteStorage';
import type { KokoroNote } from '@/types/note';
import PersonaLoading from '@/components/PersonaLoading';

type Category = { noteId: string; major: string; minor: string };

type CacheShape = {
  version: 1;
  builtAt: string;
  noteIds: string[]; // 分類時点の Note id リスト（順序込みでハッシュ代わり）
  categories: Category[];
};

const mono = { fontFamily: "'Space Mono', monospace" };
const accent = '#7c3aed';
const CACHE_KEY = 'kokoro_note_shelf_v1';

function loadCache(): CacheShape | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    if (parsed?.version === 1 && Array.isArray(parsed.categories)) return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveCache(data: CacheShape): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function buildNoteIdsKey(notes: KokoroNote[]): string[] {
  return notes.map(n => n.id).sort();
}

function sameIdSets(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export default function NoteShelfPage() {
  const [notes, setNotes] = useState<KokoroNote[]>([]);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [builtAt, setBuiltAt] = useState<string | null>(null);

  const [organizing, setOrganizing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedMajor, setSelectedMajor] = useState<string | null>(null);
  const [selectedMinor, setSelectedMinor] = useState<string | null>(null);

  /* ─── 初期ロード ─── */
  useEffect(() => {
    (async () => {
      const all = await getAllNotes();
      const usable = all.filter(n => n.body.trim().length >= 10);
      setNotes(usable);
      setNotesLoaded(true);

      const cache = loadCache();
      if (cache && sameIdSets(cache.noteIds, buildNoteIdsKey(usable))) {
        setCategories(cache.categories);
        setBuiltAt(cache.builtAt);
      }
    })();
  }, []);

  /* ─── AI で自動分類 ─── */
  const runOrganize = useCallback(async () => {
    if (!notesLoaded || notes.length === 0 || organizing) return;
    setOrganizing(true);
    setError('');

    try {
      // 120 件上限
      const target = notes.slice(0, 120).map(n => ({
        id: n.id,
        title: n.title || '(無題)',
        snippet: n.body.slice(0, 300),
      }));
      const res = await fetch('/api/kokoro-note-organize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: target }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || '自動整理に失敗しました');
      const cats: Category[] = data.categories || [];
      const now = new Date().toISOString();
      setCategories(cats);
      setBuiltAt(now);
      saveCache({
        version: 1,
        builtAt: now,
        noteIds: buildNoteIdsKey(notes),
        categories: cats,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setOrganizing(false);
    }
  }, [notes, notesLoaded, organizing]);

  /* ─── 表示用データ ─── */
  const noteMap = useMemo(() => {
    const m = new Map<string, KokoroNote>();
    notes.forEach(n => m.set(n.id, n));
    return m;
  }, [notes]);

  const enriched = useMemo(() => {
    if (!categories) return [];
    return categories
      .map(c => ({ ...c, note: noteMap.get(c.noteId) }))
      .filter((x): x is Category & { note: KokoroNote } => !!x.note);
  }, [categories, noteMap]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enriched;
    return enriched.filter(e =>
      e.note.title.toLowerCase().includes(q) ||
      e.note.body.toLowerCase().includes(q) ||
      e.major.toLowerCase().includes(q) ||
      e.minor.toLowerCase().includes(q)
    );
  }, [enriched, search]);

  const majors = useMemo(() => {
    const set = new Set<string>();
    filtered.forEach(e => set.add(e.major));
    return Array.from(set);
  }, [filtered]);

  const minorsForMajor = useMemo(() => {
    if (!selectedMajor) return [];
    const set = new Set<string>();
    filtered.filter(e => e.major === selectedMajor).forEach(e => set.add(e.minor));
    return Array.from(set);
  }, [filtered, selectedMajor]);

  const itemsForColumn3 = useMemo(() => {
    if (!selectedMajor) return filtered;
    if (!selectedMinor) return filtered.filter(e => e.major === selectedMajor);
    return filtered.filter(e => e.major === selectedMajor && e.minor === selectedMinor);
  }, [filtered, selectedMajor, selectedMinor]);

  const canOrganize = notesLoaded && notes.length >= 3 && !organizing;

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#374151', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        padding: '14px 24px', borderBottom: '1px solid #e5e7eb',
        position: 'sticky', top: 0, background: '#fff', zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link
            href="/kokoro-note"
            style={{ ...mono, fontSize: 10, color: '#9ca3af', textDecoration: 'none' }}
          >
            ← Note
          </Link>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: accent }}>Note</span> <span style={{ color: '#9ca3af', fontWeight: 400 }}>/ 棚</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>
              AI が自動で並べ替える、あなたの棚
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {builtAt && (
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af' }}>
              {new Date(builtAt).toLocaleDateString('ja-JP')} 更新
            </span>
          )}
          <button
            onClick={runOrganize}
            disabled={!canOrganize}
            style={{
              ...mono, fontSize: 9, letterSpacing: '.1em',
              color: organizing ? '#9ca3af' : accent,
              background: organizing ? '#f3f4f6' : '#ede9fe',
              border: 'none', borderRadius: 4, padding: '6px 14px',
              cursor: canOrganize ? 'pointer' : 'not-allowed',
            }}
          >
            {organizing ? '整理中...' : categories ? '再整理' : '自動で整理'}
          </button>
        </div>
      </header>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!notesLoaded ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ ...mono, fontSize: 10, color: '#9ca3af' }}>読み込み中...</span>
          </div>
        ) : notes.length < 3 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
            <span style={{ ...mono, fontSize: 10, color: '#9ca3af', lineHeight: 1.8 }}>
              Note が 3 件以上になると<br />自動整理できます。
            </span>
          </div>
        ) : !categories ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
            <div style={{ ...mono, fontSize: 10, color: '#6b7280', lineHeight: 1.9, textAlign: 'center', maxWidth: 360 }}>
              {notes.length} 件の Note を、AI が読んでテーマ別に<br />
              本棚のように並べます。<br />
              <span style={{ color: '#9ca3af' }}>フォルダ分けは不要。いつでも再整理できます。</span>
            </div>
            <button
              onClick={runOrganize}
              disabled={!canOrganize}
              style={{
                background: 'transparent',
                border: `1px solid ${canOrganize ? accent : '#d1d5db'}`,
                color: canOrganize ? accent : '#9ca3af',
                ...mono, fontSize: 10, letterSpacing: '.2em',
                padding: '12px 32px', cursor: canOrganize ? 'pointer' : 'not-allowed',
                borderRadius: 2,
              }}
            >
              {organizing ? '// 整理中...' : 'Yoroshiku'}
            </button>
            {organizing && <PersonaLoading />}
          </div>
        ) : (
          <>
            {/* Search */}
            <div style={{ padding: '10px 20px', borderBottom: '1px solid #f3f4f6' }}>
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="棚の中を検索..."
                style={{
                  width: '100%', padding: '8px 12px', fontSize: 13,
                  border: '1px solid #e5e7eb', borderRadius: 6,
                  outline: 'none', color: '#1a1a1a', boxSizing: 'border-box',
                  fontFamily: "'Noto Serif JP', serif",
                }}
              />
            </div>

            {/* 3 カラム */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {/* Column 1: 大ジャンル */}
              <div style={{
                width: 180, borderRight: '1px solid #e5e7eb', overflowY: 'auto',
                padding: '12px 0', flexShrink: 0,
              }}>
                <div style={{ ...mono, fontSize: 8, color: '#9ca3af', padding: '0 16px', marginBottom: 8, letterSpacing: '.14em' }}>
                  // 大ジャンル
                </div>
                <button
                  onClick={() => { setSelectedMajor(null); setSelectedMinor(null); }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '8px 16px', border: 'none', cursor: 'pointer',
                    ...mono, fontSize: 11,
                    background: !selectedMajor ? '#ede9fe' : 'transparent',
                    color: !selectedMajor ? accent : '#6b7280',
                    fontFamily: "'Noto Serif JP', serif",
                  }}
                >
                  すべて ({filtered.length})
                </button>
                {majors.map(m => {
                  const count = filtered.filter(e => e.major === m).length;
                  return (
                    <button
                      key={m}
                      onClick={() => { setSelectedMajor(m); setSelectedMinor(null); }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 16px', border: 'none', cursor: 'pointer',
                        fontSize: 12,
                        background: selectedMajor === m ? '#ede9fe' : 'transparent',
                        color: selectedMajor === m ? accent : '#374151',
                        fontFamily: "'Noto Serif JP', serif",
                        lineHeight: 1.5,
                      }}
                    >
                      {m} <span style={{ ...mono, color: '#9ca3af', fontSize: 9 }}>({count})</span>
                    </button>
                  );
                })}
              </div>

              {/* Column 2: 小ジャンル */}
              <div style={{
                width: 180, borderRight: '1px solid #e5e7eb', overflowY: 'auto',
                padding: '12px 0', flexShrink: 0,
              }}>
                <div style={{ ...mono, fontSize: 8, color: '#9ca3af', padding: '0 16px', marginBottom: 8, letterSpacing: '.14em' }}>
                  // 小ジャンル
                </div>
                {!selectedMajor ? (
                  <div style={{ ...mono, fontSize: 9, color: '#d1d5db', padding: '8px 16px' }}>
                    大ジャンルを選択
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setSelectedMinor(null)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 16px', border: 'none', cursor: 'pointer',
                        ...mono, fontSize: 11,
                        background: !selectedMinor ? '#ede9fe' : 'transparent',
                        color: !selectedMinor ? accent : '#6b7280',
                      }}
                    >
                      すべて ({filtered.filter(e => e.major === selectedMajor).length})
                    </button>
                    {minorsForMajor.map(m => {
                      const count = filtered.filter(e => e.major === selectedMajor && e.minor === m).length;
                      return (
                        <button
                          key={m}
                          onClick={() => setSelectedMinor(selectedMinor === m ? null : m)}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            padding: '8px 16px', border: 'none', cursor: 'pointer',
                            fontSize: 12,
                            background: selectedMinor === m ? '#ede9fe' : 'transparent',
                            color: selectedMinor === m ? accent : '#374151',
                            fontFamily: "'Noto Serif JP', serif",
                            lineHeight: 1.5,
                          }}
                        >
                          {m} <span style={{ ...mono, color: '#9ca3af', fontSize: 9 }}>({count})</span>
                        </button>
                      );
                    })}
                  </>
                )}
              </div>

              {/* Column 3: Notes */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                <div style={{ ...mono, fontSize: 8, color: '#9ca3af', marginBottom: 10, letterSpacing: '.14em' }}>
                  // {itemsForColumn3.length} 件
                </div>
                {itemsForColumn3.length === 0 ? (
                  <div style={{ ...mono, fontSize: 10, color: '#d1d5db', padding: '20px 0', textAlign: 'center' }}>
                    該当する Note はありません
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {itemsForColumn3.map(e => {
                      const snippet = e.note.body.replace(/\s+/g, ' ').slice(0, 80);
                      return (
                        <Link
                          key={e.noteId}
                          href={`/kokoro-note?noteId=${encodeURIComponent(e.noteId)}`}
                          style={{
                            padding: '12px 14px', border: '1px solid #e5e7eb', borderRadius: 6,
                            background: '#fafafa', textDecoration: 'none', color: 'inherit',
                            transition: 'all 0.15s',
                            display: 'block',
                          }}
                          onMouseEnter={ev => { ev.currentTarget.style.borderColor = accent; ev.currentTarget.style.background = `${accent}06`; }}
                          onMouseLeave={ev => { ev.currentTarget.style.borderColor = '#e5e7eb'; ev.currentTarget.style.background = '#fafafa'; }}
                        >
                          <div style={{
                            fontSize: 13, fontWeight: 500,
                            fontFamily: "'Noto Serif JP', serif",
                            color: '#1a1a1a', marginBottom: 4,
                          }}>
                            {e.note.title || '(無題)'}
                          </div>
                          <div style={{
                            fontSize: 11, color: '#6b7280', lineHeight: 1.6,
                            fontFamily: "'Noto Serif JP', serif",
                            marginBottom: 6,
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          }}>
                            {snippet}
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <span style={{ ...mono, fontSize: 8, color: accent, background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>
                              {e.major}
                            </span>
                            <span style={{ ...mono, fontSize: 8, color: '#6b7280', background: '#f3f4f6', padding: '1px 6px', borderRadius: 4 }}>
                              {e.minor}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {error && (
          <div style={{ padding: 16, ...mono, fontSize: 11, color: '#f97316' }}>
            // エラー: {error}
          </div>
        )}
      </div>
    </div>
  );
}
