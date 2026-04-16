'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import PersonaLoading from '@/components/PersonaLoading';

const mono = { fontFamily: "'Space Mono', monospace" } as const;
const accentColor = '#7c3aed';

type BuildType = 'html' | 'hybrid';
type BuilderMode = 'create' | 'edit';

export default function KokoroBuilderPage() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const testIframeRef = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // === 共通 ===
  const [builderMode, setBuilderMode] = useState<BuilderMode>('create');
  const [phase, setPhase] = useState<'input' | 'generating' | 'done'>('input');
  const [generatedCode, setGeneratedCode] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [validationLog, setValidationLog] = useState<string[]>([]);

  // === Create モード ===
  const [spec, setSpec] = useState('');
  const [buildType, setBuildType] = useState<BuildType>('html');
  const [fromGatekeeper, setFromGatekeeper] = useState(false);
  const [geminiInstruction, setGeminiInstruction] = useState('');

  // === Edit モード ===
  const [editHtml, setEditHtml] = useState('');
  const [editInstruction, setEditInstruction] = useState('');
  const [editHistory, setEditHistory] = useState<{ instruction: string; code: string }[]>([]);
  const [editLoaded, setEditLoaded] = useState(false);

  // Gatekeeperからの読み込み
  useEffect(() => {
    try {
      const raw = localStorage.getItem('kokoro_builder_input');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.spec) { setSpec(parsed.spec); setFromGatekeeper(true); }
      }
    } catch { /* ignore */ }
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
      if (e instanceof DOMException && e.name === 'TimeoutError') throw new Error('タイムアウト');
      if (e instanceof DOMException && e.name === 'AbortError') throw new Error('タイムアウト');
      throw e;
    } finally { clearTimeout(timeoutId); }
  }, []);

  // ランタイムエラー検出
  const injectErrorSnippet = useCallback((html: string): string => {
    const snippet = `<script>
(function(){var errs=[];window.__rtErrs=errs;var origCE=console.error;console.error=function(){var m=Array.prototype.slice.call(arguments).join(' ');errs.push({t:'console.error',m:m});origCE.apply(console,arguments);};window.onerror=function(msg,src,line,col,err){if(src&&(src.indexOf('cdn.jsdelivr')!==-1||src.indexOf('googleapis')!==-1))return;errs.push({t:'onerror',m:String(msg),l:line,c:col,s:err?err.stack:''});};window.addEventListener('unhandledrejection',function(e){errs.push({t:'unhandledrejection',m:String(e.reason),s:e.reason&&e.reason.stack||''});});setTimeout(function(){window.parent.postMessage({type:'KOKORO_RT_ERRORS',errors:errs},'*');},3000);})();
<\/script>`;
    const bodyIdx = html.indexOf('<body>');
    if (bodyIdx >= 0) return html.slice(0, bodyIdx + 6) + '\n' + snippet + '\n' + html.slice(bodyIdx + 6);
    const scriptIdx = html.indexOf('<script');
    if (scriptIdx >= 0) return html.slice(0, scriptIdx) + snippet + '\n' + html.slice(scriptIdx);
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
          resolved = true; window.removeEventListener('message', handler);
          const errors: string[] = (event.data.errors || []).map((e: { t: string; m: string; l?: number; s?: string }) => {
            if (e.t === 'onerror') return `[Line ${e.l || '?'}] ${e.m}${e.s ? '\n  ' + e.s.split('\n')[0] : ''}`;
            if (e.t === 'console.error') return `[console.error] ${e.m}`;
            return `[${e.t}] ${e.m}`;
          });
          iframe.srcdoc = ''; resolve(errors);
        }
      };
      window.addEventListener('message', handler);
      iframe.srcdoc = modifiedHtml;
      setTimeout(() => { if (!resolved) { resolved = true; window.removeEventListener('message', handler); iframe.srcdoc = ''; resolve([]); } }, 5000);
    });
  }, [injectErrorSnippet]);

  // ========================
  // Create モード: Yoroshiku
  // ========================
  const handleYoroshiku = useCallback(async () => {
    if (!spec.trim()) return;
    setPhase('generating'); setError(''); setGeneratedCode(''); setPreviewUrl(null);
    setShowCode(false); setCopied(false); setValidationLog([]); setGeminiInstruction('');
    setProgressMessage('仕様を分析中...');
    try {
      const routeData = await apiFetch('/api/builder-route', { spec: spec.trim() });
      const mode = routeData.mode as BuildType;
      const feasibility = (routeData.feasibility as 'feasible' | 'risky' | 'infeasible') || 'feasible';
      const reason = (routeData.reason as string) || '';
      setBuildType(mode);

      if (feasibility === 'infeasible') {
        setError(`現状の機能性能では実現できません${reason ? `（${reason}）` : ''}。よりシンプルな仕様に書き換えてください。`);
        setPhase('input');
        return;
      }

      if (feasibility === 'risky') {
        const ok = window.confirm(`⚠️ この仕様は複雑で、正常に動作しない可能性があります${reason ? `\n\n理由: ${reason}` : ''}\n\nそれでも生成を続けますか？`);
        if (!ok) { setPhase('input'); return; }
      }

      if (mode === 'hybrid') {
        setProgressMessage('設計書を生成中...');
        const designData = await apiFetch('/api/kokoro-builder-hybrid', { spec: spec.trim(), step: 'gemini' });
        const instruction = designData.instruction as string;
        setGeminiInstruction(instruction);

        setProgressMessage('コードを生成中...');
        const codeData = await apiFetch('/api/kokoro-builder-hybrid', { spec: spec.trim(), step: 'claude', instruction });
        let currentCode = codeData.code as string;

        const MAX_RT_ROUNDS = 3; const logs: string[] = [];
        for (let rtRound = 0; rtRound < MAX_RT_ROUNDS; rtRound++) {
          setProgressMessage(`ランタイムテスト中... (${rtRound + 1}/${MAX_RT_ROUNDS})`);
          logs.push(`▶ ランタイムテスト ${rtRound + 1}/${MAX_RT_ROUNDS}...`); setValidationLog([...logs]);
          const runtimeErrors = await testRuntimeErrors(currentCode);
          if (runtimeErrors.length === 0) { logs.push(`✓ エラーなし${rtRound > 0 ? `（修正${rtRound}回）` : ''}`); setValidationLog([...logs]); break; }
          if (rtRound === MAX_RT_ROUNDS - 1) { logs.push(`△ ${runtimeErrors.length}件残存`); setValidationLog([...logs]); break; }
          setProgressMessage('エラー修正中...');
          logs.push(`  → ${runtimeErrors.length}件修正中...`); setValidationLog([...logs]);
          try {
            const fixData = await apiFetch('/api/builder-runtime-fix', { html: currentCode, errors: runtimeErrors.slice(0, 10), designDoc: instruction });
            currentCode = fixData.code as string; logs.push(`  ✓ 修正完了`); setValidationLog([...logs]);
          } catch (fixErr) { logs.push(`  ✗ ${fixErr instanceof Error ? fixErr.message : 'エラー'}`); setValidationLog([...logs]); break; }
        }
        showPreview(currentCode);
      } else {
        setProgressMessage('コードを生成中...');
        const data = await apiFetch('/api/kokoro-builder', { spec: spec.trim(), buildType: 'html' });
        showPreview(data.code as string);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'エラーが発生しました'); setPhase('input'); }
  }, [spec, apiFetch, showPreview, testRuntimeErrors]);

  // ========================
  // Edit モード
  // ========================
  const handleEditFileUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const html = reader.result as string;
      setEditHtml(html);
      setEditLoaded(true);
      setEditHistory([]);
      // 初期プレビュー表示
      setGeneratedCode(html);
      setPreviewUrl(html);
      setPhase('done');
    };
    reader.readAsText(file);
  }, []);

  const handleEditPaste = useCallback(() => {
    navigator.clipboard.readText().then(text => {
      if (text.includes('<html') || text.includes('<!DOCTYPE') || text.includes('<!doctype')) {
        setEditHtml(text);
        setEditLoaded(true);
        setEditHistory([]);
        setGeneratedCode(text);
        setPreviewUrl(text);
        setPhase('done');
      } else {
        setError('クリップボードの内容はHTMLではありません');
      }
    }).catch(() => setError('クリップボードの読み取りに失敗しました'));
  }, []);

  const handleEditDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.html') || file.name.endsWith('.htm') || file.type === 'text/html')) {
      handleEditFileUpload(file);
    }
  }, [handleEditFileUpload]);

  const handleEditApply = useCallback(async () => {
    if (!editInstruction.trim() || !generatedCode) return;
    setPhase('generating'); setError('');
    setProgressMessage('修正を適用中...');
    setValidationLog([]);

    try {
      const data = await apiFetch('/api/builder-edit', {
        html: generatedCode,
        instruction: editInstruction.trim(),
      });
      const newCode = data.code as string;

      // ランタイムテスト（1回）
      setProgressMessage('ランタイムテスト中...');
      const runtimeErrors = await testRuntimeErrors(newCode);
      const logs: string[] = [];
      if (runtimeErrors.length > 0) {
        logs.push(`△ ${runtimeErrors.length}件のランタイムエラーを検出`);
        runtimeErrors.slice(0, 5).forEach(e => logs.push(`  - ${e}`));

        // 自動修正1回
        setProgressMessage('エラー修正中...');
        try {
          const fixData = await apiFetch('/api/builder-runtime-fix', {
            html: newCode, errors: runtimeErrors.slice(0, 10), designDoc: '',
          });
          const fixedCode = fixData.code as string;
          logs.push('✓ 修正完了');
          setValidationLog(logs);

          // 履歴に追加
          setEditHistory(prev => [...prev, { instruction: editInstruction, code: generatedCode }]);
          setEditHtml(fixedCode);
          setEditInstruction('');
          showPreview(fixedCode);
          return;
        } catch {
          logs.push('△ 自動修正に失敗、そのまま表示します');
          setValidationLog(logs);
        }
      } else {
        logs.push('✓ ランタイムエラーなし');
        setValidationLog(logs);
      }

      // 履歴に追加
      setEditHistory(prev => [...prev, { instruction: editInstruction, code: generatedCode }]);
      setEditHtml(newCode);
      setEditInstruction('');
      showPreview(newCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
      setPhase('done'); // Editモードではdoneに戻す（プレビューは維持）
    }
  }, [editInstruction, generatedCode, apiFetch, showPreview, testRuntimeErrors]);

  // Undo（1つ前に戻る）
  const handleEditUndo = useCallback(() => {
    if (editHistory.length === 0) return;
    const prev = editHistory[editHistory.length - 1];
    setEditHistory(h => h.slice(0, -1));
    setEditHtml(prev.code);
    showPreview(prev.code);
  }, [editHistory, showPreview]);

  // 共通アクション
  const handleDownload = useCallback(() => {
    if (!generatedCode) return;
    const blob = new Blob([generatedCode], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `kokoro-builder-${new Date().toISOString().slice(0, 10)}.html`;
    a.click(); URL.revokeObjectURL(url);
  }, [generatedCode]);

  const handleCopy = useCallback(async () => {
    if (!generatedCode) return;
    try { await navigator.clipboard.writeText(generatedCode); } catch {
      const ta = document.createElement('textarea'); ta.value = generatedCode;
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }, [generatedCode]);

  const handleToWorld = useCallback(() => {
    if (!generatedCode) return;
    localStorage.setItem('kokoro_world_input', JSON.stringify({
      strategyHtml: generatedCode, strategyText: spec || editInstruction,
      savedAt: new Date().toISOString(), source: 'builder',
    }));
    router.push('/kokoro-world');
  }, [generatedCode, spec, editInstruction, router]);

  const handleToTuner = useCallback(() => {
    if (!generatedCode) return;
    localStorage.setItem('kokoro_world_input', JSON.stringify({
      strategyHtml: generatedCode, strategyText: spec || editInstruction,
      savedAt: new Date().toISOString(), source: 'builder',
    }));
    router.push('/kokoro-tuner');
  }, [generatedCode, spec, editInstruction, router]);

  const handleReset = useCallback(() => {
    setPhase('input'); setBuildType('html'); setGeneratedCode(''); setPreviewUrl(null);
    setError(''); setShowCode(false); setCopied(false); setGeminiInstruction('');
    setProgressMessage(''); setValidationLog([]);
    setEditHtml(''); setEditInstruction(''); setEditHistory([]); setEditLoaded(false);
    if (testIframeRef.current) testIframeRef.current.srcdoc = '';
  }, []);

  // Editモードで生成完了後にCreate結果を引き継ぐ
  const handleSwitchToEdit = useCallback(() => {
    if (!generatedCode) return;
    setBuilderMode('edit');
    setEditHtml(generatedCode);
    setEditLoaded(true);
    setEditHistory([]);
    setEditInstruction('');
  }, [generatedCode]);

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
              {builderMode === 'create' ? '仕様書からコードを自動生成' : '既存HTMLを対話的にブラッシュアップ'}
            </span>
          </div>
        </div>
        <div />
      </header>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 28px 100px' }}>
        {/* モード切替タブ */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 32, borderBottom: '2px solid #e5e7eb' }}>
          {([['create', 'Create'], ['edit', 'Edit']] as [BuilderMode, string][]).map(([m, label]) => (
            <button key={m} onClick={() => { if (phase === 'input' || confirm('モードを切り替えますか？現在の作業は保持されます。')) { setBuilderMode(m); if (m === 'create' && !editLoaded) setPhase('input'); } }} style={{
              ...mono, fontSize: 11, letterSpacing: '0.14em', padding: '10px 24px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: builderMode === m ? accentColor : '#9ca3af',
              borderBottom: builderMode === m ? `2px solid ${accentColor}` : '2px solid transparent',
              marginBottom: -2, fontWeight: builderMode === m ? 700 : 400,
            }}>{label}</button>
          ))}
        </div>

        {/* ============================================ */}
        {/* Create モード */}
        {/* ============================================ */}
        {builderMode === 'create' && (
          <>
            {phase === 'input' && (
              <div>
                <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: accentColor, textTransform: 'uppercase', marginBottom: 16 }}>
                  // 仕様書を入力してください
                </div>
                {fromGatekeeper && (
                  <div style={{ ...mono, fontSize: 9, letterSpacing: '0.1em', color: '#059669', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '8px 14px', borderRadius: 4, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <span>✓ Gatekeeperから読み込み済み</span>
                    <button
                      onClick={() => {
                        setSpec('');
                        setFromGatekeeper(false);
                        try { localStorage.removeItem('kokoro_builder_input'); } catch { /* ignore */ }
                      }}
                      style={{
                        ...mono, fontSize: 9, letterSpacing: '0.08em',
                        color: '#9ca3af', background: 'transparent',
                        border: '1px solid #d1d5db', borderRadius: 3,
                        padding: '3px 10px', cursor: 'pointer',
                      }}
                    >✕ リセット</button>
                  </div>
                )}
                <textarea value={spec} onChange={e => { setSpec(e.target.value); setFromGatekeeper(false); }}
                  placeholder="作りたいアプリやゲームの仕様を書いてください。AIが最適な方法で生成します。"
                  style={{ width: '100%', minHeight: 200, resize: 'vertical', fontFamily: "'Noto Sans JP', sans-serif", fontSize: 13, lineHeight: 1.8, background: '#f8f9fa', border: '1px solid #d1d5db', borderRadius: 6, padding: 16, outline: 'none', color: '#374151' }}
                />
                <button onClick={handleYoroshiku} disabled={!spec.trim()} style={{
                  ...mono, fontSize: 11, letterSpacing: '0.16em', background: accentColor, border: 'none', color: '#fff',
                  padding: '14px 32px', borderRadius: 4, cursor: spec.trim() ? 'pointer' : 'not-allowed',
                  marginTop: 24, opacity: spec.trim() ? 1 : 0.5, display: 'block', width: '100%',
                }}>Yoroshiku</button>
              </div>
            )}

            {phase === 'generating' && (
              <div style={{ textAlign: 'center', paddingTop: 60 }}>
                <div style={{ ...mono, fontSize: 11, letterSpacing: '0.16em', color: accentColor }}>// {progressMessage || '生成中...'}</div>
                <PersonaLoading />
                <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginTop: 8 }}>仕様書の複雑さにより1〜3分かかる場合があります</div>
                {validationLog.length > 0 && (
                  <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: 14, marginTop: 24, maxHeight: 200, overflowY: 'auto', textAlign: 'left' }}>
                    {validationLog.map((log, i) => (
                      <div key={i} style={{ ...mono, fontSize: 10, lineHeight: 1.8, color: log.startsWith('✓') ? '#4ade80' : log.startsWith('✗') || log.startsWith('△') ? '#f87171' : log.startsWith('▶') ? '#60a5fa' : '#9ca3af' }}>{log}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {phase === 'done' && generatedCode && (
              <div>
                <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: '#059669', textTransform: 'uppercase', marginBottom: 16 }}>// 生成完了 — プレビュー</div>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'auto', marginBottom: 20, background: '#f8f9fa', resize: 'vertical', minHeight: 400 }}>
                  <iframe ref={iframeRef} srcDoc={previewUrl || undefined} scrolling="yes" style={{ width: '100%', height: 667, border: 'none', display: 'block' }} sandbox="allow-scripts allow-same-origin allow-pointer-lock" title="Builder Preview" />
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={handleDownload} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: accentColor, border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>Download ↓</button>
                  <button onClick={handleSwitchToEdit} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: `1px solid ${accentColor}`, color: accentColor, padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>Edit →</button>
                  <button onClick={handleToWorld} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #10b981', color: '#10b981', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>World →</button>
                  <button onClick={handleToTuner} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #f59e0b', color: '#f59e0b', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>Tuner →</button>
                  <button onClick={() => setShowCode(p => !p)} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>{showCode ? 'コードを隠す' : 'コードを見る'}</button>
                  <button onClick={handleReset} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>もう一度</button>
                </div>

                {geminiInstruction && (
                  <details style={{ marginTop: 20 }}>
                    <summary style={{ ...mono, fontSize: 10, color: '#3b82f6', cursor: 'pointer', padding: '8px 0' }}>Geminiの設計書を見る</summary>
                    <div style={{ background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, maxHeight: 400, overflowY: 'auto', marginTop: 8 }}>
                      <pre style={{ fontSize: 12, lineHeight: 1.8, color: '#374151', fontFamily: "'Noto Sans JP', sans-serif", whiteSpace: 'pre-wrap', margin: 0 }}>{geminiInstruction}</pre>
                    </div>
                  </details>
                )}

                {validationLog.length > 0 && (
                  <details style={{ marginTop: 20 }} open>
                    <summary style={{ ...mono, fontSize: 10, color: '#60a5fa', cursor: 'pointer', padding: '8px 0' }}>ランタイムテスト結果</summary>
                    <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: 14, maxHeight: 200, overflowY: 'auto', marginTop: 8 }}>
                      {validationLog.map((log, i) => (
                        <div key={i} style={{ ...mono, fontSize: 10, lineHeight: 1.8, color: log.startsWith('✓') ? '#4ade80' : log.startsWith('✗') || log.startsWith('△') ? '#f87171' : log.startsWith('▶') ? '#60a5fa' : '#9ca3af' }}>{log}</div>
                      ))}
                    </div>
                  </details>
                )}

                {showCode && (
                  <div style={{ marginTop: 20, position: 'relative' }}>
                    <button onClick={handleCopy} style={{ ...mono, fontSize: 9, position: 'absolute', top: 10, right: 10, zIndex: 10, background: copied ? '#059669' : 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '5px 12px', borderRadius: 3, cursor: 'pointer' }}>{copied ? '✓ Copied' : 'Copy'}</button>
                    <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: 20, maxHeight: 400, overflowY: 'auto' }}>
                      <pre style={{ fontSize: 11, lineHeight: 1.6, color: '#d4d4d4', fontFamily: "'Space Mono', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>{generatedCode}</pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ============================================ */}
        {/* Edit モード */}
        {/* ============================================ */}
        {builderMode === 'edit' && (
          <>
            {/* HTML未読み込み → アップロードUI */}
            {!editLoaded && phase !== 'done' && (
              <div>
                <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: accentColor, textTransform: 'uppercase', marginBottom: 16 }}>
                  // 編集したいHTMLを読み込んでください
                </div>

                <div
                  onDragOver={e => e.preventDefault()} onDrop={handleEditDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: '2px dashed #d1d5db', borderRadius: 12, padding: '48px 20px',
                    textAlign: 'center', cursor: 'pointer', background: '#fafafa', marginBottom: 16,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = accentColor)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#d1d5db')}
                >
                  <div style={{ fontSize: 36, marginBottom: 10 }}>📄</div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>HTMLファイルをドラッグ&ドロップ</div>
                  <div style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>またはクリックしてファイル選択</div>
                </div>
                <input ref={fileInputRef} type="file" accept=".html,.htm" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleEditFileUpload(f); }}
                />

                <button onClick={handleEditPaste} style={{
                  ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
                  padding: '10px 20px', borderRadius: 4, cursor: 'pointer', display: 'block', width: '100%', marginTop: 8,
                }}>クリップボードからペースト</button>
              </div>
            )}

            {/* HTML読み込み済み → プレビュー + 修正指示 */}
            {(editLoaded || (builderMode === 'edit' && phase === 'done')) && generatedCode && (
              <div>
                {phase === 'generating' ? (
                  <div style={{ textAlign: 'center', paddingTop: 40, marginBottom: 20 }}>
                    <div style={{ ...mono, fontSize: 11, letterSpacing: '0.16em', color: accentColor }}>// {progressMessage || '修正中...'}</div>
                    <PersonaLoading />
                  </div>
                ) : (
                  <>
                    <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: '#059669', textTransform: 'uppercase', marginBottom: 16 }}>
                      // プレビュー{editHistory.length > 0 ? ` (編集 ${editHistory.length}回目)` : ''}
                    </div>

                    {/* プレビュー */}
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'auto', marginBottom: 20, background: '#f8f9fa', resize: 'vertical', minHeight: 300 }}>
                      <iframe ref={iframeRef} srcDoc={previewUrl || undefined} scrolling="yes" style={{ width: '100%', height: 500, border: 'none', display: 'block' }} sandbox="allow-scripts allow-same-origin allow-pointer-lock" title="Edit Preview" />
                    </div>
                  </>
                )}

                {/* 修正指示入力 */}
                {phase === 'done' && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ ...mono, fontSize: 9, letterSpacing: '0.12em', color: '#9ca3af', marginBottom: 8 }}>EDIT INSTRUCTION</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <textarea value={editInstruction} onChange={e => setEditInstruction(e.target.value)}
                        placeholder="修正指示を入力（例: ヘッダーの背景色を青に変えて / ボタンを大きくして角丸にして / フッターにコピーライトを追加して）"
                        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleEditApply(); }}
                        style={{
                          flex: 1, minHeight: 80, resize: 'vertical', fontFamily: "'Noto Sans JP', sans-serif", fontSize: 13, lineHeight: 1.8,
                          background: '#f8f9fa', border: '1px solid #d1d5db', borderRadius: 6, padding: 12, outline: 'none', color: '#374151',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button onClick={handleEditApply} disabled={!editInstruction.trim()} style={{
                        ...mono, fontSize: 11, letterSpacing: '0.14em', background: accentColor, border: 'none', color: '#fff',
                        padding: '10px 24px', borderRadius: 4, cursor: editInstruction.trim() ? 'pointer' : 'not-allowed',
                        opacity: editInstruction.trim() ? 1 : 0.5,
                      }}>適用する</button>
                      <span style={{ ...mono, fontSize: 9, color: '#9ca3af', alignSelf: 'center' }}>Cmd/Ctrl+Enter</span>
                    </div>
                  </div>
                )}

                {/* ランタイムテスト結果 */}
                {validationLog.length > 0 && phase === 'done' && (
                  <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: 14, marginBottom: 20, maxHeight: 150, overflowY: 'auto' }}>
                    {validationLog.map((log, i) => (
                      <div key={i} style={{ ...mono, fontSize: 10, lineHeight: 1.8, color: log.startsWith('✓') ? '#4ade80' : log.startsWith('✗') || log.startsWith('△') ? '#f87171' : '#9ca3af' }}>{log}</div>
                    ))}
                  </div>
                )}

                {/* 編集履歴 */}
                {editHistory.length > 0 && phase === 'done' && (
                  <details style={{ marginBottom: 20 }}>
                    <summary style={{ ...mono, fontSize: 10, color: '#6b7280', cursor: 'pointer', padding: '8px 0' }}>編集履歴 ({editHistory.length}回)</summary>
                    <div style={{ marginTop: 8 }}>
                      {editHistory.map((h, i) => (
                        <div key={i} style={{ fontSize: 11, color: '#6b7280', padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                          <span style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>#{i + 1}</span> {h.instruction}
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {/* アクションボタン */}
                {phase === 'done' && (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={handleDownload} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: accentColor, border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>Download ↓</button>
                    {editHistory.length > 0 && (
                      <button onClick={handleEditUndo} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #f59e0b', color: '#f59e0b', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>Undo ↩</button>
                    )}
                    <button onClick={handleToTuner} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #f59e0b', color: '#f59e0b', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>Tuner →</button>
                    <button onClick={() => setShowCode(p => !p)} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>{showCode ? 'コードを隠す' : 'コードを見る'}</button>
                    <button onClick={handleReset} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>別のHTMLを読み込む</button>
                  </div>
                )}

                {showCode && phase === 'done' && (
                  <div style={{ marginTop: 20, position: 'relative' }}>
                    <button onClick={handleCopy} style={{ ...mono, fontSize: 9, position: 'absolute', top: 10, right: 10, zIndex: 10, background: copied ? '#059669' : 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '5px 12px', borderRadius: 3, cursor: 'pointer' }}>{copied ? '✓ Copied' : 'Copy'}</button>
                    <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: 20, maxHeight: 400, overflowY: 'auto' }}>
                      <pre style={{ fontSize: 11, lineHeight: 1.6, color: '#d4d4d4', fontFamily: "'Space Mono', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>{generatedCode}</pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* エラー表示 */}
        {error && (
          <div style={{ marginTop: 16 }}>
            <div style={{ ...mono, fontSize: 10, color: '#ef4444', lineHeight: 1.6, marginBottom: 12 }}>// エラー: {error}</div>
            <button onClick={() => setError('')} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #ef4444', color: '#ef4444', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>閉じる</button>
          </div>
        )}
      </div>

      {/* テスト用iframe */}
      <iframe ref={testIframeRef} style={{ position: 'fixed', left: -9999, top: -9999, width: 375, height: 667 }} sandbox="allow-scripts allow-same-origin" title="Runtime Test" />
    </div>
  );
}
