'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { GAMESEN_NOTES } from '@/lib/kokoro-browser/gamesenNotes';
import { MOCK_PUBLIC_NOTES } from '@/lib/kokoro-browser/mockPublicNotes';
import { matchNotesToGamesen } from '@/lib/kokoro-browser/matchNotes';
import type { PublicNote } from '@/types/browser';

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
    <div style={{ minHeight: '100vh', background: '#fafaf9', color: '#1a1a1a' }}>

      {/* ヘッダー */}
      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex', alignItems: 'center', gap: 12,
        background: '#ffffff',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={() => router.push('/kokoro-chat')}
          style={{ ...mono, fontSize: 9, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          ← Talk
        </button>
        <span style={{ ...mono, fontSize: 11, color: '#7c3aed', letterSpacing: '0.15em' }}>
          // Kokoro Browser
        </span>
        <span style={{ ...mono, fontSize: 9, color: '#9ca3af', marginLeft: 'auto' }}>
          ゲーセンノート
        </span>
      </header>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>

        {/* キャッチ */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginBottom: 8, letterSpacing: '0.15em' }}>
            // Noteを保存する場所から、再び出会う場所へ
          </div>
          <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.8 }}>
            ゲーセンノートは「視点」です。カテゴリではありません。<br />
            今日の自分に合う棚を選んで、静かに覗いてください。
          </div>
        </div>

        {/* ゲーセンノート棚 */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginBottom: 12, letterSpacing: '0.15em' }}>
            // 棚を選ぶ
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {GAMESEN_NOTES.map(g => (
              <button
                key={g.id}
                onClick={() => setSelectedId(g.id)}
                style={{
                  textAlign: 'left', padding: '14px 18px',
                  background: selectedId === g.id ? '#ffffff' : 'transparent',
                  border: `1px solid ${selectedId === g.id ? g.color : '#e5e7eb'}`,
                  borderLeft: `3px solid ${g.color}`,
                  borderRadius: 8, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{
                  ...mono, fontSize: 11, fontWeight: 600,
                  color: selectedId === g.id ? '#1a1a1a' : '#6b7280',
                  marginBottom: 3,
                }}>
                  {g.title}
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>
                  {g.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 選択中ゲーセンノートのNote一覧 */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
            paddingBottom: 12, borderBottom: '1px solid #e5e7eb',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: selectedGamesen.color,
            }} />
            <span style={{ ...mono, fontSize: 10, color: '#374151' }}>
              {selectedGamesen.title}
            </span>
            <span style={{ ...mono, fontSize: 9, color: '#9ca3af', marginLeft: 'auto' }}>
              {matchedNotes.length}件
            </span>
          </div>

          {matchedNotes.length === 0 ? (
            <div style={{
              padding: '40px 0', textAlign: 'center',
              ...mono, fontSize: 10, color: '#9ca3af', letterSpacing: '0.1em',
            }}>
              // まだここに記録はない
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {matchedNotes.map(note => (
                <NoteCard
                  key={note.id}
                  note={note}
                  accentColor={selectedGamesen.color}
                  onClick={() => router.push(`/kokoro-browser/${note.id}`)}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

/* ─── NoteCard ─── */
function NoteCard({
  note, accentColor, onClick,
}: {
  note: PublicNote;
  accentColor: string;
  onClick: () => void;
}) {
  const mono = { fontFamily: "'Space Mono', monospace" };
  const SOURCE_LABELS: Record<string, string> = {
    talk: 'Talk', zen: 'Zen', emi: 'エミ', manual: '手書き',
  };

  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left', width: '100%',
        padding: '16px 18px',
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderLeft: `2px solid ${accentColor}`,
        borderRadius: 8, cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = accentColor)}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = '#e5e7eb';
        e.currentTarget.style.borderLeftColor = accentColor;
      }}
    >
      {/* タイトル */}
      <div style={{
        fontSize: 14, fontWeight: 600,
        fontFamily: 'Noto Serif JP, serif',
        color: '#1a1a1a', marginBottom: 6, lineHeight: 1.5,
      }}>
        {note.title}
      </div>

      {/* 本文プレビュー */}
      {note.body && (
        <div style={{
          fontSize: 12, color: '#6b7280',
          fontFamily: 'Noto Serif JP, serif',
          lineHeight: 1.7, marginBottom: 10,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {note.body}
        </div>
      )}

      {/* フッター */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          ...mono, fontSize: 9, color: accentColor,
          border: `1px solid ${accentColor}33`,
          padding: '1px 7px', borderRadius: 10,
        }}>
          {SOURCE_LABELS[note.source] ?? note.source}
        </span>
        {(note.tags ?? []).slice(0, 3).map(tag => (
          <span key={tag} style={{
            ...mono, fontSize: 9, color: '#9ca3af',
            background: '#f3f4f6', padding: '1px 7px', borderRadius: 10,
          }}>
            {tag}
          </span>
        ))}
        <span style={{ ...mono, fontSize: 9, color: '#9ca3af', marginLeft: 'auto' }}>
          {new Date(note.createdAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
        </span>
      </div>
    </button>
  );
}
