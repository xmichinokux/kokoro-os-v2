'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { saveWorldInput } from '@/lib/worldInput';
import { saveToNote } from '@/lib/saveToNote';
import { getAllNotes } from '@/lib/kokoro/noteStorage';
import type { KokoroNote } from '@/types/note';
import PersonaLoading from '@/components/PersonaLoading';

const OUTPUT_TYPES = [
  { key: 'proposal',      label: '企画書' },
  { key: 'suggestion',    label: '提案書' },
  { key: 'report',        label: '報告書' },
  { key: 'presentation',  label: 'プレゼン原稿' },
  { key: 'free',          label: '自由' },
] as const;

type OutputTypeKey = typeof OUTPUT_TYPES[number]['key'];

function parseEditedHtml(raw: string): { html: string; plain: string } {
  const match = raw.match(/<edited>([\s\S]*?)<\/edited>/);
  const html = match ? match[1].trim() : raw.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

  const plain = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|h2|h3|h4|li|blockquote|ul|ol|hr|div)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { html, plain };
}

export default function KokoroStrategyPage() {
  const router = useRouter();
  const mono = { fontFamily: "'Space Mono', monospace" };
  const accentColor = '#7c3aed';

  const [directInput, setDirectInput] = useState('');
  const [outputType, setOutputType] = useState<OutputTypeKey>('free');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [outputHtml, setOutputHtml] = useState('');
  const [outputPlain, setOutputPlain] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [retryMsg, setRetryMsg] = useState('');
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const combinedSource = [directInput.trim(), noteData].filter(Boolean).join('\n\n---\n\n');
  const hasAny = combinedSource.length > 0;
  const canSubmit = hasAny && !isLoading;

  const handleGenerate = useCallback(async (retryCount = 0) => {
    if (!combinedSource) return;
    setIsLoading(true);
    setError('');
    setRetryMsg('');
    if (retryCount === 0) {
      setOutputHtml('');
      setOutputPlain('');
      setSaved(false);
      setCopied(false);
    }

    try {
      const res = await fetch('/api/kokoro-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceText: combinedSource, outputType }),
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

      const { html, plain } = parseEditedHtml(data.result ?? '');
      setOutputHtml(html);
      setOutputPlain(plain);
      setRetryMsg('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
      setRetryMsg('');
    } finally {
      setIsLoading(false);
    }
  }, [combinedSource, outputType]);

  const handleCopy = async () => {
    if (!outputPlain) return;
    await navigator.clipboard.writeText(outputPlain);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSaveToNote = async () => {
    if (!outputPlain) return;
    await saveToNote(outputPlain, 'Strategy');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDownload = () => {
    if (!outputHtml) return;
    const fullHtml = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><title>Kokoro Strategy</title>
<style>
body{max-width:700px;margin:40px auto;padding:0 20px;font-family:'Noto Serif JP',serif;color:#1a1a1a;line-height:2}
h1{font-size:28px;font-weight:300;text-align:center;margin:0 0 40px}
h2{font-size:13px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.2em;margin:48px 0 20px}
h3{font-size:18px;font-weight:400;margin:32px 0 14px}
p{font-size:15px;font-weight:300;margin:0 0 20px}
strong{font-weight:700;color:#111}
ul,ol{font-size:15px;font-weight:300;margin:0 0 20px;padding-left:20px}
hr{border:none;border-top:1px solid #e8e8e4;margin:40px auto;width:60px}
blockquote{border-left:2px solid #ddd;padding:4px 0 4px 20px;font-style:italic;color:#666;margin:24px 0}
</style></head><body>${outputHtml}</body></html>`;
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kokoro-strategy-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setDirectInput('');
    setSelectedNoteIds(new Set());
    setOutputHtml('');
    setOutputPlain('');
    setError('');
    setRetryMsg('');
    setSaved(false);
    setCopied(false);
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
          <span style={{ ...mono, fontSize: 9, color: '#9ca3af', marginLeft: 8, letterSpacing: '0.15em' }}>// Strategy</span>
        </div>
        <div />
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 28px 120px' }}>

        {/* 直接入力 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', marginBottom: 10 }}>
            // SOURCE TEXT
          </div>
          <textarea
            value={directInput}
            onChange={e => setDirectInput(e.target.value)}
            placeholder={"統合したい素材を自由に記入してください。\nまたは下の「Noteから読み込む」で過去の保存データを取り込めます。"}
            style={{
              width: '100%', minHeight: 140, background: '#f8f9fa',
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

        {/* Noteピッカー */}
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
            {(selectedNoteIds.size > 0 || directInput) && (
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

          {/* 選択済みチップ */}
          {selectedNotes.length > 0 && !showNotePicker && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {selectedNotes.map(n => (
                <div key={n.id} style={{
                  ...mono, fontSize: 8, letterSpacing: '.06em',
                  padding: '3px 10px', borderRadius: 10,
                  background: 'rgba(245,158,11,0.08)', border: `1px solid ${accentColor}`,
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
                      background: selected ? 'rgba(245,158,11,0.06)' : 'transparent',
                      border: `1px solid ${selected ? 'rgba(245,158,11,0.4)' : 'transparent'}`,
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

        {/* 出力タイプ選択 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', marginBottom: 10 }}>
            // OUTPUT TYPE
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {OUTPUT_TYPES.map(t => (
              <button key={t.key} onClick={() => setOutputType(t.key)}
                style={{
                  ...mono, fontSize: 9, letterSpacing: '.08em',
                  padding: '7px 14px', borderRadius: 3, cursor: 'pointer',
                  border: `1px solid ${outputType === t.key ? accentColor : '#d1d5db'}`,
                  color: outputType === t.key ? accentColor : '#9ca3af',
                  background: outputType === t.key ? 'rgba(245,158,11,0.06)' : 'transparent',
                  fontWeight: outputType === t.key ? 600 : 400,
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Yoroshiku ボタン */}
        <button
          onClick={() => handleGenerate()}
          disabled={!canSubmit}
          title="統合ドキュメントを生成"
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

        <div style={{ ...mono, fontSize: 8, color: '#d1d5db', textAlign: 'center', marginTop: 6, letterSpacing: '.1em' }}>
          {hasAny ? `// ${combinedSource.length} chars ready` : '// no sources'}
        </div>

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

        {outputHtml && (
          <div style={{ marginTop: 24 }}>
            <div
              className="edited-text-zone"
              style={{
                minHeight: 200,
                border: '1px solid #e5e7eb',
                borderLeft: `2px solid ${accentColor}`,
                borderRadius: 2,
              }}
            >
              <div className="edited-text" dangerouslySetInnerHTML={{ __html: outputHtml }} />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button onClick={handleCopy} title="クリップボードにコピー"
                style={{
                  background: 'transparent',
                  border: `1px solid ${copied ? accentColor : '#d1d5db'}`,
                  color: copied ? accentColor : '#9ca3af',
                  ...mono, fontSize: 9, letterSpacing: '.12em',
                  padding: '8px 16px', cursor: 'pointer', borderRadius: 2,
                }}>
                {copied ? 'Copy ✓' : 'Copy ↗'}
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
              <button onClick={handleDownload} title="HTMLファイルとしてダウンロード"
                style={{
                  background: 'transparent', border: '1px solid #d1d5db', color: '#9ca3af',
                  ...mono, fontSize: 9, letterSpacing: '.12em',
                  padding: '8px 16px', cursor: 'pointer', borderRadius: 2,
                }}>
                Download ↓
              </button>
              <button
                onClick={() => {
                  saveWorldInput(outputHtml, outputPlain);
                  router.push('/kokoro-world');
                }}
                title="Worldでデモページを生成"
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(16,185,129,0.5)', color: '#10b981',
                  ...mono, fontSize: 9, letterSpacing: '.12em',
                  padding: '8px 16px', cursor: 'pointer', borderRadius: 2,
                }}>
                World →
              </button>
              <button
                onClick={() => router.push('/kokoro-gatekeeper')}
                title="Gatekeeperで仕様書を生成"
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(99,102,241,0.5)', color: '#6366f1',
                  ...mono, fontSize: 9, letterSpacing: '.12em',
                  padding: '8px 16px', cursor: 'pointer', borderRadius: 2,
                }}>
                Gatekeeper →
              </button>
              <button onClick={handleReset} title="インプットをクリアして最初から"
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
