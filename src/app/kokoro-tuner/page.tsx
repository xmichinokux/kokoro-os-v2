'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { parseHtml, applyParams, type TunerParam, type ParamCategory } from '@/lib/tunerParser';

const mono = { fontFamily: "'Space Mono', monospace" } as const;
const accentColor = '#7c3aed';

const CATEGORIES: { value: ParamCategory; label: string; icon: string }[] = [
  { value: 'balance', label: 'ゲームバランス', icon: '⚖️' },
  { value: 'design', label: 'デザイン', icon: '🎨' },
  { value: 'text', label: 'テキスト', icon: '✏️' },
];

export default function KokoroTunerPage() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [phase, setPhase] = useState<'load' | 'tuning'>('load');
  const [sourceHtml, setSourceHtml] = useState('');
  const [params, setParams] = useState<TunerParam[]>([]);
  const [activeCategory, setActiveCategory] = useState<ParamCategory>('balance');
  const [previewHtml, setPreviewHtml] = useState('');
  const [pasteHtml, setPasteHtml] = useState('');
  const [hasBuilderData, setHasBuilderData] = useState(false);

  // Builderのデータがあるか確認
  useEffect(() => {
    try {
      const raw = localStorage.getItem('kokoro_world_input');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.strategyHtml) setHasBuilderData(true);
      }
    } catch { /* ignore */ }
  }, []);

  // HTMLを読み込んでパラメータ抽出
  const loadHtml = useCallback((html: string) => {
    const extracted = parseHtml(html);
    setSourceHtml(html);
    setParams(extracted);
    setPreviewHtml(html);

    // パラメータがあるカテゴリを初期選択
    if (extracted.some(p => p.category === 'balance')) {
      setActiveCategory('balance');
    } else if (extracted.some(p => p.category === 'design')) {
      setActiveCategory('design');
    } else {
      setActiveCategory('text');
    }

    setPhase('tuning');
  }, []);

  // Builderから読み込み
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

  // ファイルから読み込み
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

  // パラメータ変更（デバウンス付きプレビュー更新）
  const handleParamChange = useCallback((id: string, newValue: number | string) => {
    setParams(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, value: newValue } : p);

      // デバウンス付きプレビュー更新
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const newHtml = applyParams(sourceHtml, updated.map(p => ({ ...p })));
        setPreviewHtml(newHtml);
        setSourceHtml(newHtml); // 次の変更のベースを更新
      }, 150);

      return updated;
    });
  }, [sourceHtml]);

  // 全リセット
  const handleReset = useCallback(() => {
    setParams(prev => prev.map(p => ({ ...p, value: p.originalValue, originalMatch: p.originalMatch })));
    // 元のHTMLでプレビュー再構築（originalMatchが変わっている可能性があるので再パース）
    const raw = localStorage.getItem('kokoro_world_input');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.strategyHtml) {
          const extracted = parseHtml(parsed.strategyHtml);
          setSourceHtml(parsed.strategyHtml);
          setParams(extracted);
          setPreviewHtml(parsed.strategyHtml);
          return;
        }
      } catch { /* ignore */ }
    }
    // フォールバック：ページをリロード
    setPhase('load');
  }, []);

  // ダウンロード
  const handleDownload = useCallback(() => {
    const blob = new Blob([previewHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kokoro-tuner-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [previewHtml]);

  // カテゴリ別パラメータ数
  const countByCategory = (cat: ParamCategory) => params.filter(p => p.category === cat).length;
  const activeParams = params.filter(p => p.category === activeCategory);

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#374151', fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 300 }}>
      {/* ヘッダー */}
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
              パラメータを視覚的に調整
            </span>
          </div>
        </div>
        <button onClick={() => router.push('/')} style={{
          ...mono, fontSize: 9, letterSpacing: '0.12em', color: '#9ca3af',
          background: 'transparent', border: '1px solid #e5e7eb', padding: '5px 14px', borderRadius: 3, cursor: 'pointer',
        }}>← Home</button>
      </header>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '48px 28px 100px' }}>

        {/* === 読み込みフェーズ === */}
        {phase === 'load' && (
          <div>
            <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: accentColor, textTransform: 'uppercase', marginBottom: 24 }}>
              // HTMLを読み込んでください
            </div>

            {/* Builderから */}
            <div style={{ marginBottom: 16 }}>
              <button
                onClick={loadFromBuilder}
                disabled={!hasBuilderData}
                style={{
                  width: '100%', padding: '16px 20px', textAlign: 'left',
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
            </div>

            {/* ファイルから */}
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

            {/* 貼り付け */}
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
        )}

        {/* === 調整フェーズ === */}
        {phase === 'tuning' && (
          <div>
            {/* パラメータが見つからなかった場合 */}
            {params.length === 0 ? (
              <div>
                <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: '#ef4444', textTransform: 'uppercase', marginBottom: 16 }}>
                  // 調整可能なパラメータが見つかりませんでした
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.8, marginBottom: 20 }}>
                  このHTMLにはConfig定数や色指定が検出されませんでした。
                  プレビューのみ表示します。
                </div>
              </div>
            ) : (
              <div>
                {/* カテゴリタブ */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                  {CATEGORIES.map(cat => {
                    const count = countByCategory(cat.value);
                    if (count === 0) return null;
                    return (
                      <button
                        key={cat.value}
                        onClick={() => setActiveCategory(cat.value)}
                        style={{
                          flex: 1, padding: '10px 12px', textAlign: 'center',
                          background: activeCategory === cat.value ? 'rgba(124,58,237,0.06)' : '#f8f9fa',
                          border: activeCategory === cat.value ? `2px solid ${accentColor}` : '1px solid #e5e7eb',
                          borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ fontSize: 16, marginBottom: 2 }}>{cat.icon}</div>
                        <div style={{ fontSize: 11, fontWeight: activeCategory === cat.value ? 500 : 300, color: activeCategory === cat.value ? accentColor : '#6b7280' }}>
                          {cat.label}
                        </div>
                        <div style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>{count}</div>
                      </button>
                    );
                  })}
                </div>

                {/* パラメータコントロール */}
                <div style={{
                  background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: 8,
                  padding: 16, marginBottom: 20, maxHeight: 350, overflowY: 'auto',
                }}>
                  {activeParams.map(p => (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 0',
                      borderBottom: '1px solid #e5e7eb',
                    }}>
                      {/* ラベル */}
                      <div style={{ ...mono, fontSize: 10, color: '#6b7280', minWidth: 120, flexShrink: 0 }}>
                        {p.label}
                      </div>

                      {/* コントロール */}
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
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
                                ...mono, width: 60, fontSize: 10, textAlign: 'right',
                                background: '#fff', border: '1px solid #d1d5db', borderRadius: 4,
                                padding: '4px 6px', outline: 'none', color: '#374151',
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
                              style={{ width: 36, height: 28, border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', padding: 1 }}
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
                              flex: 1, fontSize: 12,
                              fontFamily: "'Noto Sans JP', sans-serif",
                              background: '#fff', border: '1px solid #d1d5db', borderRadius: 4,
                              padding: '6px 8px', outline: 'none', color: '#374151',
                            }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* プレビュー */}
            <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: '#059669', textTransform: 'uppercase', marginBottom: 12 }}>
              // ライブプレビュー
            </div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'auto', marginBottom: 20, background: '#f8f9fa', resize: 'vertical', minHeight: 400 }}>
              <iframe
                ref={iframeRef}
                srcDoc={previewHtml}
                scrolling="yes"
                style={{ width: '100%', height: 667, border: 'none', display: 'block' }}
                sandbox="allow-scripts allow-same-origin allow-pointer-lock"
                title="Tuner Preview"
              />
            </div>

            {/* アクションボタン */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={handleDownload} style={{
                ...mono, fontSize: 10, letterSpacing: '0.12em', background: accentColor, border: 'none', color: '#fff',
                padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
              }}>Download ↓</button>
              <button onClick={handleReset} style={{
                ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #f59e0b', color: '#f59e0b',
                padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
              }}>リセット</button>
              <button onClick={() => { setPhase('load'); setPasteHtml(''); }} style={{
                ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
                padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
              }}>別のHTMLを読み込む</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
