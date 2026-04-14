'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import PersonaLoading from '@/components/PersonaLoading';

const mono = { fontFamily: "'Space Mono', monospace" } as const;
const accentColor = '#7c3aed';

type BuildType = 'html' | 'hybrid';

export default function KokoroBuilderPage() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [spec, setSpec] = useState('');
  const [buildType, setBuildType] = useState<BuildType>('html');
  const [fromGatekeeper, setFromGatekeeper] = useState(false);
  const [phase, setPhase] = useState<'input' | 'generating' | 'done'>('input');
  const [generatedCode, setGeneratedCode] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  // 進捗表示
  const [progressMessage, setProgressMessage] = useState('');
  const [validationLog, setValidationLog] = useState<string[]>([]);

  // Hybrid用（内部）
  const [geminiInstruction, setGeminiInstruction] = useState('');

  // テスト用iframe
  const testIframeRef = useRef<HTMLIFrameElement>(null);

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

  // プレビュー表示共通処理（srcdoc方式）
  const showPreview = useCallback((code: string) => {
    setGeneratedCode(code);
    setPreviewUrl(code); // srcdocに直接HTMLを渡す
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

  // === ランタイムエラー検出 ===
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
    // <body>の直後に挿入
    const bodyIdx = html.indexOf('<body>');
    if (bodyIdx >= 0) {
      return html.slice(0, bodyIdx + 6) + '\n' + snippet + '\n' + html.slice(bodyIdx + 6);
    }
    // <body>がなければ最初の<script>の前に挿入
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
          // iframe停止
          iframe.srcdoc = '';
          resolve(errors);
        }
      };
      window.addEventListener('message', handler);
      iframe.srcdoc = modifiedHtml;

      // 5秒タイムアウト
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

  // === メインハンドラー: Yoroshiku ===
  const handleYoroshiku = useCallback(async () => {
    if (!spec.trim()) return;
    setPhase('generating');
    setError('');
    setGeneratedCode('');
    setPreviewUrl(null);
    setShowCode(false);
    setCopied(false);
    setValidationLog([]);
    setGeminiInstruction('');
    setProgressMessage('仕様を分析中...');

    try {
      // Step 1: AIルーティング（Gemini Flash）
      const routeData = await apiFetch('/api/builder-route', { spec: spec.trim() });
      const mode = routeData.mode as BuildType;
      setBuildType(mode);

      if (mode === 'hybrid') {
        // === Hybrid: Gemini設計 → Claude実装 → ランタイムテスト ===
        setProgressMessage('設計書を生成中...');
        const designData = await apiFetch('/api/kokoro-builder-hybrid', { spec: spec.trim(), step: 'gemini' });
        const instruction = designData.instruction as string;
        setGeminiInstruction(instruction);

        setProgressMessage('コードを生成中...');
        const codeData = await apiFetch('/api/kokoro-builder-hybrid', { spec: spec.trim(), step: 'claude', instruction });
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
      } else {
        // === Simple HTML: Claude直接生成 ===
        setProgressMessage('コードを生成中...');
        const data = await apiFetch('/api/kokoro-builder', { spec: spec.trim(), buildType: 'html' });
        showPreview(data.code as string);
      }
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
    a.download = `kokoro-builder-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [generatedCode]);

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

  // Worldへ渡す
  const handleToWorld = useCallback(() => {
    if (!generatedCode) return;
    localStorage.setItem('kokoro_world_input', JSON.stringify({
      strategyHtml: generatedCode, strategyText: spec,
      savedAt: new Date().toISOString(), source: 'builder',
    }));
    router.push('/kokoro-world');
  }, [generatedCode, spec, router]);

  // Tunerへ渡す
  const handleToTuner = useCallback(() => {
    if (!generatedCode) return;
    localStorage.setItem('kokoro_world_input', JSON.stringify({
      strategyHtml: generatedCode, strategyText: spec,
      savedAt: new Date().toISOString(), source: 'builder',
    }));
    router.push('/kokoro-tuner');
  }, [generatedCode, spec, router]);

  // リセット
  const handleReset = useCallback(() => {
    setPhase('input');
    setBuildType('html');
    setGeneratedCode('');
    setPreviewUrl(null);
    setError('');
    setShowCode(false);
    setCopied(false);
    setGeminiInstruction('');
    setProgressMessage('');
    setValidationLog([]);
    if (testIframeRef.current) testIframeRef.current.srcdoc = '';
  }, []);

  const isHybrid = buildType === 'hybrid';

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
              // 仕様書を入力してください
            </div>

            {fromGatekeeper && (
              <div style={{ ...mono, fontSize: 9, letterSpacing: '0.1em', color: '#059669', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '8px 14px', borderRadius: 4, marginBottom: 16 }}>
                ✓ Gatekeeperから読み込み済み
              </div>
            )}

            <textarea
              value={spec}
              onChange={e => { setSpec(e.target.value); setFromGatekeeper(false); }}
              placeholder="作りたいアプリやゲームの仕様を書いてください。AIが最適な方法で生成します。"
              style={{
                width: '100%', minHeight: 200, resize: 'vertical',
                fontFamily: "'Noto Sans JP', sans-serif", fontSize: 13, lineHeight: 1.8,
                background: '#f8f9fa', border: '1px solid #d1d5db', borderRadius: 6,
                padding: 16, outline: 'none', color: '#374151',
              }}
            />

            <button onClick={handleYoroshiku} disabled={!spec.trim()} style={{
              ...mono, fontSize: 11, letterSpacing: '0.16em', background: accentColor, border: 'none', color: '#fff',
              padding: '14px 32px', borderRadius: 4, cursor: spec.trim() ? 'pointer' : 'not-allowed',
              marginTop: 24, opacity: spec.trim() ? 1 : 0.5, display: 'block', width: '100%',
            }}>
              Yoroshiku
            </button>
          </div>
        )}

        {/* === 生成中（統一） === */}
        {phase === 'generating' && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ ...mono, fontSize: 11, letterSpacing: '0.16em', color: accentColor }}>
              // {progressMessage || 'コードを生成しています...'}
            </div>
            <PersonaLoading />
            <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginTop: 8 }}>
              仕様書の複雑さにより1〜3分かかる場合があります
            </div>

            {/* ランタイムテストログ */}
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

        {/* === 完了（共通） === */}
        {phase === 'done' && generatedCode && (
          <div>
            <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: '#059669', textTransform: 'uppercase', marginBottom: 16 }}>
              // 生成完了 — プレビュー
            </div>

            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'auto', marginBottom: 20, background: '#f8f9fa', resize: 'vertical', minHeight: 400 }}>
              <iframe ref={iframeRef} srcDoc={previewUrl || undefined} scrolling="yes"
                style={{ width: '100%', height: 667, border: 'none', display: 'block' }}
                sandbox="allow-scripts allow-same-origin allow-pointer-lock" title="Builder Preview" />
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={handleDownload} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: accentColor, border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>Download ↓</button>
              <button onClick={handleToWorld} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #10b981', color: '#10b981', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>World →</button>
              <button onClick={handleToTuner} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #f59e0b', color: '#f59e0b', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>Tuner →</button>
              <button onClick={() => setShowCode(prev => !prev)} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>{showCode ? 'コードを隠す' : 'コードを見る'}</button>
              <button onClick={handleReset} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>もう一度</button>
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

            {/* Geminiの設計書（Hybrid） */}
            {geminiInstruction && (
              <details style={{ marginTop: 20 }}>
                <summary style={{ ...mono, fontSize: 10, letterSpacing: '0.1em', color: '#3b82f6', cursor: 'pointer', padding: '8px 0' }}>Geminiの設計書を見る</summary>
                <div style={{ background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, maxHeight: 400, overflowY: 'auto', marginTop: 8 }}>
                  <pre style={{ fontSize: 12, lineHeight: 1.8, color: '#374151', fontFamily: "'Noto Sans JP', sans-serif", whiteSpace: 'pre-wrap', margin: 0 }}>{geminiInstruction}</pre>
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
