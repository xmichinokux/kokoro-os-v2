'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { loadWorldInput, clearWorldInput, type WorldInput } from '@/lib/worldInput';
import { saveToNote } from '@/lib/saveToNote';
import PersonaLoading from '@/components/PersonaLoading';

type InputMode = 'strategy' | 'direct';

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
  const router = useRouter();
  const mono = { fontFamily: "'Space Mono', monospace" };
  const accentColor = '#10b981';

  const [inputMode, setInputMode] = useState<InputMode>('strategy');
  const [strategyInput, setStrategyInput] = useState<WorldInput | null>(null);
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

  useEffect(() => {
    const loaded = loadWorldInput();
    setStrategyInput(loaded);
    if (!loaded) setInputMode('direct');
    return () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current); };
  }, []);

  const canSubmit = inputMode === 'strategy'
    ? !!strategyInput && !isLoading
    : directText.trim().length > 0 && !isLoading;

  const handleGenerate = useCallback(async (retryCount = 0) => {
    if (!canSubmit) return;
    setIsLoading(true);
    setError('');
    setRetryMsg('');
    if (retryCount === 0) {
      setGeneratedHtml('');
      setSaved(false);
    }

    try {
      const body = inputMode === 'strategy'
        ? { strategyText: strategyInput!.strategyText, demoType }
        : { directText: directText.trim(), demoType };

      const res = await fetch('/api/kokoro-world', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
  }, [canSubmit, inputMode, strategyInput, directText, demoType]);

  // iframe に HTML を書き込む
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
    if (inputMode === 'strategy') {
      clearWorldInput();
      setStrategyInput(null);
    }
    setDirectText('');
    setGeneratedHtml('');
    setError('');
    setRetryMsg('');
    setSaved(false);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const INPUT_MODES: { key: InputMode; label: string }[] = [
    { key: 'strategy', label: 'Strategy から' },
    { key: 'direct',   label: '直接入力' },
  ];

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
        <button onClick={() => router.push('/kokoro-chat')} title="Talk に戻る"
          style={{ ...mono, fontSize: 9, color: '#6b7280', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 2, padding: '6px 12px', cursor: 'pointer' }}>
          ← Talk
        </button>
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 28px 100px' }}>

        {/* 入力モード切替タブ */}
        {!generatedHtml && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
            {INPUT_MODES.map(m => (
              <button
                key={m.key}
                onClick={() => { setInputMode(m.key); setError(''); }}
                style={{
                  ...mono, fontSize: 10, letterSpacing: '.1em',
                  padding: '8px 20px', borderRadius: 2, cursor: 'pointer',
                  border: `1px solid ${inputMode === m.key ? accentColor : '#d1d5db'}`,
                  color: inputMode === m.key ? '#fff' : '#9ca3af',
                  background: inputMode === m.key ? accentColor : 'transparent',
                  fontWeight: inputMode === m.key ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {/* Strategy モード: インプットステータス */}
        {inputMode === 'strategy' && !generatedHtml && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', marginBottom: 12 }}>
              // INPUT STATUS
            </div>
            {strategyInput ? (
              <div style={{
                padding: '16px 20px', border: `1px solid ${accentColor}`,
                borderRadius: 6, background: 'rgba(16,185,129,0.04)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 16 }}>⚡</span>
                  <span style={{ ...mono, fontSize: 10, fontWeight: 600, color: '#111827' }}>
                    ✓ Strategy から読み込み済み
                  </span>
                  <span style={{ ...mono, fontSize: 8, color: '#9ca3af', marginLeft: 'auto' }}>
                    {formatDate(strategyInput.savedAt)}
                  </span>
                </div>
                <div style={{
                  fontSize: 11, color: '#6b7280', lineHeight: 1.6,
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const,
                }}>
                  {strategyInput.strategyText.slice(0, 200)}
                </div>
              </div>
            ) : (
              <div style={{
                padding: '20px', border: '1px solid #e5e7eb',
                borderRadius: 6, background: '#f9fafb', textAlign: 'center',
              }}>
                <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 10 }}>
                  ✗ Strategy のデータがありません
                </div>
                <button onClick={() => router.push('/kokoro-strategy')}
                  style={{
                    ...mono, fontSize: 9, letterSpacing: '.1em',
                    color: '#f59e0b', background: 'transparent',
                    border: '1px solid rgba(245,158,11,0.4)',
                    borderRadius: 4, padding: '6px 16px', cursor: 'pointer',
                  }}>
                  Strategy へ →
                </button>
              </div>
            )}
          </div>
        )}

        {/* 直接入力モード: テキストエリア */}
        {inputMode === 'direct' && !generatedHtml && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', marginBottom: 10 }}>
              // DIRECT INPUT
            </div>
            <textarea
              value={directText}
              onChange={e => setDirectText(e.target.value)}
              placeholder={"作りたいページの内容を自由に書いてください\n例：猫カフェの紹介ランディングページ。店名は「にゃんハウス」、キャッチコピーは「猫と過ごす、やさしい午後」\n例：フィットネスアプリのUIモック。ダッシュボード・ワークアウト記録・カレンダー画面\n例：「Kokoro OS」のロゴをSVGで3パターン作って"}
              style={{
                width: '100%', minHeight: 140, background: '#f8f9fa',
                border: '1px solid #d1d5db', borderLeft: `2px solid #d1d5db`,
                padding: 16, fontSize: 14, color: '#111827',
                resize: 'vertical', outline: 'none', lineHeight: 1.8,
                fontFamily: "'Noto Serif JP', serif",
                boxSizing: 'border-box', borderRadius: '0 4px 4px 0',
              }}
              onFocus={e => e.currentTarget.style.borderLeftColor = accentColor}
              onBlur={e => e.currentTarget.style.borderLeftColor = '#d1d5db'}
            />
          </div>
        )}

        {/* デモタイプ選択 + Yoroshiku */}
        {!generatedHtml && (inputMode === 'direct' || (inputMode === 'strategy' && strategyInput)) && (
          <>
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

        {/* ローディング */}
        {isLoading && <PersonaLoading />}

        {/* リトライ */}
        {retryMsg && (
          <div style={{ marginTop: 16, textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 13, color: accentColor, marginBottom: 8 }}>{retryMsg}</div>
            <div style={{ ...mono, fontSize: 9, color: '#9ca3af', letterSpacing: '0.12em' }}>// auto-retry in 3s</div>
          </div>
        )}

        {/* エラー */}
        {error && (
          <div style={{ marginTop: 12, ...mono, fontSize: 11, color: '#ef4444', lineHeight: 1.8 }}>
            // エラー: {error}
          </div>
        )}

        {/* 生成結果: iframe */}
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
                style={{
                  width: '100%', height: '70vh', border: 'none',
                  display: 'block', background: '#fff',
                }}
                title="Kokoro World Demo"
              />
            </div>

            {/* アクションボタン */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                onClick={handleDownload}
                title="HTMLファイルとしてダウンロード"
                style={{
                  background: 'transparent',
                  border: `1px solid ${accentColor}`,
                  color: accentColor,
                  ...mono, fontSize: 9, letterSpacing: '.12em',
                  padding: '8px 16px', cursor: 'pointer', borderRadius: 2,
                }}
              >
                Download ↓
              </button>
              <button
                onClick={handleSaveToNote}
                disabled={saved}
                title="Noteに保存"
                style={{
                  background: 'transparent',
                  border: `1px solid ${saved ? '#10b981' : '#d1d5db'}`,
                  color: saved ? '#10b981' : '#9ca3af',
                  ...mono, fontSize: 9, letterSpacing: '.12em',
                  padding: '8px 16px', cursor: saved ? 'default' : 'pointer', borderRadius: 2,
                }}
              >
                {saved ? 'Note ✓' : 'Note +'}
              </button>
              <button
                onClick={handleReset}
                title="リセットして最初から"
                style={{
                  background: 'transparent',
                  border: '1px solid #d1d5db',
                  color: '#9ca3af',
                  ...mono, fontSize: 9, letterSpacing: '.12em',
                  padding: '8px 16px', cursor: 'pointer', borderRadius: 2,
                }}
              >
                Reset ×
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
