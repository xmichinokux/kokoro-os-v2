'use client';

import { useRouter, useParams } from 'next/navigation';
import { useMemo } from 'react';
import { MOCK_PUBLIC_NOTES } from '@/lib/kokoro-browser/mockPublicNotes';
import { GAMESEN_NOTES } from '@/lib/kokoro-browser/gamesenNotes';
import { matchNotesToGamesen } from '@/lib/kokoro-browser/matchNotes';
import { setNoteForTalk } from '@/lib/kokoro/noteLinkage';

const SOURCE_LABELS: Record<string, string> = {
  talk: 'Talk', zen: 'Zen', emi: 'エミ', manual: '手書き',
};

export default function NoteDetailPage() {
  const router = useRouter();
  const params = useParams();
  const noteId = params?.noteId as string;
  const mono = { fontFamily: "'Space Mono', monospace" };

  const note = useMemo(
    () => MOCK_PUBLIC_NOTES.find(n => n.id === noteId),
    [noteId]
  );

  // このNoteが属するゲーセンノートを逆引き
  const belongsTo = useMemo(
    () => GAMESEN_NOTES.filter(g =>
      matchNotesToGamesen(MOCK_PUBLIC_NOTES, g).some(n => n.id === noteId)
    ),
    [noteId]
  );

  if (!note) {
    return (
      <div style={{ padding: 40, ...mono, fontSize: 11, color: '#9ca3af' }}>
        // このNoteは見つかりません
        <br />
        <button onClick={() => router.back()} title="戻る" style={{ marginTop: 16, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer' }}>
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf9', color: '#1a1a1a' }}>

      {/* ヘッダー */}
      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex', alignItems: 'center', gap: 12,
        background: '#ffffff',
      }}>
        <button
          onClick={() => router.push('/kokoro-browser')}
          title="Browserに戻る"
          style={{ ...mono, fontSize: 9, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          ← Browser
        </button>
        <span style={{ ...mono, fontSize: 11, color: '#7c3aed', letterSpacing: '0.15em' }}>
          // Kokoro Browser
        </span>
      </header>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px' }}>

        {/* 所属ゲーセンノートラベル */}
        {belongsTo.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
            {belongsTo.map(g => (
              <span key={g.id} style={{
                ...mono, fontSize: 9,
                color: g.color, border: `1px solid ${g.color}44`,
                padding: '2px 10px', borderRadius: 10,
              }}>
                {g.title}
              </span>
            ))}
          </div>
        )}

        {/* タイトル */}
        <h1 style={{
          fontSize: 22, fontWeight: 700,
          fontFamily: 'Noto Serif JP, serif',
          color: '#1a1a1a', lineHeight: 1.5, marginBottom: 12,
        }}>
          {note.title}
        </h1>

        {/* メタ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
          <span style={{
            ...mono, fontSize: 9, color: '#7c3aed',
            border: '1px solid rgba(124,58,237,0.2)',
            padding: '2px 8px', borderRadius: 10,
          }}>
            {SOURCE_LABELS[note.source] ?? note.source}
          </span>
          <span style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>
            {new Date(note.createdAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>

        {/* 本文 */}
        {note.body && (
          <div style={{
            fontSize: 15, fontFamily: 'Noto Serif JP, serif',
            lineHeight: 2.1, color: '#374151',
            marginBottom: 32, whiteSpace: 'pre-wrap',
          }}>
            {note.body}
          </div>
        )}

        {/* タグ */}
        {(note.tags ?? []).length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 32 }}>
            {note.tags!.map(tag => (
              <span key={tag} style={{
                ...mono, fontSize: 9, color: '#6b7280',
                background: '#f3f4f6', padding: '3px 10px', borderRadius: 10,
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* アクション */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => router.push('/kokoro-browser')}
            title="Browserに戻る"
            style={{
              ...mono, fontSize: 10, color: '#9ca3af',
              background: 'transparent', border: '1px solid #e5e7eb',
              borderRadius: 6, padding: '8px 16px', cursor: 'pointer',
            }}
          >
            ← Browser
          </button>
          <button
            onClick={() => {
              setNoteForTalk({
                id: note.id,
                title: note.title,
                body: note.body ?? '',
                tags: note.tags ?? [],
                topic: note.topic,
                source: note.source,
                createdAt: note.createdAt,
                updatedAt: note.createdAt,
                isPublic: true,
                pinned: false,
              });
              router.push('/kokoro-chat');
            }}
            title="このNoteをTalkで話す"
            style={{
              ...mono, fontSize: 10, color: '#7c3aed',
              background: 'rgba(124,58,237,0.06)',
              border: '1px solid rgba(124,58,237,0.3)',
              borderRadius: 6, padding: '8px 16px', cursor: 'pointer',
            }}
          >
            Talk →
          </button>
        </div>

      </div>
    </div>
  );
}
