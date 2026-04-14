'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import PersonaLoading from '@/components/PersonaLoading';

const mono = { fontFamily: "'Space Mono', monospace" } as const;
const accentColor = '#7c3aed';

type BuildType = 'html' | 'hybrid' | 'auto';

const BUILD_OPTIONS: { value: BuildType; label: string; desc: string }[] = [
  { value: 'html', label: 'シングルHTMLファイル（Claude）', desc: 'CDN経由で外部ライブラリを読み込み。すぐ動く。' },
  { value: 'hybrid', label: 'Hybrid（Gemini設計 + Claude実装）', desc: 'Geminiが設計→Claudeが実装。高品質。' },
  { value: 'auto', label: 'AIに任せる', desc: '仕様書から最適なライブラリを自動選択。' },
];

type HybridStep = 'idle' | 'gemini' | 'claude';

export default function KokoroBuilderPage() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const prevBlobUrlRef = useRef<string | null>(null);

  const [spec, setSpec] = useState('');
  const [buildType, setBuildType] = useState<BuildType>('html');
  const [fromGatekeeper, setFromGatekeeper] = useState(false);
  const [phase, setPhase] = useState<'input' | 'generating' | 'done'>('input');
  const [generatedCode, setGeneratedCode] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  // Hybrid用
  const [hybridStep, setHybridStep] = useState<HybridStep>('idle');
  const [geminiInstruction, setGeminiInstruction] = useState('');
  const [showInstruction, setShowInstruction] = useState(false);

  // Gatekeeperからの読み込み
  useEffect(() => {
    try {
      const raw = localStorage.getItem('kokoro_builder_input');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.spec) {
          setSpec(parsed.spec);
          setFromGatekeeper(true);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // blob URL cleanup
  useEffect(() => {
    return () => {
      if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current);
    };
  }, []);

  // プレビュー表示共通処理
  const showPreview = useCallback((code: string) => {
    setGeneratedCode(code);
    if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current);
    const blob = new Blob([code], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    prevBlobUrlRef.current = url;
    setPreviewUrl(url);
    setPhase('done');
  }, []);

  // 通常モード（html / auto）のコード生成
  const handleBuildNormal = useCallback(async () => {
    if (!spec.trim()) return;
    setPhase('generating');
    setError('');
    setGeneratedCode('');
    setPreviewUrl(null);
    setShowCode(false);
    setCopied(false);
    setGeminiInstruction('');
    setShowInstruction(false);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const res = await fetch('/api/kokoro-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: spec.trim(), buildType }),
        signal: controller.signal,
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(`サーバーエラー（${res.status}）: ${text.slice(0, 100)}`); }
      if (data.error) throw new Error(data.error);
      showPreview(data.code as string);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError('タイムアウト: コード生成に時間がかかりすぎました。');
      } else {
        setError(e instanceof Error ? e.message : 'コード生成に失敗しました');
      }
      setPhase('input');
    } finally {
      clearTimeout(timeoutId);
    }
  }, [spec, buildType, showPreview]);

  // Hybridモードのコード生成（2段階）
  const handleBuildHybrid = useCallback(async () => {
    if (!spec.trim()) return;
    setPhase('generating');
    setError('');
    setGeneratedCode('');
    setPreviewUrl(null);
    setShowCode(false);
    setCopied(false);
    setGeminiInstruction('');
    setShowInstruction(false);
    setHybridStep('gemini');

    try {
      // Step 1: Geminiで実装指示書を生成
      const controller1 = new AbortController();
      const timeoutId1 = setTimeout(() => controller1.abort(), 120000);

      let instruction: string;
      try {
        const res1 = await fetch('/api/kokoro-builder-hybrid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spec: spec.trim(), step: 'gemini' }),
          signal: controller1.signal,
        });
        const text1 = await res1.text();
        let data1;
        try { data1 = JSON.parse(text1); } catch { throw new Error(`サーバーエラー（${res1.status}）: ${text1.slice(0, 100)}`); }
        if (data1.error) throw new Error(data1.error);
        instruction = data1.instruction as string;
        setGeminiInstruction(instruction);
      } finally {
        clearTimeout(timeoutId1);
      }

      // Step 2: Claudeでコード生成
      setHybridStep('claude');
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 120000);

      try {
        const res2 = await fetch('/api/kokoro-builder-hybrid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spec: spec.trim(), step: 'claude', instruction }),
          signal: controller2.signal,
        });
        const text2 = await res2.text();
        let data2;
        try { data2 = JSON.parse(text2); } catch { throw new Error(`サーバーエラー（${res2.status}）: ${text2.slice(0, 100)}`); }
        if (data2.error) throw new Error(data2.error);
        showPreview(data2.code as string);
      } finally {
        clearTimeout(timeoutId2);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError('タイムアウト: 処理に時間がかかりすぎました。');
      } else {
        setError(e instanceof Error ? e.message : 'コード生成に失敗しました');
      }
      setPhase('input');
    } finally {
      setHybridStep('idle');
    }
  }, [spec, showPreview]);

  // ビルド実行（タイプに応じて分岐）
  const handleBuild = useCallback(() => {
    if (buildType === 'hybrid') {
      handleBuildHybrid();
    } else {
      handleBuildNormal();
    }
  }, [buildType, handleBuildHybrid, handleBuildNormal]);

  // HTMLダウンロード
  const handleDownload = useCallback(() => {
    if (!generatedCode) return;
    const blob = new Blob([generatedCode], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kokoro-builder-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [generatedCode]);

  // コードをコピー
  const handleCopy = useCallback(async () => {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = generatedCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generatedCode]);

  // Worldへ渡す
  const handleToWorld = useCallback(() => {
    if (!generatedCode) return;
    localStorage.setItem('kokoro_world_input', JSON.stringify({
      strategyHtml: generatedCode,
      strategyText: spec,
      savedAt: new Date().toISOString(),
      source: 'builder',
    }));
    router.push('/kokoro-world');
  }, [generatedCode, spec, router]);

  // リセット
  const handleReset = useCallback(() => {
    setPhase('input');
    setGeneratedCode('');
    setPreviewUrl(null);
    setError('');
    setShowCode(false);
    setCopied(false);
    setGeminiInstruction('');
    setShowInstruction(false);
    setHybridStep('idle');
    if (prevBlobUrlRef.current) {
      URL.revokeObjectURL(prevBlobUrlRef.current);
      prevBlobUrlRef.current = null;
    }
  }, []);

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
          }}>🔨</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: accentColor }}>Builder</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>
              仕様書からコードを自動生成
            </span>
          </div>
        </div>
        <button
          onClick={() => router.push('/')}
          style={{
            ...mono, fontSize: 9, letterSpacing: '0.12em', color: '#9ca3af',
            background: 'transparent', border: '1px solid #e5e7eb',
            padding: '5px 14px', borderRadius: 3, cursor: 'pointer',
          }}
        >← Home</button>
      </header>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '48px 28px 100px' }}>

        {/* インプットフェーズ */}
        {phase === 'input' && (
          <div>
            <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: accentColor, textTransform: 'uppercase', marginBottom: 16 }}>
              // 仕様書を入力してください
            </div>

            {fromGatekeeper && (
              <div style={{
                ...mono, fontSize: 9, letterSpacing: '0.1em',
                color: '#059669', background: '#f0fdf4', border: '1px solid #bbf7d0',
                padding: '8px 14px', borderRadius: 4, marginBottom: 16,
              }}>
                ✓ Gatekeeperから読み込み済み
              </div>
            )}

            <textarea
              value={spec}
              onChange={e => { setSpec(e.target.value); setFromGatekeeper(false); }}
              placeholder="仕様書をここに貼り付けてください"
              style={{
                width: '100%', minHeight: 200, resize: 'vertical',
                fontFamily: "'Noto Sans JP', sans-serif", fontSize: 13, lineHeight: 1.8,
                background: '#f8f9fa', border: '1px solid #d1d5db', borderRadius: 6,
                padding: 16, outline: 'none', color: '#374151',
              }}
            />

            {/* 生成タイプ選択 */}
            <div style={{ marginTop: 24 }}>
              <div style={{ ...mono, fontSize: 9, letterSpacing: '0.16em', color: '#9ca3af', marginBottom: 10, textTransform: 'uppercase' }}>
                // 生成タイプ
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {BUILD_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setBuildType(opt.value)}
                    style={{
                      textAlign: 'left', padding: '10px 14px',
                      background: buildType === opt.value ? 'rgba(124,58,237,0.06)' : '#f8f9fa',
                      border: buildType === opt.value ? `2px solid ${accentColor}` : '1px solid #e5e7eb',
                      borderRadius: 6, cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ ...mono, fontSize: 10, marginRight: 8, color: buildType === opt.value ? accentColor : '#9ca3af' }}>
                      {buildType === opt.value ? '◉' : '○'}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: buildType === opt.value ? 500 : 300, color: buildType === opt.value ? accentColor : '#374151' }}>
                      {opt.label}
                    </span>
                    <span style={{ ...mono, fontSize: 9, color: '#9ca3af', marginLeft: 10 }}>
                      {opt.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Yoroshiku ボタン */}
            <button
              onClick={handleBuild}
              disabled={!spec.trim()}
              style={{
                ...mono, fontSize: 11, letterSpacing: '0.16em',
                background: accentColor, border: 'none', color: '#fff',
                padding: '14px 32px', borderRadius: 4, cursor: spec.trim() ? 'pointer' : 'not-allowed',
                marginTop: 24, opacity: spec.trim() ? 1 : 0.5,
                display: 'block', width: '100%',
              }}
            >
              Yoroshiku
            </button>
          </div>
        )}

        {/* 生成中 */}
        {phase === 'generating' && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            {buildType === 'hybrid' ? (
              <>
                {/* Hybrid: 2段階表示 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {/* Step 1 */}
                  <div style={{
                    padding: '16px 20px', borderRadius: 8,
                    background: hybridStep === 'gemini' ? 'rgba(59,130,246,0.06)' : hybridStep === 'claude' ? 'rgba(16,185,129,0.06)' : '#f8f9fa',
                    border: `1px solid ${hybridStep === 'gemini' ? 'rgba(59,130,246,0.3)' : hybridStep === 'claude' ? 'rgba(16,185,129,0.3)' : '#e5e7eb'}`,
                  }}>
                    <div style={{ ...mono, fontSize: 10, letterSpacing: '0.14em', color: hybridStep === 'gemini' ? '#3b82f6' : '#059669', marginBottom: 8 }}>
                      Step 1: {hybridStep === 'gemini' ? 'Geminiが仕様書を分析中...' : 'Geminiの分析完了 ✓'}
                    </div>
                    {hybridStep === 'gemini' && <PersonaLoading />}
                  </div>

                  {/* Step 2 */}
                  <div style={{
                    padding: '16px 20px', borderRadius: 8,
                    background: hybridStep === 'claude' ? 'rgba(124,58,237,0.06)' : '#f8f9fa',
                    border: `1px solid ${hybridStep === 'claude' ? 'rgba(124,58,237,0.3)' : '#e5e7eb'}`,
                    opacity: hybridStep === 'gemini' ? 0.4 : 1,
                  }}>
                    <div style={{ ...mono, fontSize: 10, letterSpacing: '0.14em', color: hybridStep === 'claude' ? accentColor : '#9ca3af', marginBottom: 8 }}>
                      Step 2: {hybridStep === 'claude' ? 'Claudeがコードを生成中...' : 'Claudeの実装（待機中）'}
                    </div>
                    {hybridStep === 'claude' && <PersonaLoading />}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{ ...mono, fontSize: 11, letterSpacing: '0.16em', color: accentColor }}>
                  // コードを生成しています...
                </div>
                <PersonaLoading />
                <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginTop: 8 }}>
                  仕様書の複雑さにより1〜2分かかる場合があります
                </div>
              </>
            )}
          </div>
        )}

        {/* 完了 */}
        {phase === 'done' && generatedCode && (
          <div>
            <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: '#059669', textTransform: 'uppercase', marginBottom: 16 }}>
              // 生成完了 — プレビュー
            </div>

            {/* iframeプレビュー */}
            <div style={{
              border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'auto',
              marginBottom: 20, background: '#f8f9fa',
              resize: 'vertical', minHeight: 400,
            }}>
              <iframe
                ref={iframeRef}
                src={previewUrl || undefined}
                scrolling="yes"
                style={{
                  width: '100%', height: 667, border: 'none', display: 'block',
                }}
                sandbox="allow-scripts allow-same-origin allow-popups"
                title="Builder Preview"
              />
            </div>

            {/* アクションボタン */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={handleDownload}
                style={{
                  ...mono, fontSize: 10, letterSpacing: '0.12em',
                  background: accentColor, border: 'none', color: '#fff',
                  padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                }}
              >Download ↓</button>

              <button
                onClick={handleToWorld}
                style={{
                  ...mono, fontSize: 10, letterSpacing: '0.12em',
                  background: '#fff', border: '1px solid #10b981', color: '#10b981',
                  padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                }}
              >World →</button>

              <button
                onClick={() => setShowCode(prev => !prev)}
                style={{
                  ...mono, fontSize: 10, letterSpacing: '0.12em',
                  background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
                  padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                }}
              >{showCode ? 'コードを隠す' : 'コードを見る'}</button>

              <button
                onClick={handleReset}
                style={{
                  ...mono, fontSize: 10, letterSpacing: '0.12em',
                  background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
                  padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                }}
              >もう一度</button>
            </div>

            {/* Geminiの設計書（Hybridモードのみ） */}
            {geminiInstruction && (
              <div style={{ marginTop: 20 }}>
                <button
                  onClick={() => setShowInstruction(prev => !prev)}
                  style={{
                    ...mono, fontSize: 10, letterSpacing: '0.1em',
                    background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)',
                    color: '#3b82f6', padding: '8px 16px', borderRadius: 4, cursor: 'pointer',
                    width: '100%', textAlign: 'left',
                  }}
                >
                  {showInstruction ? 'Geminiの設計書を隠す ▲' : 'Geminiの設計書を見る ▼'}
                </button>
                {showInstruction && (
                  <div style={{
                    background: '#f8f9fa', border: '1px solid #e5e7eb', borderTop: 'none',
                    borderRadius: '0 0 8px 8px', padding: 16, maxHeight: 400, overflowY: 'auto',
                  }}>
                    <pre style={{
                      fontSize: 12, lineHeight: 1.8, color: '#374151',
                      fontFamily: "'Noto Sans JP', sans-serif",
                      whiteSpace: 'pre-wrap', margin: 0,
                    }}>
                      {geminiInstruction}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* コードプレビュー（トグル） */}
            {showCode && (
              <div style={{ marginTop: 20, position: 'relative' }}>
                <button
                  onClick={handleCopy}
                  style={{
                    ...mono, fontSize: 9, letterSpacing: '0.1em',
                    position: 'absolute', top: 10, right: 10, zIndex: 10,
                    background: copied ? '#059669' : 'rgba(255,255,255,0.15)',
                    border: '1px solid rgba(255,255,255,0.2)', color: '#fff',
                    padding: '5px 12px', borderRadius: 3, cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
                <div style={{
                  background: '#1e1e1e', border: '1px solid #333', borderRadius: 8,
                  padding: 20, maxHeight: 400, overflowY: 'auto',
                }}>
                  <pre style={{
                    fontSize: 11, lineHeight: 1.6, color: '#d4d4d4',
                    fontFamily: "'Space Mono', 'Courier New', monospace",
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0,
                  }}>
                    {generatedCode}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* エラー表示 */}
        {error && (
          <div style={{ marginTop: 16, ...mono, fontSize: 10, color: '#ef4444', lineHeight: 1.6 }}>
            // エラー: {error}
          </div>
        )}
      </div>
    </div>
  );
}
