'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { GAMESEN_NOTES } from '@/lib/kokoro-browser/gamesenNotes';
import { MOCK_PUBLIC_NOTES } from '@/lib/kokoro-browser/mockPublicNotes';
import { matchNotesToGamesen } from '@/lib/kokoro-browser/matchNotes';
import type { PublicNote } from '@/types/browser';

const SOURCE_LABELS: Record<string, string> = {
  talk: 'Talk', zen: 'Zen', emi: 'エミ', manual: '手書き',
};

export default function KokoroBrowserPage() {
  const router = useRouter();
  const mono = { fontFamily: "'Space Mono', monospace" };
  const [selectedId, setSelectedId] = useState<string>(GAMESEN_NOTES[0].id);

  const selectedGamesen = useMemo(
    () => GAMESEN_NOTES.find(g => g.id === selectedId) ?? GAMESEN_NOTES[0],
    [selectedId]
  );

  const matchedNotes = useMemo(
    () => matchNotesToGamesen(MOCK_PUBLIC_NOTES, selectedGamesen),
    [selectedGamesen]
  );

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
          {GAMESEN_NOTES.map(g => (
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
              <span style={{
                ...mono, fontSize: 10,
                color: selectedId === g.id ? '#1a1a1a' : '#9ca3af',
                fontWeight: selectedId === g.id ? 600 : 400,
                whiteSpace: 'nowrap',
              }}>
                {g.title}
              </span>
            </button>
          ))}
        </div>
      </header>

      {/* タイムライン本体 */}
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px' }}>

        {/* 選択中ゲーセンノートの説明 */}
        <div style={{
          marginBottom: 20, padding: '12px 16px',
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderLeft: `3px solid ${selectedGamesen.color}`,
          borderRadius: 6,
        }}>
          <div style={{ ...mono, fontSize: 9, color: selectedGamesen.color, marginBottom: 4 }}>
            // {selectedGamesen.title}
          </div>
          <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
            {selectedGamesen.description}
          </div>
        </div>

        {/* Note件数 */}
        <div style={{
          ...mono, fontSize: 9, color: '#9ca3af',
          marginBottom: 16, letterSpacing: '0.1em',
        }}>
          // {matchedNotes.length} 件の記録
        </div>

        {/* タイムライン */}
        {matchedNotes.length === 0 ? (
          <div style={{
            padding: '60px 0', textAlign: 'center',
            ...mono, fontSize: 10, color: '#9ca3af', letterSpacing: '0.1em',
          }}>
            // まだここに記録はない
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {matchedNotes.map((note, idx) => (
              <NoteTimelineItem
                key={note.id}
                note={note}
                accentColor={selectedGamesen.color}
                isLast={idx === matchedNotes.length - 1}
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
