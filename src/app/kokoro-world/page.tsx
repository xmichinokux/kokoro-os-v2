'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { saveToNote } from '@/lib/saveToNote';
import { getAllNotes } from '@/lib/kokoro/noteStorage';
import type { KokoroNote } from '@/types/note';
import PersonaLoading from '@/components/PersonaLoading';

const DEMO_TYPES = [
  { key: 'landing', label: 'ランディングページ', emoji: '🌐' },
  { key: 'appui',   label: 'アプリUIモック',     emoji: '📱' },
  { key: 'slides',  label: 'プレゼンスライド',   emoji: '🎞️' },
  { key: 'pitch',   label: 'ピッチデッキ',       emoji: '📈' },
  { key: 'svg',     label: 'SVGデザイン',        emoji: '✏️' },
  { key: 'auto',    label: 'AIに任せる',         emoji: '✨' },
] as const;

type DemoTypeKey = typeof DEMO_TYPES[number]['key'];

export default function KokoroWorldPage() {
  const mono = { fontFamily: "'Space Mono', monospace" };
  const accentColor = '#7c3aed';

  const [directText, setDirectText] = useState('');
  const [demoType, setDemoType] = useState<DemoTypeKey>('auto');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedHtml, setGeneratedHtml] = useState('');
  const [saved, setSaved] = useState(false);
  const [retryMsg, setRetryMsg] = useState('');
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const MAX_RETRIES = 5;

  // Note ピッカー
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
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedNotes = allNotes.filter(n => selectedNoteIds.has(n.id));
  const noteData = selectedNotes.length > 0
    ? selectedNotes.map(n => `[${n.title}]\n${n.body}`).join('\n\n---\n\n')
    : '';

  useEffect(() => {
    return () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current); };
  }, []);

  const combinedInput = [directText.trim(), noteData].filter(Boolean).join('\n\n---\n\n');
  const canSubmit = combinedInput.length > 0 && !isLoading;

  const handleGenerate = useCallback(async (retryCount = 0) => {
    if (!combinedInput) return;
    setIsLoading(true);
    setError('');
    setRetryMsg('');
    if (retryCount === 0) {
      setGeneratedHtml('');
      setSaved(false);
    }

    try {
      const res = await fetch('/api/kokoro-world', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directText: combinedInput, demoType }),
      });
      const data = await res.json();

      if (data.overloaded || res.status === 529) {
        if (retryCount < MAX_RETRIES) {
          setRetryMsg(`しばらくお待ちください...（${retryCount + 1}/${MAX_RETRIES}）`);
          setIsLoading(false);
          retryTimerRef.current = setTimeout(() => handleGenerate(retryCount + 1), 3000);
          return;
        }
        throw new Error('サーバーが混雑しています。時間をおいて再度お試しください。');
      }

      if (data.error) throw new Error(data.error);

      setGeneratedHtml(data.html ?? '');
      setRetryMsg('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
      setRetryMsg('');
    } finally {
      setIsLoading(false);
    }
  }, [combinedInput, demoType]);

  useEffect(() => {
    if (!generatedHtml || !iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(generatedHtml);
    doc.close();
  }, [generatedHtml]);

  const handleDownload = () => {
    if (!generatedHtml) return;
    const blob = new Blob([generatedHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const d = new Date();
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    a.download = `kokoro_world_${dateStr}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveToNote = async () => {
    if (!generatedHtml) return;
    await saveToNote(generatedHtml, 'World');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setDirectText('');
    setSelectedNoteIds(new Set());
    setGeneratedHtml('');
    setError('');
    setRetryMsg('');
    setSaved(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#374151' }}>

      {/* ヘッダー */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid #e5e7eb',
        position: 'sticky', top: 0, background: '#fff', zIndex: 10,
      }}>
        <div>
          <span style={{ ...mono, fontSize: 13, fontWeight: 700 }}>Kokoro</span>
          <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: '#7c3aed', marginLeft: 4 }}>OS</span>
          <span style={{ ...mono, fontSize: 9, color: '#9ca3af', marginLeft: 8, letterSpacing: '0.15em' }}>// World</span>
        </div>
        <div />
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 28px 120px' }}>

        {!generatedHtml && (
          <>
            {/* 入力テキストエリア */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', marginBottom: 10 }}>
                // INPUT
              </div>
              <textarea
                value={directText}
                onChange={e => setDirectText(e.target.value)}
                placeholder={"作りたいページの内容を自由に書いてください\n例：猫カフェの紹介ランディングページ。店名は「にゃんハウス」、キャッチコピーは「猫と過ごす、やさしい午後」\n例：フィットネスアプリのUIモック\n\n下の「Noteから読み込む」で過去の保存データも併用できます。"}
                style={{
                  width: '100%', minHeight: 160, background: '#f8f9fa',
                  border: '1px solid #d1d5db', borderLeft: '2px solid #d1d5db',
                  padding: 16, fontSize: 14, color: '#111827',
                  resize: 'vertical', outline: 'none', lineHeight: 1.8,
                  fontFamily: "'Noto Serif JP', serif",
                  boxSizing: 'border-box', borderRadius: '0 4px 4px 0',
                }}
                onFocus={e => e.currentTarget.style.borderLeftColor = accentColor}
                onBlur={e => e.currentTarget.style.borderLeftColor = '#d1d5db'}
              />
            </div>

            {/* Noteピッカー + リセット */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  onClick={() => { setShowNotePicker(!showNotePicker); if (!notesLoaded) loadNotes(); }}
                  style={{
                    ...mono, fontSize: 9, letterSpacing: '0.12em',
                    background: '#fff',
                    border: `1px solid ${selectedNoteIds.size > 0 ? accentColor : '#d1d5db'}`,
                    color: selectedNoteIds.size > 0 ? accentColor : '#6b7280',
                    padding: '8px 16px', borderRadius: 3, cursor: 'pointer',
                  }}
                >
                  📎 Noteから読み込む{selectedNoteIds.size > 0 ? ` (${selectedNoteIds.size})` : ''}
                </button>
                {(selectedNoteIds.size > 0 || directText) && (
                  <button
                    onClick={handleReset}
                    style={{
                      ...mono, fontSize: 9, letterSpacing: '0.12em',
                      background: '#fff', border: '1px solid #d1d5db', color: '#9ca3af',
                      padding: '8px 16px', borderRadius: 3, cursor: 'pointer',
                    }}
                  >
                    ✕ リセット
                  </button>
                )}
              </div>

              {selectedNotes.length > 0 && !showNotePicker && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {selectedNotes.map(n => (
                    <div key={n.id} style={{
                      ...mono, fontSize: 8, letterSpacing: '.06em',
                      padding: '3px 10px', borderRadius: 10,
                      background: 'rgba(16,185,129,0.08)', border: `1px solid ${accentColor}`,
                      color: accentColor, display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      {n.title.slice(0, 24)}{n.title.length > 24 ? '…' : ''}
                      <span onClick={() => toggleNote(n.id)} style={{ cursor: 'pointer', opacity: 0.6 }}>×</span>
                    </div>
                  ))}
                </div>
              )}

              {showNotePicker && (
                <div style={{
                  marginTop: 8, border: '1px solid #e5e7eb', borderRadius: 8,
                  background: '#fafafa', maxHeight: 260, overflowY: 'auto', padding: 8,
                }}>
                  {!notesLoaded ? (
                    <div style={{ ...mono, fontSize: 9, color: '#9ca3af', padding: 12, textAlign: 'center' }}>// loading...</div>
                  ) : allNotes.length === 0 ? (
                    <div style={{ ...mono, fontSize: 9, color: '#9ca3af', padding: 12, textAlign: 'center' }}>// Noteがありません</div>
                  ) : (
                    allNotes.map(note => {
                      const selected = selectedNoteIds.has(note.id);
                      return (
                        <div key={note.id} onClick={() => toggleNote(note.id)} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', borderRadius: 4, cursor: 'pointer',
                          background: selected ? 'rgba(16,185,129,0.06)' : 'transparent',
                          border: `1px solid ${selected ? 'rgba(16,185,129,0.4)' : 'transparent'}`,
                          marginBottom: 2,
                        }}>
                          <div style={{
                            width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                            border: `1.5px solid ${selected ? accentColor : '#d1d5db'}`,
                            background: selected ? accentColor : '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: 10,
                          }}>{selected ? '✓' : ''}</div>
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

            {/* デモタイプ選択 */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', marginBottom: 10 }}>
                // DEMO TYPE
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {DEMO_TYPES.map(t => (
                  <button key={t.key} onClick={() => setDemoType(t.key)}
                    style={{
                      ...mono, fontSize: 9, letterSpacing: '.06em',
                      padding: '8px 14px', borderRadius: 3, cursor: 'pointer',
                      border: `1px solid ${demoType === t.key ? accentColor : '#d1d5db'}`,
                      color: demoType === t.key ? accentColor : '#9ca3af',
                      background: demoType === t.key ? 'rgba(16,185,129,0.06)' : 'transparent',
                      fontWeight: demoType === t.key ? 600 : 400,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                    <span style={{ fontSize: 14 }}>{t.emoji}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => handleGenerate()}
              disabled={!canSubmit}
              title="デモページを生成"
              style={{
                width: '100%', background: 'transparent',
                border: `1px solid ${canSubmit ? accentColor : '#d1d5db'}`,
                color: canSubmit ? accentColor : '#9ca3af',
                ...mono, fontSize: 10, letterSpacing: '.2em',
                padding: 13, cursor: canSubmit ? 'pointer' : 'not-allowed',
                borderRadius: 2,
              }}
            >
              Yoroshiku
            </button>
          </>
        )}

        {isLoading && <PersonaLoading />}

        {retryMsg && (
          <div style={{ marginTop: 16, textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 13, color: accentColor, marginBottom: 8 }}>{retryMsg}</div>
            <div style={{ ...mono, fontSize: 9, color: '#9ca3af', letterSpacing: '0.12em' }}>// auto-retry in 3s</div>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 12, ...mono, fontSize: 11, color: '#ef4444', lineHeight: 1.8 }}>
            // エラー: {error}
          </div>
        )}

        {generatedHtml && (
          <div style={{ marginTop: 24 }}>
            <div style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', marginBottom: 10 }}>
              // GENERATED DEMO
            </div>
            <div style={{
              border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}>
              <iframe
                ref={iframeRef}
                sandbox="allow-scripts allow-same-origin"
                style={{ width: '100%', height: '70vh', border: 'none', display: 'block', background: '#fff' }}
                title="Kokoro World Demo"
              />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button onClick={handleDownload} title="HTMLファイルとしてダウンロード"
                style={{
                  background: 'transparent',
                  border: `1px solid ${accentColor}`, color: accentColor,
                  ...mono, fontSize: 9, letterSpacing: '.12em',
                  padding: '8px 16px', cursor: 'pointer', borderRadius: 2,
                }}>
                Download ↓
              </button>
              <button onClick={handleSaveToNote} disabled={saved} title="Noteに保存"
                style={{
                  background: 'transparent',
                  border: `1px solid ${saved ? '#10b981' : '#d1d5db'}`,
                  color: saved ? '#10b981' : '#9ca3af',
                  ...mono, fontSize: 9, letterSpacing: '.12em',
                  padding: '8px 16px', cursor: saved ? 'default' : 'pointer', borderRadius: 2,
                }}>
                {saved ? 'Note ✓' : 'Note +'}
              </button>
              <button onClick={handleReset} title="リセットして最初から"
                style={{
                  background: 'transparent', border: '1px solid #d1d5db', color: '#9ca3af',
                  ...mono, fontSize: 9, letterSpacing: '.12em',
                  padding: '8px 16px', cursor: 'pointer', borderRadius: 2,
                }}>
                Reset ×
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
