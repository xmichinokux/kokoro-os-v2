'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import PersonaLoading from '@/components/PersonaLoading';

const mono = { fontFamily: "'Space Mono', monospace" } as const;
const accentColor = '#e11d48'; // ローズ（Creativeのテーマカラー）

const PRESETS = [
  { label: '幾何学パターン', prompt: '幾何学的な模様を使った抽象アート。三角形、円、線が重なり合う美しいパターン。' },
  { label: 'パーティクル', prompt: '浮遊するパーティクルが接続線で繋がるジェネラティブアート。マウスに反応して動く。' },
  { label: '波形アート', prompt: '複数のサイン波が重なり合って作るオーガニックな波形ビジュアル。色がグラデーションで変化する。' },
  { label: 'フラクタル', prompt: '再帰的な樹形のフラクタルアート。風に揺れるようなアニメーション付き。' },
  { label: 'ノイズアート', prompt: 'パーリンノイズを使った有機的なフローフィールド。粒子が流れに沿って動く。' },
  { label: 'モザイク', prompt: '色彩豊かなボロノイ図法ベースのモザイクアート。クリックで再生成できる。' },
];

export default function KokoroCreativePage() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const testIframeRef = useRef<HTMLIFrameElement>(null);

  const [spec, setSpec] = useState('');
  const [phase, setPhase] = useState<'input' | 'generating' | 'done'>('input');
  const [generatedCode, setGeneratedCode] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasAestheticMap, setHasAestheticMap] = useState(false);

  // 進捗
  const [progressMessage, setProgressMessage] = useState('');
  const [validationLog, setValidationLog] = useState<string[]>([]);
  const [designDoc, setDesignDoc] = useState('');

  // 感性マップの有無を確認
  useEffect(() => {
    fetch('/api/drive-cache')
      .then(r => r.json())
      .then(d => {
        if (d.writing || d.thought || d.structure) {
          setHasAestheticMap(true);
        }
      })
      .catch(() => {});
  }, []);

  // プレビュー表示
  const showPreview = useCallback((code: string) => {
    setGeneratedCode(code);
    setPreviewUrl(code);
    setPhase('done');
  }, []);

  // API呼び出しヘルパー
  const apiFetch = useCallback(async (url: string, body: Record<string, unknown>, timeoutMs = 120000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('タイムアウト'), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(`サーバーエラー（${res.status}）: ${text.slice(0, 100)}`); }
      if (data.error) throw new Error(data.error);
      return data;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'TimeoutError') throw new Error('タイムアウト：サーバーからの応答がありません');
      if (e instanceof DOMException && e.name === 'AbortError') throw new Error('タイムアウト');
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  // ランタイムエラー検出
  const injectErrorSnippet = useCallback((html: string): string => {
    const snippet = `<script>
(function(){
  var errs=[];window.__rtErrs=errs;
  var origCE=console.error;
  console.error=function(){var m=Array.prototype.slice.call(arguments).join(' ');errs.push({t:'console.error',m:m});origCE.apply(console,arguments);};
  window.onerror=function(msg,src,line,col,err){
    if(src&&(src.indexOf('cdn.jsdelivr')!==-1||src.indexOf('googleapis')!==-1))return;
    errs.push({t:'onerror',m:String(msg),l:line,c:col,s:err?err.stack:''});
  };
  window.addEventListener('unhandledrejection',function(e){
    errs.push({t:'unhandledrejection',m:String(e.reason),s:e.reason&&e.reason.stack||''});
  });
  setTimeout(function(){window.parent.postMessage({type:'KOKORO_RT_ERRORS',errors:errs},'*');},3000);
})();
<\/script>`;
    const bodyIdx = html.indexOf('<body>');
    if (bodyIdx >= 0) {
      return html.slice(0, bodyIdx + 6) + '\n' + snippet + '\n' + html.slice(bodyIdx + 6);
    }
    const scriptIdx = html.indexOf('<script');
    if (scriptIdx >= 0) {
      return html.slice(0, scriptIdx) + snippet + '\n' + html.slice(scriptIdx);
    }
    return html;
  }, []);

  const testRuntimeErrors = useCallback((html: string): Promise<string[]> => {
    return new Promise((resolve) => {
      const modifiedHtml = injectErrorSnippet(html);
      const iframe = testIframeRef.current;
      if (!iframe) { resolve([]); return; }

      let resolved = false;
      const handler = (event: MessageEvent) => {
        if (resolved) return;
        if (event.data?.type === 'KOKORO_RT_ERRORS' && event.source === iframe.contentWindow) {
          resolved = true;
          window.removeEventListener('message', handler);
          const errors: string[] = (event.data.errors || []).map((e: { t: string; m: string; l?: number; c?: number; s?: string }) => {
            if (e.t === 'onerror') return `[Line ${e.l || '?'}] ${e.m}${e.s ? '\n  ' + e.s.split('\n')[0] : ''}`;
            if (e.t === 'console.error') return `[console.error] ${e.m}`;
            return `[${e.t}] ${e.m}`;
          });
          iframe.srcdoc = '';
          resolve(errors);
        }
      };
      window.addEventListener('message', handler);
      iframe.srcdoc = modifiedHtml;

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          window.removeEventListener('message', handler);
          iframe.srcdoc = '';
          resolve([]);
        }
      }, 5000);
    });
  }, [injectErrorSnippet]);

  // メイン生成ハンドラー
  const handleGenerate = useCallback(async () => {
    if (!spec.trim()) return;
    setPhase('generating');
    setError('');
    setGeneratedCode('');
    setPreviewUrl(null);
    setShowCode(false);
    setCopied(false);
    setValidationLog([]);
    setDesignDoc('');

    try {
      // Step 1: Gemini設計（感性マップ注入はサーバーサイド）
      setProgressMessage('ビジュアル設計中...');
      const designData = await apiFetch('/api/creative-generate', { spec: spec.trim(), step: 'design' });
      const instruction = designData.instruction as string;
      setDesignDoc(instruction);
      if (designData.hasAestheticMap) {
        setHasAestheticMap(true);
      }

      // Step 2: Claude実装
      setProgressMessage('コードを生成中...');
      const codeData = await apiFetch('/api/creative-generate', { spec: spec.trim(), step: 'implement', instruction });
      let currentCode = codeData.code as string;

      // ランタイムテストループ（最大3ラウンド）
      const MAX_RT_ROUNDS = 3;
      const logs: string[] = [];

      for (let rtRound = 0; rtRound < MAX_RT_ROUNDS; rtRound++) {
        setProgressMessage(`ランタイムテスト中... (${rtRound + 1}/${MAX_RT_ROUNDS})`);
        logs.push(`▶ ランタイムテスト ${rtRound + 1}/${MAX_RT_ROUNDS}...`);
        setValidationLog([...logs]);

        const runtimeErrors = await testRuntimeErrors(currentCode);

        if (runtimeErrors.length === 0) {
          logs.push(`✓ ランタイムエラーなし${rtRound > 0 ? `（修正${rtRound}回で成功）` : ''}`);
          setValidationLog([...logs]);
          break;
        }

        if (rtRound === MAX_RT_ROUNDS - 1) {
          logs.push(`△ ${runtimeErrors.length}件のランタイムエラーが残っていますが、プレビューを表示します`);
          runtimeErrors.forEach(e => logs.push(`  - ${e}`));
          setValidationLog([...logs]);
          break;
        }

        setProgressMessage('ランタイムエラーを修正中...');
        logs.push(`  → ${runtimeErrors.length}件のランタイムエラーを修正中...`);
        runtimeErrors.slice(0, 5).forEach(e => logs.push(`  - ${e}`));
        setValidationLog([...logs]);

        try {
          const fixData = await apiFetch('/api/builder-runtime-fix', {
            html: currentCode,
            errors: runtimeErrors.slice(0, 10),
            designDoc: instruction,
          });
          currentCode = fixData.code as string;
          logs.push(`  ✓ 修正コードを受信`);
          setValidationLog([...logs]);
        } catch (fixErr) {
          const msg = fixErr instanceof Error ? fixErr.message : 'エラー';
          logs.push(`  ✗ 修正失敗: ${msg}`);
          setValidationLog([...logs]);
          break;
        }
      }

      showPreview(currentCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
      setPhase('input');
    }
  }, [spec, apiFetch, showPreview, testRuntimeErrors]);

  // HTMLダウンロード
  const handleDownload = useCallback(() => {
    if (!generatedCode) return;
    const blob = new Blob([generatedCode], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kokoro-creative-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [generatedCode]);

  // PNGエクスポート（iframe内のcanvasをキャプチャ）
  const handleExportPng = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    try {
      const canvas = iframe.contentWindow.document.querySelector('canvas');
      if (canvas) {
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `kokoro-creative-${new Date().toISOString().slice(0, 10)}.png`;
        a.click();
      } else {
        // SVGの場合
        const svg = iframe.contentWindow.document.querySelector('svg');
        if (svg) {
          const svgData = new XMLSerializer().serializeToString(svg);
          const blob = new Blob([svgData], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `kokoro-creative-${new Date().toISOString().slice(0, 10)}.svg`;
          a.click();
          URL.revokeObjectURL(url);
        }
      }
    } catch {
      // cross-originの場合はフォールバック
      alert('エクスポートに失敗しました。生成されたHTML内のエクスポートボタンをお使いください。');
    }
  }, []);

  // コードをコピー
  const handleCopy = useCallback(async () => {
    if (!generatedCode) return;
    try { await navigator.clipboard.writeText(generatedCode); } catch {
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

  // Tunerへ渡す
  const handleToTuner = useCallback(() => {
    if (!generatedCode) return;
    localStorage.setItem('kokoro_world_input', JSON.stringify({
      strategyHtml: generatedCode, strategyText: spec,
      savedAt: new Date().toISOString(), source: 'creative',
    }));
    router.push('/kokoro-tuner');
  }, [generatedCode, spec, router]);

  // リセット
  const handleReset = useCallback(() => {
    setPhase('input');
    setGeneratedCode('');
    setPreviewUrl(null);
    setError('');
    setShowCode(false);
    setCopied(false);
    setDesignDoc('');
    setProgressMessage('');
    setValidationLog([]);
    if (testIframeRef.current) testIframeRef.current.srcdoc = '';
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
            width: 32, height: 32, border: '1px solid rgba(225,29,72,0.3)',
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(circle at 40% 40%,rgba(225,29,72,0.1) 0%,transparent 70%)',
            fontSize: 16,
          }}>🎨</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: accentColor }}>Creative</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>
              感性からビジュアルを生成する
            </span>
          </div>
        </div>
        <button onClick={() => router.push('/')} style={{
          ...mono, fontSize: 9, letterSpacing: '0.12em', color: '#9ca3af',
          background: 'transparent', border: '1px solid #e5e7eb', padding: '5px 14px', borderRadius: 3, cursor: 'pointer',
        }}>← Home</button>
      </header>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '48px 28px 100px' }}>

        {/* === 入力フェーズ === */}
        {phase === 'input' && (
          <div>
            <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: accentColor, textTransform: 'uppercase', marginBottom: 16 }}>
              // 作りたいビジュアルを伝えてください
            </div>

            {/* 感性マップ表示 */}
            {hasAestheticMap && (
              <div style={{
                ...mono, fontSize: 9, letterSpacing: '0.1em', color: '#059669',
                background: '#f0fdf4', border: '1px solid #bbf7d0',
                padding: '8px 14px', borderRadius: 4, marginBottom: 16,
              }}>
                ✓ 感性マップを検出 — 生成に反映されます
              </div>
            )}

            {/* プリセット */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ ...mono, fontSize: 9, letterSpacing: '0.12em', color: '#9ca3af', marginBottom: 10 }}>
                PRESETS
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setSpec(p.prompt)}
                    style={{
                      fontSize: 11, color: spec === p.prompt ? '#fff' : '#6b7280',
                      background: spec === p.prompt ? accentColor : '#f3f4f6',
                      border: 'none', padding: '6px 14px', borderRadius: 20,
                      cursor: 'pointer', transition: 'all 0.2s',
                      fontFamily: "'Noto Sans JP', sans-serif",
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={spec}
              onChange={e => setSpec(e.target.value)}
              placeholder="例: 夜空に浮かぶ粒子が音楽のように脈動するジェネラティブアート。青〜紫のグラデーションで、クリックすると波紋が広がる。"
              style={{
                width: '100%', minHeight: 160, resize: 'vertical',
                fontFamily: "'Noto Sans JP', sans-serif", fontSize: 13, lineHeight: 1.8,
                background: '#f8f9fa', border: '1px solid #d1d5db', borderRadius: 6,
                padding: 16, outline: 'none', color: '#374151',
              }}
            />

            <button onClick={handleGenerate} disabled={!spec.trim()} style={{
              ...mono, fontSize: 11, letterSpacing: '0.16em', background: accentColor, border: 'none', color: '#fff',
              padding: '14px 32px', borderRadius: 4, cursor: spec.trim() ? 'pointer' : 'not-allowed',
              marginTop: 24, opacity: spec.trim() ? 1 : 0.5, display: 'block', width: '100%',
            }}>
              Generate
            </button>
          </div>
        )}

        {/* === 生成中 === */}
        {phase === 'generating' && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ ...mono, fontSize: 11, letterSpacing: '0.16em', color: accentColor }}>
              // {progressMessage || 'ビジュアルを生成しています...'}
            </div>
            <PersonaLoading />
            <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginTop: 8 }}>
              感性マップとAIがビジュアルを設計中です
            </div>

            {validationLog.length > 0 && (
              <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: 14, marginTop: 24, maxHeight: 200, overflowY: 'auto', textAlign: 'left' }}>
                {validationLog.map((log, i) => (
                  <div key={i} style={{
                    ...mono, fontSize: 10, lineHeight: 1.8,
                    color: log.startsWith('✓') ? '#4ade80' : log.startsWith('✗') || log.startsWith('△') ? '#f87171' : log.startsWith('▶') ? '#60a5fa' : '#9ca3af',
                  }}>{log}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === 完了 === */}
        {phase === 'done' && generatedCode && (
          <div>
            <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: '#059669', textTransform: 'uppercase', marginBottom: 16 }}>
              // 生成完了 — プレビュー
            </div>

            {/* プレビュー */}
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'auto', marginBottom: 20, background: '#000', resize: 'vertical', minHeight: 400 }}>
              <iframe
                ref={iframeRef}
                srcDoc={previewUrl || undefined}
                scrolling="yes"
                style={{ width: '100%', height: 600, border: 'none', display: 'block' }}
                sandbox="allow-scripts allow-same-origin allow-downloads"
                title="Creative Preview"
              />
            </div>

            {/* アクションボタン */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={handleExportPng} style={{
                ...mono, fontSize: 10, letterSpacing: '0.12em', background: accentColor, border: 'none', color: '#fff',
                padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
              }}>Export PNG/SVG</button>
              <button onClick={handleDownload} style={{
                ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: `1px solid ${accentColor}`, color: accentColor,
                padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
              }}>Download HTML</button>
              <button onClick={handleToTuner} style={{
                ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #f59e0b', color: '#f59e0b',
                padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
              }}>Tuner →</button>
              <button onClick={() => setShowCode(prev => !prev)} style={{
                ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
                padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
              }}>{showCode ? 'コードを隠す' : 'コードを見る'}</button>
              <button onClick={handleReset} style={{
                ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
                padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
              }}>もう一度</button>
            </div>

            {/* ランタイムテスト結果 */}
            {validationLog.length > 0 && (
              <details style={{ marginTop: 20 }} open>
                <summary style={{ ...mono, fontSize: 10, letterSpacing: '0.1em', color: '#60a5fa', cursor: 'pointer', padding: '8px 0' }}>ランタイムテスト結果</summary>
                <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: 14, maxHeight: 200, overflowY: 'auto', marginTop: 8 }}>
                  {validationLog.map((log, i) => (
                    <div key={i} style={{
                      ...mono, fontSize: 10, lineHeight: 1.8,
                      color: log.startsWith('✓') ? '#4ade80' : log.startsWith('✗') || log.startsWith('△') ? '#f87171' : log.startsWith('▶') ? '#60a5fa' : '#9ca3af',
                    }}>{log}</div>
                  ))}
                </div>
              </details>
            )}

            {/* 設計書 */}
            {designDoc && (
              <details style={{ marginTop: 20 }}>
                <summary style={{ ...mono, fontSize: 10, letterSpacing: '0.1em', color: '#3b82f6', cursor: 'pointer', padding: '8px 0' }}>Geminiの設計書を見る</summary>
                <div style={{ background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, maxHeight: 400, overflowY: 'auto', marginTop: 8 }}>
                  <pre style={{ fontSize: 12, lineHeight: 1.8, color: '#374151', fontFamily: "'Noto Sans JP', sans-serif", whiteSpace: 'pre-wrap', margin: 0 }}>{designDoc}</pre>
                </div>
              </details>
            )}

            {/* コードプレビュー */}
            {showCode && (
              <div style={{ marginTop: 20, position: 'relative' }}>
                <button onClick={handleCopy} style={{
                  ...mono, fontSize: 9, letterSpacing: '0.1em', position: 'absolute', top: 10, right: 10, zIndex: 10,
                  background: copied ? '#059669' : 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff',
                  padding: '5px 12px', borderRadius: 3, cursor: 'pointer', transition: 'background 0.2s',
                }}>{copied ? '✓ Copied' : 'Copy'}</button>
                <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: 20, maxHeight: 400, overflowY: 'auto' }}>
                  <pre style={{ fontSize: 11, lineHeight: 1.6, color: '#d4d4d4', fontFamily: "'Space Mono', 'Courier New', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>{generatedCode}</pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* エラー表示 */}
        {error && (
          <div style={{ marginTop: 16 }}>
            <div style={{ ...mono, fontSize: 10, color: '#ef4444', lineHeight: 1.6, marginBottom: 12 }}>
              // エラー: {error}
            </div>
            <button onClick={handleReset} style={{
              ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #ef4444', color: '#ef4444',
              padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
            }}>やり直す</button>
          </div>
        )}
      </div>

      {/* ランタイムテスト用の非表示iframe */}
      <iframe
        ref={testIframeRef}
        style={{ position: 'fixed', left: -9999, top: -9999, width: 375, height: 667 }}
        sandbox="allow-scripts allow-same-origin"
        title="Runtime Test"
      />
    </div>
  );
}
