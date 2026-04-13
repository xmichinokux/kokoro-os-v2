'use client';

import { useState, useMemo, useEffect } from 'react';
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

const STORAGE_KEY = 'kokoroBrowserCustomGamesen';

function loadCustomGamesen(): GamesenNote[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomGamesen(notes: GamesenNote[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export default function KokoroBrowserPage() {
  const router = useRouter();
  const mono = { fontFamily: "'Space Mono', monospace" };

  const [customGamesen, setCustomGamesen] = useState<GamesenNote[]>([]);
  const [selectedId, setSelectedId] = useState<string>(GAMESEN_NOTES[0].id);

  // ゲーセンノート作成フォーム
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [newColor, setNewColor] = useState('#7c3aed');

  // 編集モード
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editKeywords, setEditKeywords] = useState('');

  useEffect(() => {
    setCustomGamesen(loadCustomGamesen());
  }, []);

  const allGamesen = useMemo(
    () => [...GAMESEN_NOTES, ...customGamesen],
    [customGamesen]
  );

  const selectedGamesen = useMemo(
    () => allGamesen.find(g => g.id === selectedId) ?? GAMESEN_NOTES[0],
    [selectedId, allGamesen]
  );

  // 公開Noteを取得してPublicNote形式に変換
  const [localPublicNotes, setLocalPublicNotes] = useState<PublicNote[]>([]);
  useEffect(() => {
    getAllNotes().then(all => {
      setLocalPublicNotes(
        all.filter(n => n.isPublic).map(n => ({
          id: n.id,
          title: n.title,
          body: n.body,
          tags: n.tags,
          topic: n.topic,
          source: n.source as PublicNote['source'],
          createdAt: n.createdAt,
          isPublic: true as const,
        }))
      );
    });
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
      const belongsToAny = allGamesen.some(g =>
        matchNotesToGamesen([note], g).length > 0
      );
      return !belongsToAny;
    });
  }, [allPublicNotes, allGamesen]);

  const displayedNotes = selectedId === SONOTA_ID ? sonotaNotes : matchedNotes;
  const currentGamesen = selectedId === SONOTA_ID ? SONOTA_GAMESEN : selectedGamesen;

  // ゲーセンノート作成
  const handleCreateGamesen = () => {
    const title = newTitle.trim();
    const keywords = newKeywords.split(/[,、\s]+/).map(k => k.trim()).filter(Boolean);
    if (!title || keywords.length === 0) return;

    const newNote: GamesenNote = {
      id: `custom_${Date.now()}`,
      title,
      description: `${keywords.slice(0, 3).join('・')} に関する記録。`,
      keywords,
      color: newColor,
    };

    const updated = [...customGamesen, newNote];
    setCustomGamesen(updated);
    saveCustomGamesen(updated);
    setNewTitle('');
    setNewKeywords('');
    setShowCreateForm(false);
    setSelectedId(newNote.id);
  };

  // ゲーセンノート削除
  const handleDeleteGamesen = (id: string) => {
    const updated = customGamesen.filter(g => g.id !== id);
    setCustomGamesen(updated);
    saveCustomGamesen(updated);
    if (selectedId === id) setSelectedId(GAMESEN_NOTES[0].id);
    setEditingId(null);
  };

  // ゲーセンノート編集保存
  const handleSaveEdit = (id: string) => {
    const title = editTitle.trim();
    const keywords = editKeywords.split(/[,、\s]+/).map(k => k.trim()).filter(Boolean);
    if (!title || keywords.length === 0) return;

    const updated = customGamesen.map(g =>
      g.id === id
        ? { ...g, title, keywords, description: `${keywords.slice(0, 3).join('・')} に関する記録。` }
        : g
    );
    setCustomGamesen(updated);
    saveCustomGamesen(updated);
    setEditingId(null);
  };

  const isCustom = (id: string) => customGamesen.some(g => g.id === id);

  const COLOR_CHOICES = ['#7c3aed', '#c084fc', '#60a5fa', '#34d399', '#fb923c', '#f59e0b', '#ef4444', '#db2777'];

  return (
    <div style={{ minHeight: '100vh', background: '#f8f8f7', color: '#1a1a1a' }}>

      {/* ヘッダー（基本レイアウト） */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky', top: 0, background: '#fff', zIndex: 20,
      }}>
        <div>
          <span style={{ ...mono, fontSize: 13, fontWeight: 700 }}>Kokoro</span>
          <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: '#7c3aed', marginLeft: 4 }}>OS</span>
          <span style={{ ...mono, fontSize: 9, color: '#9ca3af', marginLeft: 8, letterSpacing: '0.15em' }}>// Browser</span>
        </div>
        <button onClick={() => router.push('/kokoro-chat')} title="Talk に戻る"
          style={{ ...mono, fontSize: 9, color: '#6b7280', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 2, padding: '6px 12px', cursor: 'pointer' }}>
          ← Talk
        </button>
      </header>

      {/* タブ行 */}
      <div style={{
        background: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky', top: 45, zIndex: 15,
      }}>
        <div style={{
          display: 'flex', overflowX: 'auto',
          padding: '0 12px',
          gap: 2,
          scrollbarWidth: 'none',
        }}>
          <style>{`.browser-tabs::-webkit-scrollbar { display: none }`}</style>
          {allGamesen.map(g => {
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

          {/* ＋ ゲーセンノート作成ボタン */}
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            title="ゲーセンノートを作る"
            style={{
              flexShrink: 0,
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: '2px solid transparent',
              cursor: 'pointer',
              ...mono, fontSize: 12,
              color: showCreateForm ? '#7c3aed' : '#d1d5db',
              transition: 'color 0.15s',
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* タイムライン本体 */}
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px' }}>

        {/* ゲーセンノート作成フォーム */}
        {showCreateForm && (
          <div style={{
            marginBottom: 20, padding: '20px',
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
          }}>
            <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginBottom: 12, letterSpacing: '0.12em' }}>
              // ゲーセンノートを作る
            </div>
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="ノート名（例：創作の種）"
              style={{
                width: '100%', padding: '8px 12px',
                border: '1px solid #e5e7eb', borderRadius: 6,
                fontSize: 14, color: '#1a1a1a', outline: 'none',
                fontFamily: "'Noto Serif JP', serif",
                boxSizing: 'border-box', marginBottom: 10,
              }}
            />
            <input
              type="text"
              value={newKeywords}
              onChange={e => setNewKeywords(e.target.value)}
              placeholder="キーワード（カンマ区切り：創作、アイデア、表現）"
              style={{
                width: '100%', padding: '8px 12px',
                border: '1px solid #e5e7eb', borderRadius: 6,
                fontSize: 13, color: '#1a1a1a', outline: 'none',
                fontFamily: "'Space Mono', monospace",
                boxSizing: 'border-box', marginBottom: 10,
              }}
            />
            {/* カラー選択 */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center' }}>
              <span style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>色:</span>
              {COLOR_CHOICES.map(c => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: c, border: newColor === c ? '2px solid #1a1a1a' : '1px solid #e5e7eb',
                    cursor: 'pointer', padding: 0,
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleCreateGamesen}
                disabled={!newTitle.trim() || !newKeywords.trim()}
                title="作成"
                style={{
                  ...mono, fontSize: 10, letterSpacing: '0.1em',
                  padding: '8px 20px',
                  background: (!newTitle.trim() || !newKeywords.trim()) ? '#f3f4f6' : '#7c3aed',
                  color: (!newTitle.trim() || !newKeywords.trim()) ? '#9ca3af' : '#ffffff',
                  border: 'none', borderRadius: 6,
                  cursor: (!newTitle.trim() || !newKeywords.trim()) ? 'not-allowed' : 'pointer',
                }}
              >
                Yoroshiku
              </button>
              <button
                onClick={() => { setShowCreateForm(false); setNewTitle(''); setNewKeywords(''); }}
                title="キャンセル"
                style={{
                  ...mono, fontSize: 10, color: '#9ca3af',
                  background: 'transparent', border: '1px solid #e5e7eb',
                  borderRadius: 6, padding: '8px 16px', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* 選択中ゲーセンノートの説明 */}
        <div style={{
          marginBottom: 20, padding: '12px 16px',
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderLeft: `3px solid ${currentGamesen.color}`,
          borderRadius: 6,
        }}>
          {editingId === currentGamesen.id ? (
            /* 編集モード */
            <div>
              <input
                type="text"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                style={{
                  width: '100%', padding: '6px 10px',
                  border: '1px solid #e5e7eb', borderRadius: 4,
                  fontSize: 14, color: '#1a1a1a', outline: 'none',
                  fontFamily: "'Noto Serif JP', serif",
                  boxSizing: 'border-box', marginBottom: 8,
                }}
              />
              <input
                type="text"
                value={editKeywords}
                onChange={e => setEditKeywords(e.target.value)}
                placeholder="キーワード（カンマ区切り）"
                style={{
                  width: '100%', padding: '6px 10px',
                  border: '1px solid #e5e7eb', borderRadius: 4,
                  fontSize: 12, color: '#6b7280', outline: 'none',
                  ...mono, boxSizing: 'border-box', marginBottom: 8,
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleSaveEdit(currentGamesen.id)} title="保存"
                  style={{ ...mono, fontSize: 9, color: '#7c3aed', background: 'transparent', border: '1px solid #c4b5fd', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' }}>
                  Save
                </button>
                <button onClick={() => setEditingId(null)} title="キャンセル"
                  style={{ ...mono, fontSize: 9, color: '#9ca3af', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={() => handleDeleteGamesen(currentGamesen.id)} title="削除"
                  style={{ ...mono, fontSize: 9, color: '#ef4444', background: 'transparent', border: '1px solid #fca5a5', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', marginLeft: 'auto' }}>
                  Delete
                </button>
              </div>
            </div>
          ) : (
            /* 表示モード */
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ ...mono, fontSize: 9, color: currentGamesen.color, marginBottom: 4 }}>
                  // {currentGamesen.title}
                </div>
                {isCustom(currentGamesen.id) && (
                  <button
                    onClick={() => {
                      setEditingId(currentGamesen.id);
                      setEditTitle(currentGamesen.title);
                      setEditKeywords(currentGamesen.keywords.join('、'));
                    }}
                    title="編集"
                    style={{ ...mono, fontSize: 8, color: '#9ca3af', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    edit
                  </button>
                )}
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
                {currentGamesen.description}
              </div>
              {/* キーワード表示 */}
              {currentGamesen.keywords.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                  {currentGamesen.keywords.map(kw => (
                    <span key={kw} style={{
                      ...mono, fontSize: 8, color: currentGamesen.color,
                      border: `1px solid ${currentGamesen.color}33`,
                      padding: '1px 6px', borderRadius: 8,
                    }}>
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
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
