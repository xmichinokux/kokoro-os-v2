'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { parseHtml, applyParams, type TunerParam, type ParamCategory } from '@/lib/tunerParser';
import { getAllNotes } from '@/lib/kokoro/noteStorage';
import type { KokoroNote } from '@/types/note';

const mono = { fontFamily: "'Space Mono', monospace" } as const;
const accentColor = '#7c3aed';

const CATEGORIES: { value: ParamCategory; label: string; icon: string }[] = [
  { value: 'balance', label: '数値', icon: '⚙️' },
  { value: 'design', label: 'デザイン', icon: '🎨' },
  { value: 'text', label: 'テキスト', icon: '✏️' },
];

type RightTab = 'params' | 'ai';

export default function KokoroTunerPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [phase, setPhase] = useState<'load' | 'tuning'>('load');
  const [sourceHtml, setSourceHtml] = useState('');
  const [params, setParams] = useState<TunerParam[]>([]);
  const [activeCategory, setActiveCategory] = useState<ParamCategory>('balance');
  const [previewHtml, setPreviewHtml] = useState('');
  const [pasteHtml, setPasteHtml] = useState('');
  const [hasBuilderData, setHasBuilderData] = useState(false);

  // Note ピッカー
  const [showNotePicker, setShowNotePicker] = useState(false);
  const [allNotes, setAllNotes] = useState<KokoroNote[]>([]);
  const [notesLoaded, setNotesLoaded] = useState(false);

  // 右カラムタブ
  const [rightTab, setRightTab] = useState<RightTab>('params');

  // AI 編集
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiHistory, setAiHistory] = useState<{ instruction: string; at: number }[]>([]);

  const loadNotes = useCallback(async () => {
    if (notesLoaded) return;
    const notes = await getAllNotes();
    setAllNotes(notes.filter(n => /<(!doctype|html|body|div|section)/i.test(n.body)));
    setNotesLoaded(true);
  }, [notesLoaded]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('kokoro_world_input');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.strategyHtml) setHasBuilderData(true);
      }
    } catch { /* ignore */ }
  }, []);

  const loadHtml = useCallback((html: string) => {
    const extracted = parseHtml(html);
    setSourceHtml(html);
    setParams(extracted);
    setPreviewHtml(html);
    setAiHistory([]);
    setAiError('');

    if (extracted.some(p => p.category === 'balance')) {
      setActiveCategory('balance');
    } else if (extracted.some(p => p.category === 'design')) {
      setActiveCategory('design');
    } else {
      setActiveCategory('text');
    }

    setPhase('tuning');
  }, []);

  const loadFromBuilder = useCallback(() => {
    try {
      const raw = localStorage.getItem('kokoro_world_input');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.strategyHtml) {
          loadHtml(parsed.strategyHtml);
          return;
        }
      }
    } catch { /* ignore */ }
    alert('Builderのデータが見つかりませんでした');
  }, [loadHtml]);

  const handleFileLoad = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        loadHtml(reader.result);
      }
    };
    reader.readAsText(file);
  }, [loadHtml]);

  const handleParamChange = useCallback((id: string, newValue: number | string) => {
    setParams(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, value: newValue } : p);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const newHtml = applyParams(sourceHtml, updated.map(p => ({ ...p })));
        setPreviewHtml(newHtml);
        setSourceHtml(newHtml);
      }, 150);
      return updated;
    });
  }, [sourceHtml]);

  const handleReset = useCallback(() => {
    const raw = localStorage.getItem('kokoro_world_input');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.strategyHtml) {
          const extracted = parseHtml(parsed.strategyHtml);
          setSourceHtml(parsed.strategyHtml);
          setParams(extracted);
          setPreviewHtml(parsed.strategyHtml);
          setAiHistory([]);
          return;
        }
      } catch { /* ignore */ }
    }
    setPhase('load');
  }, []);

  const handleDownload = useCallback(() => {
    const blob = new Blob([previewHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kokoro-tuner-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [previewHtml]);

  // AI で HTML を書き換え
  const handleAiEdit = useCallback(async () => {
    const instruction = aiInstruction.trim();
    if (!instruction || aiLoading) return;
    setAiLoading(true);
    setAiError('');
    try {
      const res = await fetch('/api/builder-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: previewHtml, instruction }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'AI編集に失敗しました');
      const newHtml = data.code as string;
      // 新しいHTMLをロードし直して、パラメータも再抽出
      const extracted = parseHtml(newHtml);
      setSourceHtml(newHtml);
      setPreviewHtml(newHtml);
      setParams(extracted);
      setAiHistory(prev => [...prev, { instruction, at: Date.now() }]);
      setAiInstruction('');
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'エラー');
    } finally {
      setAiLoading(false);
    }
  }, [aiInstruction, aiLoading, previewHtml]);

  const countByCategory = (cat: ParamCategory) => params.filter(p => p.category === cat).length;
  const activeParams = params.filter(p => p.category === activeCategory);

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#374151', fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 300 }}>
      <header style={{
        padding: '14px 28px', borderBottom: '1px solid #e5e7eb',
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 32, height: 32, border: '1px solid rgba(124,58,237,0.3)',
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(circle at 40% 40%,rgba(124,58,237,0.1) 0%,transparent 70%)',
            fontSize: 16,
          }}>🎛️</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: accentColor }}>Tuner</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>
              プレビュー + スライダー + AI
            </span>
          </div>
        </div>
        <div />
      </header>

      {phase === 'load' ? (
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '48px 28px 100px' }}>
          <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: accentColor, textTransform: 'uppercase', marginBottom: 24 }}>
            // HTMLを読み込んでください
          </div>

          <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
            <button
              onClick={loadFromBuilder}
              disabled={!hasBuilderData}
              style={{
                flex: 1, padding: '16px 20px', textAlign: 'left',
                background: hasBuilderData ? 'rgba(124,58,237,0.04)' : '#f8f9fa',
                border: hasBuilderData ? `2px solid ${accentColor}` : '1px solid #e5e7eb',
                borderRadius: 8, cursor: hasBuilderData ? 'pointer' : 'not-allowed',
                opacity: hasBuilderData ? 1 : 0.5,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 500, color: hasBuilderData ? accentColor : '#9ca3af', marginBottom: 4 }}>
                🔨 Builderから読み込む
              </div>
              <div style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>
                {hasBuilderData ? '直前に生成したHTMLを調整' : 'Builderのデータがありません'}
              </div>
            </button>
            {hasBuilderData && (
              <button
                onClick={() => {
                  try { localStorage.removeItem('kokoro_world_input'); } catch { /* ignore */ }
                  setHasBuilderData(false);
                }}
                title="Builderのデータをリセット"
                style={{
                  ...mono, fontSize: 9, letterSpacing: '0.12em',
                  background: '#fff', border: '1px solid #d1d5db', color: '#9ca3af',
                  padding: '0 14px', borderRadius: 6, cursor: 'pointer',
                }}
              >
                ✕ リセット
              </button>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <button
              onClick={() => { setShowNotePicker(v => !v); if (!notesLoaded) loadNotes(); }}
              style={{
                width: '100%', padding: '16px 20px', textAlign: 'left',
                background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                📎 Noteから読み込む
              </div>
              <div style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>
                過去にNoteへ保存したHTMLを選択
              </div>
            </button>

            {showNotePicker && (
              <div style={{
                marginTop: 8, border: '1px solid #e5e7eb', borderRadius: 8,
                background: '#fafafa', maxHeight: 260, overflowY: 'auto', padding: 8,
              }}>
                {!notesLoaded ? (
                  <div style={{ ...mono, fontSize: 9, color: '#9ca3af', padding: 12, textAlign: 'center' }}>// loading...</div>
                ) : allNotes.length === 0 ? (
                  <div style={{ ...mono, fontSize: 9, color: '#9ca3af', padding: 12, textAlign: 'center' }}>// HTMLを含むNoteがありません</div>
                ) : (
                  allNotes.map(note => (
                    <div key={note.id}
                      onClick={() => { loadHtml(note.body); setShowNotePicker(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderRadius: 4, cursor: 'pointer',
                        background: 'transparent', marginBottom: 2,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,58,237,0.06)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {note.title}
                        </div>
                        <div style={{ ...mono, fontSize: 8, color: '#9ca3af', marginTop: 1 }}>
                          {note.source} · {note.body.length}字
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block', width: '100%', padding: '16px 20px', textAlign: 'left',
              background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer',
            }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                📂 HTMLファイルを開く
              </div>
              <div style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>
                .html ファイルをアップロード
              </div>
              <input type="file" accept=".html,.htm" onChange={handleFileLoad}
                style={{ display: 'none' }} />
            </label>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
              📋 HTMLを貼り付け
            </div>
            <textarea
              value={pasteHtml}
              onChange={e => setPasteHtml(e.target.value)}
              placeholder="<!DOCTYPE html> から始まるHTMLをここに貼り付け"
              style={{
                width: '100%', minHeight: 120, resize: 'vertical',
                fontFamily: "'Space Mono', monospace", fontSize: 11, lineHeight: 1.6,
                background: '#f8f9fa', border: '1px solid #d1d5db', borderRadius: 6,
                padding: 12, outline: 'none', color: '#374151',
              }}
            />
            <button
              onClick={() => pasteHtml.trim() && loadHtml(pasteHtml.trim())}
              disabled={!pasteHtml.trim()}
              style={{
                ...mono, fontSize: 10, letterSpacing: '0.12em', background: accentColor, border: 'none', color: '#fff',
                padding: '10px 20px', borderRadius: 4, cursor: pasteHtml.trim() ? 'pointer' : 'not-allowed',
                marginTop: 8, opacity: pasteHtml.trim() ? 1 : 0.5,
              }}
            >
              読み込む
            </button>
          </div>
        </div>
      ) : (
        /* === 調整フェーズ 2カラムレイアウト === */
        <div className="tuner-split" style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 400px',
          gap: 16,
          padding: '16px 20px 100px',
          height: 'calc(100vh - 64px)',
          boxSizing: 'border-box',
        }}>
          {/* 左: プレビュー */}
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
            <div style={{ ...mono, fontSize: 9, letterSpacing: '0.2em', color: '#059669', textTransform: 'uppercase', marginBottom: 8 }}>
              // ライブプレビュー
            </div>
            <div style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', background: '#f8f9fa', minHeight: 0 }}>
              <iframe
                ref={iframeRef}
                srcDoc={previewHtml}
                scrolling="yes"
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                sandbox="allow-scripts allow-same-origin allow-pointer-lock"
                title="Tuner Preview"
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button onClick={handleDownload} style={{
                ...mono, fontSize: 10, letterSpacing: '0.12em', background: accentColor, border: 'none', color: '#fff',
                padding: '8px 16px', borderRadius: 4, cursor: 'pointer',
              }}>Download ↓</button>
              <button onClick={handleReset} style={{
                ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #f59e0b', color: '#f59e0b',
                padding: '8px 16px', borderRadius: 4, cursor: 'pointer',
              }}>リセット</button>
              <button onClick={() => { setPhase('load'); setPasteHtml(''); }} style={{
                ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
                padding: '8px 16px', borderRadius: 4, cursor: 'pointer',
              }}>別のHTMLを読み込む</button>
            </div>
          </div>

          {/* 右: コントロール */}
          <div style={{
            display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%',
            border: '1px solid #e5e7eb', borderRadius: 8, background: '#ffffff', overflow: 'hidden',
          }}>
            {/* タブ */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#fafafa' }}>
              <button
                onClick={() => setRightTab('params')}
                style={{
                  flex: 1, padding: '10px 8px', textAlign: 'center',
                  background: rightTab === 'params' ? '#fff' : 'transparent',
                  border: 'none', borderBottom: rightTab === 'params' ? `2px solid ${accentColor}` : '2px solid transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', color: rightTab === 'params' ? accentColor : '#9ca3af' }}>
                  ⚙️ Params
                </div>
              </button>
              <button
                onClick={() => setRightTab('ai')}
                style={{
                  flex: 1, padding: '10px 8px', textAlign: 'center',
                  background: rightTab === 'ai' ? '#fff' : 'transparent',
                  border: 'none', borderBottom: rightTab === 'ai' ? `2px solid ${accentColor}` : '2px solid transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', color: rightTab === 'ai' ? accentColor : '#9ca3af' }}>
                  ✨ AI Edit
                </div>
              </button>
            </div>

            {/* タブ中身 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 14, minHeight: 0 }}>
              {rightTab === 'params' && (
                <>
                  {params.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.8 }}>
                      このHTMLには調整可能なパラメータが検出されませんでした。AI Editタブで自由に修正できます。
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                        {CATEGORIES.map(cat => {
                          const count = countByCategory(cat.value);
                          if (count === 0) return null;
                          return (
                            <button
                              key={cat.value}
                              onClick={() => setActiveCategory(cat.value)}
                              style={{
                                flex: 1, padding: '6px 4px', textAlign: 'center',
                                background: activeCategory === cat.value ? 'rgba(124,58,237,0.08)' : '#f8f9fa',
                                border: activeCategory === cat.value ? `1px solid ${accentColor}` : '1px solid #e5e7eb',
                                borderRadius: 4, cursor: 'pointer',
                              }}
                            >
                              <div style={{ fontSize: 12 }}>{cat.icon}</div>
                              <div style={{ fontSize: 9, fontWeight: 500, color: activeCategory === cat.value ? accentColor : '#6b7280' }}>
                                {cat.label}
                              </div>
                              <div style={{ ...mono, fontSize: 8, color: '#9ca3af' }}>{count}</div>
                            </button>
                          );
                        })}
                      </div>
                      <div>
                        {activeParams.map(p => (
                          <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                            <div style={{ ...mono, fontSize: 9, color: '#6b7280', marginBottom: 4, wordBreak: 'break-word' }}>
                              {p.label}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {p.type === 'number' && (
                                <>
                                  <input
                                    type="range"
                                    min={p.min}
                                    max={p.max}
                                    step={p.step}
                                    value={p.value as number}
                                    onChange={e => handleParamChange(p.id, parseFloat(e.target.value))}
                                    style={{ flex: 1, accentColor }}
                                  />
                                  <input
                                    type="number"
                                    value={p.value as number}
                                    min={p.min}
                                    max={p.max}
                                    step={p.step}
                                    onChange={e => handleParamChange(p.id, parseFloat(e.target.value) || 0)}
                                    style={{
                                      ...mono, width: 56, fontSize: 10, textAlign: 'right',
                                      background: '#fff', border: '1px solid #d1d5db', borderRadius: 3,
                                      padding: '3px 5px', outline: 'none', color: '#374151',
                                    }}
                                  />
                                </>
                              )}
                              {p.type === 'color' && (
                                <>
                                  <input
                                    type="color"
                                    value={p.value as string}
                                    onChange={e => handleParamChange(p.id, e.target.value)}
                                    style={{ width: 36, height: 26, border: '1px solid #d1d5db', borderRadius: 3, cursor: 'pointer', padding: 1 }}
                                  />
                                  <span style={{ ...mono, fontSize: 10, color: '#6b7280' }}>
                                    {p.value as string}
                                  </span>
                                </>
                              )}
                              {p.type === 'text' && (
                                <input
                                  type="text"
                                  value={p.value as string}
                                  onChange={e => handleParamChange(p.id, e.target.value)}
                                  style={{
                                    flex: 1, fontSize: 11,
                                    fontFamily: "'Noto Sans JP', sans-serif",
                                    background: '#fff', border: '1px solid #d1d5db', borderRadius: 3,
                                    padding: '4px 6px', outline: 'none', color: '#374151',
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {rightTab === 'ai' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ ...mono, fontSize: 9, letterSpacing: '0.12em', color: '#9ca3af', lineHeight: 1.7 }}>
                    // HTMLを自然言語で編集
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.7 }}>
                    「背景を黒に」「ヘッダーを大きく」「アニメーションをゆっくり」など、日本語でHTML全体を書き換えできます。
                  </div>
                  <textarea
                    value={aiInstruction}
                    onChange={e => setAiInstruction(e.target.value)}
                    onKeyDown={e => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleAiEdit();
                    }}
                    disabled={aiLoading}
                    placeholder="例: 背景を濃いグレーにして、ボタンの角をもっと丸く"
                    style={{
                      width: '100%', minHeight: 90, resize: 'vertical',
                      fontFamily: "'Noto Sans JP', sans-serif", fontSize: 12, lineHeight: 1.6,
                      background: '#f8f9fa', border: '1px solid #d1d5db', borderRadius: 4,
                      padding: 10, outline: 'none', color: '#374151', boxSizing: 'border-box',
                    }}
                  />
                  <button
                    onClick={handleAiEdit}
                    disabled={!aiInstruction.trim() || aiLoading}
                    style={{
                      ...mono, fontSize: 10, letterSpacing: '0.14em',
                      background: aiLoading || !aiInstruction.trim() ? '#e5e7eb' : accentColor,
                      border: 'none', color: aiLoading || !aiInstruction.trim() ? '#9ca3af' : '#fff',
                      padding: '10px 16px', borderRadius: 4,
                      cursor: aiLoading || !aiInstruction.trim() ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {aiLoading ? '// AI編集中（最大90秒）...' : '✨ AIで編集 (Cmd+Enter)'}
                  </button>
                  {aiError && (
                    <div style={{ ...mono, fontSize: 10, color: '#ef4444', padding: 8, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 4, lineHeight: 1.6 }}>
                      {aiError}
                    </div>
                  )}
                  {aiHistory.length > 0 && (
                    <div>
                      <div style={{ ...mono, fontSize: 9, letterSpacing: '0.12em', color: '#9ca3af', marginTop: 8, marginBottom: 6 }}>
                        // 編集履歴 ({aiHistory.length})
                      </div>
                      {aiHistory.slice().reverse().map((h, i) => (
                        <div key={h.at + '-' + i} style={{
                          fontSize: 10, color: '#6b7280', padding: '6px 8px',
                          background: '#fafafa', border: '1px solid #f3f4f6', borderRadius: 3,
                          marginBottom: 4, lineHeight: 1.6,
                        }}>
                          {h.instruction}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 900px) {
          .tuner-split {
            grid-template-columns: 1fr !important;
            height: auto !important;
          }
        }
      `}</style>
    </div>
  );
}
