'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { saveToNote } from '@/lib/saveToNote';
import { getAllNotes } from '@/lib/kokoro/noteStorage';
import type { KokoroNote } from '@/types/note';
import PersonaLoading from '@/components/PersonaLoading';

type DiscussionItem = { persona: string; text: string };
type ActionItem = { task: string; persona?: string };
type BoardResult = {
  discussion: DiscussionItem[];
  action_items: ActionItem[];
  conclusion: string;
};

const PERSONA_MAP: Record<string, { name: string; icon: string; color: string }> = {
  gnome: { name: 'ノーム', icon: '🌱', color: '#d97706' },
  shin:  { name: 'シン',   icon: '🔍', color: '#2563eb' },
  canon: { name: 'カノン', icon: '🌙', color: '#7c3aed' },
  dig:   { name: 'ディグ', icon: '🎧', color: '#059669' },
  emi:   { name: 'エミ',   icon: '🌊', color: '#db2777' },
};

export default function KokoroBoardPage() {
  const mono = { fontFamily: "'Space Mono', monospace" };
  const accentColor = '#0ea5e9';

  const [agenda, setAgenda] = useState('');
  const [result, setResult] = useState<BoardResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [retryMsg, setRetryMsg] = useState('');
  const [visibleCount, setVisibleCount] = useState(0);
  const discussionRef = useRef<HTMLDivElement>(null);

  /* ─── 資料（Note添付） ─── */
  const [showNotePicker, setShowNotePicker] = useState(false);
  const [allNotes, setAllNotes] = useState<KokoroNote[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [notesLoaded, setNotesLoaded] = useState(false);

  const loadNotes = useCallback(async () => {
    if (notesLoaded) return;
    const notes = await getAllNotes();
    setAllNotes(notes.filter(n => n.body.trim()));
    setNotesLoaded(true);
  }, [notesLoaded]);

  const toggleNote = (id: string) => {
    setSelectedNoteIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedNotes = allNotes.filter(n => selectedNoteIds.has(n.id));

  const canSubmit = agenda.trim().length > 0 && !isLoading;

  /* ─── 会議開始 ─── */
  const handleStart = useCallback(async () => {
    if (!agenda.trim()) return;
    setIsLoading(true);
    setError('');
    setResult(null);
    setSaved(false);
    setVisibleCount(0);

    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch('/api/kokoro-board', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agenda: agenda.trim(),
            materials: selectedNotes.length > 0
              ? selectedNotes.map(n => `[${n.title}]\n${n.body}`)
              : undefined,
          }),
        });
        const data = await res.json();
        if (res.status === 529 || data.error === 'overloaded') {
          if (attempt < MAX_RETRIES) {
            setRetryMsg(`混雑中…自動リトライします（${attempt + 1}/${MAX_RETRIES}）`);
            await new Promise(r => setTimeout(r, 3000));
            continue;
          }
          setError('サーバーが混雑しています。しばらく待ってからお試しください。');
          break;
        }
        if (!res.ok || data.error) throw new Error(data.error || '会議の生成に失敗しました');
        setResult(data.data);
        break;
      } catch (e) {
        if (attempt < MAX_RETRIES && retryMsg) {
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        setError(e instanceof Error ? e.message : 'エラーが発生しました');
        break;
      }
    }
    setRetryMsg('');
    setIsLoading(false);
  }, [agenda]);

  /* ─── 発言を順番に表示するアニメーション ─── */
  useEffect(() => {
    if (!result) return;
    const total = result.discussion.length;
    if (visibleCount >= total) return;

    const timer = setTimeout(() => {
      setVisibleCount(prev => prev + 1);
      // 自動スクロール
      if (discussionRef.current) {
        discussionRef.current.scrollTop = discussionRef.current.scrollHeight;
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [result, visibleCount]);

  const allRevealed = result && visibleCount >= result.discussion.length;

  /* ─── Note保存 ─── */
  const handleSaveToNote = async () => {
    if (!result) return;
    let body = `会議: ${agenda}\n\n`;
    body += '[議論]\n';
    body += result.discussion.map(d => {
      const p = PERSONA_MAP[d.persona] || { name: d.persona };
      return `${p.name}：${d.text}`;
    }).join('\n');
    body += '\n\n[アクションアイテム]\n';
    body += result.action_items.map(a => {
      const p = a.persona ? PERSONA_MAP[a.persona]?.name || a.persona : '';
      return `✓ ${a.task}${p ? `（${p}）` : ''}`;
    }).join('\n');
    body += `\n\n[結論]\n${result.conclusion}`;

    await saveToNote(body, 'Board');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  /* ─── sessionStorage ─── */
  useEffect(() => {
    const raw = sessionStorage.getItem('boardFromTalk');
    if (!raw) return;
    sessionStorage.removeItem('boardFromTalk');
    let userText = '';
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.userText === 'string') userText = parsed.userText;
    } catch {
      userText = raw;
    }
    if (userText) setAgenda(userText);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#374151' }}>

      <header style={{
        padding: '14px 28px', borderBottom: '1px solid #e5e7eb',
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 32, height: 32, border: `1px solid rgba(14,165,233,0.3)`,
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(circle at 40% 40%,rgba(14,165,233,0.1) 0%,transparent 70%)',
            fontSize: 16,
          }}>👥</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: accentColor }}>Board</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>5人格が会議するAI</span>
          </div>
        </div>
        <div />
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 28px 120px' }}>

        {/* 参加人格一覧 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {Object.entries(PERSONA_MAP).map(([id, p]) => (
            <div key={id} style={{
              ...mono, fontSize: 9, letterSpacing: '.06em',
              padding: '4px 12px', borderRadius: 14,
              border: `1px solid ${p.color}20`,
              color: p.color, background: `${p.color}08`,
            }}>
              {p.icon} {p.name}
            </div>
          ))}
        </div>

        {/* アジェンダ入力 */}
        <label style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', display: 'block', marginBottom: 10 }}>
          // お題
        </label>
        <textarea
          value={agenda}
          onChange={e => setAgenda(e.target.value)}
          placeholder="例：Q3の売上について振り返り、来期の方針を決める。"
          style={{
            width: '100%', background: '#f8f9fa',
            border: '1px solid #d1d5db', borderLeft: '2px solid #d1d5db',
            borderRadius: '0 4px 4px 0',
            padding: 14, fontSize: 14, color: '#111827',
            resize: 'vertical', outline: 'none', minHeight: 80,
            fontFamily: "'Noto Serif JP', serif", lineHeight: 1.8,
            boxSizing: 'border-box', marginBottom: 12,
          }}
          onFocus={e => e.currentTarget.style.borderLeftColor = accentColor}
          onBlur={e => e.currentTarget.style.borderLeftColor = '#d1d5db'}
        />

        {/* 📎 資料を添付 */}
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => { setShowNotePicker(!showNotePicker); if (!notesLoaded) loadNotes(); }}
            style={{
              ...mono, fontSize: 9, letterSpacing: '.1em',
              color: selectedNoteIds.size > 0 ? accentColor : '#9ca3af',
              background: 'transparent', border: `1px solid ${selectedNoteIds.size > 0 ? accentColor : '#e5e7eb'}`,
              padding: '6px 14px', borderRadius: 4, cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            📎 資料を添付{selectedNoteIds.size > 0 ? ` (${selectedNoteIds.size})` : ''}
          </button>

          {/* 選択済みのタグ表示 */}
          {selectedNotes.length > 0 && !showNotePicker && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {selectedNotes.map(n => (
                <div key={n.id} style={{
                  ...mono, fontSize: 8, letterSpacing: '.06em',
                  padding: '3px 10px', borderRadius: 10,
                  background: '#f0f9ff', border: '1px solid #bae6fd',
                  color: '#0369a1', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {n.title.slice(0, 20)}{n.title.length > 20 ? '…' : ''}
                  <span
                    onClick={() => toggleNote(n.id)}
                    style={{ cursor: 'pointer', opacity: 0.6 }}
                  >×</span>
                </div>
              ))}
            </div>
          )}

          {/* ノート選択パネル */}
          {showNotePicker && (
            <div style={{
              marginTop: 8, border: '1px solid #e5e7eb', borderRadius: 8,
              background: '#fafafa', maxHeight: 240, overflowY: 'auto',
              padding: 8,
            }}>
              {!notesLoaded ? (
                <div style={{ ...mono, fontSize: 9, color: '#9ca3af', padding: 12, textAlign: 'center' }}>
                  // loading...
                </div>
              ) : allNotes.length === 0 ? (
                <div style={{ ...mono, fontSize: 9, color: '#9ca3af', padding: 12, textAlign: 'center' }}>
                  // Noteがありません
                </div>
              ) : (
                allNotes.map(note => {
                  const selected = selectedNoteIds.has(note.id);
                  return (
                    <div
                      key={note.id}
                      onClick={() => toggleNote(note.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderRadius: 4, cursor: 'pointer',
                        background: selected ? '#f0f9ff' : 'transparent',
                        border: `1px solid ${selected ? '#bae6fd' : 'transparent'}`,
                        marginBottom: 2,
                        transition: 'all 0.1s',
                      }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                        border: `1.5px solid ${selected ? accentColor : '#d1d5db'}`,
                        background: selected ? accentColor : '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 10,
                      }}>
                        {selected ? '✓' : ''}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {note.title}
                        </div>
                        <div style={{ ...mono, fontSize: 8, color: '#9ca3af', marginTop: 1 }}>
                          {note.source} · {note.body.length}字
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <button
          onClick={handleStart}
          disabled={!canSubmit}
          style={{
            width: '100%', background: 'transparent',
            border: `1px solid ${canSubmit ? accentColor : '#d1d5db'}`,
            color: canSubmit ? accentColor : '#9ca3af',
            ...mono, fontSize: 10, letterSpacing: '.2em',
            padding: 13, cursor: canSubmit ? 'pointer' : 'not-allowed',
            borderRadius: 2,
          }}
        >
          {isLoading ? '// 会議中...' : 'Yoroshiku'}
        </button>

        {isLoading && <PersonaLoading />}

        {retryMsg && (
          <div style={{ marginTop: 12, ...mono, fontSize: 11, color: '#f59e0b', lineHeight: 1.8 }}>
            // {retryMsg}
          </div>
        )}
        {error && (
          <div style={{ marginTop: 12, ...mono, fontSize: 11, color: '#ef4444', lineHeight: 1.8 }}>
            // エラー: {error}
          </div>
        )}

        {/* ─── 会議の様子 ─── */}
        {result && (
          <div style={{ marginTop: 28 }}>
            <div style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', marginBottom: 16 }}>
              // 会議の様子
            </div>

            <div
              ref={discussionRef}
              style={{
                maxHeight: 500, overflowY: 'auto',
                border: '1px solid #e5e7eb', borderRadius: 8,
                padding: '16px 20px', background: '#fafafa',
                marginBottom: 20,
              }}
            >
              {result.discussion.slice(0, visibleCount).map((item, i) => {
                const p = PERSONA_MAP[item.persona] || { name: item.persona, icon: '💭', color: '#6b7280' };
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex', gap: 12, marginBottom: 16,
                      animation: 'fadeUp 0.3s ease-out forwards',
                    }}
                  >
                    {/* アバター */}
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      border: `1.5px solid ${p.color}`,
                      background: `${p.color}10`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, flexShrink: 0, marginTop: 2,
                    }}>
                      {p.icon}
                    </div>
                    {/* 発言 */}
                    <div style={{ flex: 1 }}>
                      <div style={{ ...mono, fontSize: 9, color: p.color, letterSpacing: '.08em', marginBottom: 4 }}>
                        {p.name}
                      </div>
                      <div style={{
                        fontSize: 14, lineHeight: 1.8, color: '#374151',
                        fontFamily: "'Noto Serif JP', serif",
                        whiteSpace: 'pre-wrap',
                      }}>
                        {item.text}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* 入力中インジケーター */}
              {!allRevealed && visibleCount > 0 && (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    border: '1px solid #d1d5db', background: '#f3f4f6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10,
                  }}>
                    💭
                  </div>
                  <div style={{ ...mono, fontSize: 9, color: '#9ca3af', animation: 'pulse 1.5s ease-in-out infinite' }}>
                    typing...
                  </div>
                </div>
              )}
            </div>

            {/* ─── 結論エリア（全発言表示後に表示） ─── */}
            {allRevealed && (
              <>
                {/* アクションアイテム */}
                <div style={{
                  background: '#f8f9fa', border: '1px solid #e5e7eb',
                  padding: 20, marginBottom: 12,
                  animation: 'fadeUp 0.4s ease-out both',
                }}>
                  <div style={{ ...mono, fontSize: 8, letterSpacing: '.2em', color: accentColor, marginBottom: 14 }}>
                    // アクションアイテム
                  </div>
                  {result.action_items.map((a, i) => {
                    const p = a.persona ? PERSONA_MAP[a.persona] : null;
                    return (
                      <div
                        key={i}
                        style={{
                          fontSize: 13, color: '#374151', lineHeight: 1.8,
                          padding: '8px 0',
                          borderBottom: i < result.action_items.length - 1 ? '1px solid #e5e7eb' : 'none',
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}
                      >
                        <span>✓ {a.task}</span>
                        {p && (
                          <span style={{ ...mono, fontSize: 8, color: p.color, padding: '2px 8px', border: `1px solid ${p.color}30`, borderRadius: 10 }}>
                            {p.icon} {p.name}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 結論 */}
                <div style={{
                  background: '#f8f9fa', border: '1px solid #e5e7eb',
                  borderLeft: `3px solid ${accentColor}`,
                  padding: '18px 20px', borderRadius: '0 8px 8px 0',
                  animation: 'fadeUp 0.4s 0.2s ease-out both',
                  marginBottom: 16,
                }}>
                  <div style={{ ...mono, fontSize: 8, letterSpacing: '.14em', color: accentColor, marginBottom: 8 }}>
                    // 結論
                  </div>
                  <div style={{
                    fontSize: 14, color: '#374151', lineHeight: 1.9,
                    fontFamily: "'Noto Serif JP', serif",
                    whiteSpace: 'pre-wrap',
                  }}>
                    {result.conclusion}
                  </div>
                </div>

                {/* Note保存 */}
                <button
                  onClick={handleSaveToNote}
                  disabled={saved}
                  style={{
                    background: 'transparent',
                    border: `1px solid ${saved ? '#10b981' : '#d1d5db'}`,
                    color: saved ? '#10b981' : '#9ca3af',
                    ...mono, fontSize: 8, letterSpacing: '.12em',
                    padding: '8px 16px', cursor: saved ? 'default' : 'pointer',
                    borderRadius: 3,
                  }}
                >
                  {saved ? 'Note ✓' : 'Note +'}
                </button>
              </>
            )}
          </div>
        )}

        <style>{`
          @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        `}</style>
      </div>
    </div>
  );
}
