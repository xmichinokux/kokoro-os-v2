'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { getAllNotes, saveNote, createNoteId } from '@/lib/kokoro/noteStorage';
import type { KokoroNote } from '@/types/note';
import PersonaLoading from '@/components/PersonaLoading';

type Cluster = {
  id: string;
  title: string;
  emoji: string;
  summary: string;
  noteIds: string[];
  themes: string[];
};

type Essay = {
  title: string;
  html: string;
  quotes: { noteId: string; excerpt: string; reason: string }[];
  question?: string;
};

type Scope = 'all' | 'recent3' | 'recent12';

const mono = { fontFamily: "'Space Mono', monospace" };
const accent = '#7c3aed';

function withinDays(iso: string, days: number): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= days * 24 * 60 * 60 * 1000;
}

export default function NoteHarvestPage() {
  const [allNotes, setAllNotes] = useState<KokoroNote[]>([]);
  const [notesLoaded, setNotesLoaded] = useState(false);

  const [scope, setScope] = useState<Scope>('all');
  const [clusters, setClusters] = useState<Cluster[] | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);
  const [essay, setEssay] = useState<Essay | null>(null);

  const [clusterLoading, setClusterLoading] = useState(false);
  const [essayLoading, setEssayLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const notes = await getAllNotes();
      setAllNotes(notes.filter(n => n.body.trim().length >= 20));
      setNotesLoaded(true);
    })();
  }, []);

  /* ─── Shelf からの受信: 即エッセイ生成 ─── */
  useEffect(() => {
    if (!notesLoaded) return;
    const raw = sessionStorage.getItem('harvestFromShelf');
    if (!raw) return;
    sessionStorage.removeItem('harvestFromShelf');
    try {
      const payload = JSON.parse(raw) as {
        themeTitle: string;
        themeSummary: string;
        noteIds: string[];
      };
      const targetNotes = allNotes.filter(n => payload.noteIds.includes(n.id));
      if (targetNotes.length < 2) return;

      // 合成クラスタとして扱い、そのままエッセイへ
      const synthetic: Cluster = {
        id: 'from_shelf',
        title: payload.themeTitle,
        emoji: '📚',
        summary: payload.themeSummary,
        noteIds: payload.noteIds,
        themes: [],
      };
      handleOpenCluster(synthetic);
    } catch {
      /* ignore */
    }
    // allNotes が揃ってから走らせたいので依存は notesLoaded のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesLoaded]);

  const scopedNotes = useMemo(() => {
    if (scope === 'all') return allNotes;
    const days = scope === 'recent3' ? 90 : 365;
    return allNotes.filter(n => withinDays(n.createdAt, days));
  }, [allNotes, scope]);

  const canCluster = notesLoaded && scopedNotes.length >= 3 && !clusterLoading;

  const handleCluster = useCallback(async () => {
    if (scopedNotes.length < 3) return;
    setClusterLoading(true);
    setError('');
    setClusters(null);
    setSelectedCluster(null);
    setEssay(null);

    try {
      const target = scopedNotes.slice(0, 120).map(n => ({
        id: n.id,
        title: n.title,
        body: n.body.slice(0, 2000),
        createdAt: n.createdAt,
      }));
      const res = await fetch('/api/kokoro-note-harvest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'cluster', notes: target }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'クラスタリング失敗');
      setClusters(data.data.clusters || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setClusterLoading(false);
    }
  }, [scopedNotes]);

  const handleOpenCluster = useCallback(async (cluster: Cluster) => {
    setSelectedCluster(cluster);
    setEssay(null);
    setEssayLoading(true);
    setError('');
    setSaved(false);

    try {
      const targetNotes = allNotes.filter(n => cluster.noteIds.includes(n.id));
      const payload = {
        mode: 'essay' as const,
        clusterTitle: cluster.title,
        clusterSummary: cluster.summary,
        notes: targetNotes.map(n => ({
          id: n.id,
          title: n.title,
          body: n.body.slice(0, 2500),
          createdAt: n.createdAt,
        })),
      };
      const res = await fetch('/api/kokoro-note-harvest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'エッセイ生成失敗');
      setEssay(data.data as Essay);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setEssayLoading(false);
    }
  }, [allNotes]);

  const handleSaveEssayAsNote = useCallback(async () => {
    if (!essay) return;
    const now = new Date().toISOString();
    const note: KokoroNote = {
      id: createNoteId(),
      createdAt: now,
      updatedAt: now,
      source: 'manual',
      title: `📚 ${essay.title}`,
      body: essay.html,
      tags: ['harvest', 'essay'],
      pinned: false,
    };
    await saveNote(note);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, [essay]);

  const handleBackToList = () => {
    setSelectedCluster(null);
    setEssay(null);
    setError('');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#374151' }}>
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
              Kokoro <span style={{ color: accent }}>Note</span> <span style={{ color: '#9ca3af', fontWeight: 400 }}>/ まとめる</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>
              散らばった自分を、集めて読む
            </span>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px 120px' }}>

        {/* 初期画面 / クラスタ一覧 */}
        {!selectedCluster && (
          <>
            {!clusters && (
              <>
                <div style={{ ...mono, fontSize: 10, color: '#6b7280', lineHeight: 1.8, marginBottom: 24 }}>
                  あなたが書き溜めた Note を、AI が読んでテーマごとに分類し、<br />
                  「自分が書いたようなエッセイ」に統合します。
                </div>

                <label style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', display: 'block', marginBottom: 10 }}>
                  // どの範囲を読むか
                </label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
                  {([
                    { id: 'all', label: `全部（${allNotes.length}）` },
                    { id: 'recent3', label: `最近3ヶ月（${allNotes.filter(n => withinDays(n.createdAt, 90)).length}）` },
                    { id: 'recent12', label: `最近1年（${allNotes.filter(n => withinDays(n.createdAt, 365)).length}）` },
                  ] as const).map(s => {
                    const active = scope === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setScope(s.id)}
                        style={{
                          ...mono, fontSize: 10, letterSpacing: '.06em',
                          padding: '6px 14px', borderRadius: 14,
                          border: `1px solid ${active ? accent : '#e5e7eb'}`,
                          background: active ? `${accent}12` : '#fff',
                          color: active ? accent : '#6b7280',
                          cursor: 'pointer',
                        }}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={handleCluster}
                  disabled={!canCluster}
                  style={{
                    width: '100%', background: 'transparent',
                    border: `1px solid ${canCluster ? accent : '#d1d5db'}`,
                    color: canCluster ? accent : '#9ca3af',
                    ...mono, fontSize: 10, letterSpacing: '.2em',
                    padding: 13, cursor: canCluster ? 'pointer' : 'not-allowed',
                    borderRadius: 2,
                  }}
                >
                  {clusterLoading ? '// 読んでいます...' : scopedNotes.length < 3 ? '// Note が 3 件以上必要です' : 'Yoroshiku'}
                </button>

                {clusterLoading && <PersonaLoading />}
              </>
            )}

            {clusters && (
              <>
                <div style={{ ...mono, fontSize: 10, color: '#6b7280', marginBottom: 20, lineHeight: 1.8 }}>
                  あなたが書いたことを、{clusters.length} つのテーマに分けました。
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {clusters.map(c => (
                    <button
                      key={c.id}
                      onClick={() => handleOpenCluster(c)}
                      style={{
                        textAlign: 'left', background: '#fafafa',
                        border: '1px solid #e5e7eb', borderRadius: 8,
                        padding: '16px 18px', cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.background = `${accent}06`; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fafafa'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 18 }}>{c.emoji}</span>
                        <span style={{
                          fontSize: 15, fontWeight: 600, color: '#111827',
                          fontFamily: "'Noto Serif JP', serif",
                        }}>{c.title}</span>
                        <span style={{ ...mono, fontSize: 9, color: '#9ca3af', marginLeft: 'auto' }}>
                          {c.noteIds.length} 件
                        </span>
                      </div>
                      <div style={{
                        fontSize: 12, color: '#6b7280', lineHeight: 1.7,
                        fontFamily: "'Noto Serif JP', serif",
                      }}>
                        {c.summary}
                      </div>
                      {c.themes && c.themes.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                          {c.themes.map((t, i) => (
                            <span key={i} style={{
                              ...mono, fontSize: 8, letterSpacing: '.05em',
                              padding: '2px 8px', borderRadius: 10,
                              background: '#f3f4f6', color: '#6b7280',
                            }}>{t}</span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => { setClusters(null); }}
                  style={{
                    marginTop: 20, background: 'transparent',
                    border: '1px solid #e5e7eb', color: '#9ca3af',
                    ...mono, fontSize: 9, letterSpacing: '.12em',
                    padding: '8px 16px', cursor: 'pointer', borderRadius: 3,
                  }}
                >
                  別の範囲で分け直す
                </button>
              </>
            )}
          </>
        )}

        {/* クラスタ詳細 → エッセイ */}
        {selectedCluster && (
          <>
            <button
              onClick={handleBackToList}
              style={{
                ...mono, fontSize: 9, color: '#9ca3af',
                background: 'transparent', border: 'none', cursor: 'pointer',
                marginBottom: 16, padding: 0,
              }}
            >
              ← テーマ一覧に戻る
            </button>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 20 }}>
              <span style={{ fontSize: 22 }}>{selectedCluster.emoji}</span>
              <h1 style={{
                fontSize: 20, fontWeight: 600, color: '#111827',
                fontFamily: "'Noto Serif JP', serif", margin: 0,
              }}>{selectedCluster.title}</h1>
            </div>

            {essayLoading && (
              <>
                <div style={{ ...mono, fontSize: 10, color: '#6b7280', marginBottom: 16 }}>
                  // {selectedCluster.noteIds.length} 件の Note を統合しています...
                </div>
                <PersonaLoading />
              </>
            )}

            {essay && (
              <>
                <div className="edited-text" style={{
                  background: '#fafafa', border: '1px solid #e5e7eb',
                  borderLeft: `3px solid ${accent}`,
                  padding: '24px 28px', borderRadius: '0 6px 6px 0',
                  marginBottom: 20,
                }}>
                  <h2 className="wh2" style={{
                    fontFamily: "'Noto Serif JP', serif",
                    fontSize: 18, fontWeight: 600, marginTop: 0, marginBottom: 16,
                    color: '#111827',
                  }}>
                    {essay.title}
                  </h2>
                  <div
                    dangerouslySetInnerHTML={{ __html: essay.html }}
                    style={{
                      fontFamily: "'Noto Serif JP', serif",
                      fontSize: 14, lineHeight: 1.9, color: '#374151',
                    }}
                  />
                  {essay.question && (
                    <div style={{
                      marginTop: 24, paddingTop: 16,
                      borderTop: '1px dashed #d1d5db',
                    }}>
                      <div style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: accent, marginBottom: 8 }}>
                        // 今、問われていること
                      </div>
                      <div style={{
                        fontFamily: "'Noto Serif JP', serif",
                        fontSize: 14, lineHeight: 1.9, color: '#374151',
                      }}>
                        {essay.question}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={handleSaveEssayAsNote}
                    disabled={saved}
                    style={{
                      background: 'transparent',
                      border: `1px solid ${saved ? '#10b981' : accent}`,
                      color: saved ? '#10b981' : accent,
                      ...mono, fontSize: 9, letterSpacing: '.12em',
                      padding: '8px 16px', cursor: saved ? 'default' : 'pointer',
                      borderRadius: 3,
                    }}
                  >
                    {saved ? 'Note に保存 ✓' : 'Note に保存'}
                  </button>
                  <button
                    onClick={() => handleOpenCluster(selectedCluster)}
                    style={{
                      background: 'transparent',
                      border: '1px solid #e5e7eb', color: '#9ca3af',
                      ...mono, fontSize: 9, letterSpacing: '.12em',
                      padding: '8px 16px', cursor: 'pointer', borderRadius: 3,
                    }}
                  >
                    別の切り口で書き直す
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {error && (
          <div style={{ marginTop: 16, ...mono, fontSize: 11, color: '#f97316', lineHeight: 1.8 }}>
            // エラー: {error}
          </div>
        )}
      </div>
    </div>
  );
}
