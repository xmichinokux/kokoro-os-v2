'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { GAMESEN_NOTES } from '@/lib/kokoro-browser/gamesenNotes';
import { MOCK_PUBLIC_NOTES } from '@/lib/kokoro-browser/mockPublicNotes';
import { matchNotesToGamesen } from '@/lib/kokoro-browser/matchNotes';
import { getAllNotes } from '@/lib/kokoro/noteStorage';
import type { PublicNote, GamesenNote } from '@/types/browser';
import type { KokoroNote } from '@/types/note';

const SOURCE_LABELS: Record<string, string> = {
  talk: 'Talk', zen: 'Zen', emi: 'エミ', manual: '手書き',
};

const SONOTA_ID = 'sonota';

const SONOTA_GAMESEN: GamesenNote = {
  id: SONOTA_ID,
  title: 'その他',
  description: 'どの棚にも入らなかった、でも公開されている記録。',
  keywords: [],
  color: '#9ca3af',
};

export default function KokoroBrowserPage() {
  const router = useRouter();
  const mono = { fontFamily: "'Space Mono', monospace" };
  const [selectedId, setSelectedId] = useState<string>(GAMESEN_NOTES[0].id);

  const selectedGamesen = useMemo(
    () => GAMESEN_NOTES.find(g => g.id === selectedId) ?? GAMESEN_NOTES[0],
    [selectedId]
  );

  // localStorageの公開Noteを取得してPublicNote形式に変換
  const localPublicNotes: PublicNote[] = useMemo(() => {
    if (typeof window === 'undefined') return [];
    try {
      const all: KokoroNote[] = getAllNotes();
      return all
        .filter(n => n.isPublic)
        .map(n => ({
          id: n.id,
          title: n.title,
          body: n.body,
          tags: n.tags,
          topic: n.topic,
          source: n.source as PublicNote['source'],
          createdAt: n.createdAt,
          isPublic: true as const,
        }));
    } catch {
      return [];
    }
  }, []);

  const allPublicNotes = useMemo(
    () => [...localPublicNotes, ...MOCK_PUBLIC_NOTES],
    [localPublicNotes]
  );

  const matchedNotes = useMemo(
    () => matchNotesToGamesen(allPublicNotes, selectedGamesen),
    [allPublicNotes, selectedGamesen]
  );

  // どのゲーセンノートにも属さない公開Note
  const sonotaNotes = useMemo(() => {
    return allPublicNotes.filter(note => {
      const belongsToAny = GAMESEN_NOTES.some(g =>
        matchNotesToGamesen([note], g).length > 0
      );
      return !belongsToAny;
    });
  }, [allPublicNotes]);

  // 表示するNote（選択中タブに応じて切り替え）
  const displayedNotes = selectedId === SONOTA_ID ? sonotaNotes : matchedNotes;

  // 選択中のゲーセンノート（その他タブ対応）
  const currentGamesen = selectedId === SONOTA_ID ? SONOTA_GAMESEN : selectedGamesen;

  return (
    <div style={{ minHeight: '100vh', background: '#f8f8f7', color: '#1a1a1a' }}>

      {/* ブラウザ枠ヘッダー */}
      <header style={{
        background: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        {/* 上段：ナビゲーションバー */}
        <div style={{
          padding: '10px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: '1px solid #f3f4f6',
        }}>
          <button
            onClick={() => router.push('/kokoro-chat')}
            style={{
              ...mono, fontSize: 9, color: '#9ca3af',
              background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            ← Talk
          </button>
          {/* アドレスバー風 */}
          <div style={{
            flex: 1, maxWidth: 400,
            background: '#f3f4f6', borderRadius: 20,
            padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>🔒</span>
            <span style={{ ...mono, fontSize: 10, color: '#6b7280', letterSpacing: '0.05em' }}>
              kokoro://browser
            </span>
          </div>
        </div>

        {/* タブ行 */}
        <div style={{
          display: 'flex', overflowX: 'auto',
          padding: '0 12px',
          gap: 2,
          scrollbarWidth: 'none',
        }}>
          <style>{`.browser-tabs::-webkit-scrollbar { display: none }`}</style>
          {GAMESEN_NOTES.map(g => {
            const count = matchNotesToGamesen(allPublicNotes, g).length;
            return (
              <button
                key={g.id}
                onClick={() => setSelectedId(g.id)}
                style={{
                  flexShrink: 0,
                  padding: '10px 16px',
                  background: selectedId === g.id ? '#f8f8f7' : 'transparent',
                  border: 'none',
                  borderBottom: selectedId === g.id
                    ? `2px solid ${g.color}`
                    : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {/* カラードット */}
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: selectedId === g.id ? g.color : '#d1d5db',
                  flexShrink: 0, display: 'inline-block',
                  transition: 'background 0.15s',
                }} />

                {/* タブ名 */}
                <span style={{
                  ...mono, fontSize: 10,
                  color: selectedId === g.id ? '#1a1a1a' : '#9ca3af',
                  fontWeight: selectedId === g.id ? 600 : 400,
                  whiteSpace: 'nowrap',
                }}>
                  {g.title}
                </span>

                {/* 件数バッジ */}
                {count > 0 && (
                  <span style={{
                    ...mono, fontSize: 8,
                    color: selectedId === g.id ? g.color : '#9ca3af',
                    background: selectedId === g.id ? `${g.color}18` : '#f3f4f6',
                    border: `1px solid ${selectedId === g.id ? `${g.color}44` : '#e5e7eb'}`,
                    padding: '0px 5px',
                    borderRadius: 8,
                    lineHeight: '16px',
                    transition: 'all 0.15s',
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          {/* その他タブ */}
          {(() => {
            const count = sonotaNotes.length;
            return (
              <button
                onClick={() => setSelectedId(SONOTA_ID)}
                style={{
                  flexShrink: 0,
                  padding: '10px 16px',
                  background: selectedId === SONOTA_ID ? '#f8f8f7' : 'transparent',
                  border: 'none',
                  borderBottom: selectedId === SONOTA_ID
                    ? '2px solid #9ca3af'
                    : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: selectedId === SONOTA_ID ? '#9ca3af' : '#d1d5db',
                  flexShrink: 0, display: 'inline-block',
                }} />
                <span style={{
                  ...mono, fontSize: 10,
                  color: selectedId === SONOTA_ID ? '#1a1a1a' : '#9ca3af',
                  fontWeight: selectedId === SONOTA_ID ? 600 : 400,
                  whiteSpace: 'nowrap',
                }}>
                  その他
                </span>
                {count > 0 && (
                  <span style={{
                    ...mono, fontSize: 8,
                    color: '#9ca3af',
                    background: '#f3f4f6',
                    border: '1px solid #e5e7eb',
                    padding: '0px 5px', borderRadius: 8, lineHeight: '16px',
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })()}
        </div>
      </header>

      {/* タイムライン本体 */}
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px' }}>

        {/* 選択中ゲーセンノートの説明 */}
        <div style={{
          marginBottom: 20, padding: '12px 16px',
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderLeft: `3px solid ${currentGamesen.color}`,
          borderRadius: 6,
        }}>
          <div style={{ ...mono, fontSize: 9, color: currentGamesen.color, marginBottom: 4 }}>
            // {currentGamesen.title}
          </div>
          <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
            {currentGamesen.description}
          </div>
        </div>

        {/* Note件数 */}
        <div style={{
          ...mono, fontSize: 9, color: '#9ca3af',
          marginBottom: 16, letterSpacing: '0.1em',
        }}>
          // {displayedNotes.length} 件の記録
        </div>

        {/* タイムライン */}
        {displayedNotes.length === 0 ? (
          <div style={{
            padding: '60px 0', textAlign: 'center',
            ...mono, fontSize: 10, color: '#9ca3af', letterSpacing: '0.1em',
          }}>
            // まだここに記録はない
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {displayedNotes.map((note, idx) => (
              <NoteTimelineItem
                key={note.id}
                note={note}
                accentColor={currentGamesen.color}
                isLast={idx === displayedNotes.length - 1}
                onClick={() => router.push(`/kokoro-browser/${note.id}`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

/* ─── タイムラインアイテム ─── */
function NoteTimelineItem({
  note, accentColor, isLast, onClick,
}: {
  note: PublicNote;
  accentColor: string;
  isLast: boolean;
  onClick: () => void;
}) {
  const mono = { fontFamily: "'Space Mono', monospace" };

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      {/* タイムライン軸 */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        flexShrink: 0, paddingTop: 20,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: accentColor, flexShrink: 0,
          boxShadow: `0 0 0 2px ${accentColor}22`,
        }} />
        {!isLast && (
          <div style={{
            width: 1, flex: 1, minHeight: 24,
            background: '#e5e7eb', marginTop: 4,
          }} />
        )}
      </div>

      {/* カード */}
      <button
        onClick={onClick}
        style={{
          flex: 1, textAlign: 'left',
          padding: '16px 0 24px',
          background: 'transparent',
          border: 'none', cursor: 'pointer',
        }}
      >
        {/* 日付・ソース */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
        }}>
          <span style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>
            {new Date(note.createdAt).toLocaleDateString('ja-JP', {
              month: 'short', day: 'numeric',
            })}
          </span>
          <span style={{
            ...mono, fontSize: 9, color: accentColor,
            border: `1px solid ${accentColor}33`,
            padding: '1px 6px', borderRadius: 8,
          }}>
            {SOURCE_LABELS[note.source] ?? note.source}
          </span>
        </div>

        {/* タイトル */}
        <div style={{
          fontSize: 15, fontWeight: 600,
          fontFamily: 'Noto Serif JP, serif',
          color: '#1a1a1a', marginBottom: 8,
          lineHeight: 1.5,
        }}>
          {note.title}
        </div>

        {/* 本文プレビュー */}
        {note.body && (
          <div style={{
            fontSize: 13, color: '#6b7280',
            fontFamily: 'Noto Serif JP, serif',
            lineHeight: 1.8,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            marginBottom: 10,
          }}>
            {note.body}
          </div>
        )}

        {/* タグ */}
        {(note.tags ?? []).length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {(note.tags ?? []).slice(0, 4).map(tag => (
              <span key={tag} style={{
                ...mono, fontSize: 9, color: '#9ca3af',
                background: '#f3f4f6',
                padding: '1px 8px', borderRadius: 8,
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </button>
    </div>
  );
}
