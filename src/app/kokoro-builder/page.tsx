'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import PersonaLoading from '@/components/PersonaLoading';

const mono = { fontFamily: "'Space Mono', monospace" } as const;
const accentColor = '#7c3aed';

type BuildType = 'html' | 'hybrid' | 'modular' | 'auto';

const BUILD_OPTIONS: { value: BuildType; label: string; desc: string }[] = [
  { value: 'html', label: 'シングルHTML（Claude）', desc: 'CDN経由。すぐ動く。' },
  { value: 'hybrid', label: 'Hybrid（Gemini設計 + Claude実装）', desc: '2段階で生成。設計書を確認してから実装。' },
  { value: 'modular', label: 'Modular（分割生成 + 統合）', desc: 'モジュール分割→順番に生成→統合。大規模向け。' },
  { value: 'auto', label: 'AIに任せる', desc: '仕様書から最適なライブラリを自動選択。' },
];

const STORAGE_KEY_INSTRUCTION = 'kokoro_builder_hybrid_instruction';
const STORAGE_KEY_SPEC = 'kokoro_builder_hybrid_spec';

// モジュール型
type ModuleInfo = {
  id: number;
  name: string;
  description: string;
  dependencies: number[];
  implementation_notes: string;
};
type ModuleState = 'pending' | 'generating' | 'done' | 'error';
type GeneratedModule = ModuleInfo & { code: string; state: ModuleState };

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

  // Hybrid用
  const [hybridPhase, setHybridPhase] = useState<'input' | 'step1_loading' | 'step1_done' | 'step2_loading' | 'done'>('input');
  const [geminiInstruction, setGeminiInstruction] = useState('');

  // Modular用
  const [modularPhase, setModularPhase] = useState<'input' | 'designing' | 'design_done' | 'splitting' | 'split_done' | 'building' | 'integrating' | 'done'>('input');
  const [modules, setModules] = useState<GeneratedModule[]>([]);
  const [integrationNotes, setIntegrationNotes] = useState('');
  const [designDoc, setDesignDoc] = useState('');
  const [currentModuleIndex, setCurrentModuleIndex] = useState(-1);

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

    // Hybridの前回の設計書を復元
    try {
      const savedInstruction = localStorage.getItem(STORAGE_KEY_INSTRUCTION);
      const savedSpec = localStorage.getItem(STORAGE_KEY_SPEC);
      if (savedInstruction && savedSpec) {
        setGeminiInstruction(savedInstruction);
        setSpec(prev => prev || savedSpec);
        setBuildType('hybrid');
        setHybridPhase('step1_done');
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

  // === 通常モード ===
  const handleBuildNormal = useCallback(async () => {
    if (!spec.trim()) return;
    setPhase('generating');
    setError('');
    setGeneratedCode('');
    setPreviewUrl(null);
    setShowCode(false);
    setCopied(false);
    try {
      const data = await apiFetch('/api/kokoro-builder', { spec: spec.trim(), buildType });
      showPreview(data.code as string);
    } catch (e) {
      setError(e instanceof DOMException && e.name === 'AbortError' ? 'タイムアウト' : (e instanceof Error ? e.message : 'エラー'));
      setPhase('input');
    }
  }, [spec, buildType, showPreview, apiFetch]);

  // === Hybrid Step 1 ===
  const handleHybridStep1 = useCallback(async () => {
    if (!spec.trim()) return;
    setHybridPhase('step1_loading');
    setError('');
    setGeminiInstruction('');
    try {
      const data = await apiFetch('/api/kokoro-builder-hybrid', { spec: spec.trim(), step: 'gemini' });
      const instruction = data.instruction as string;
      setGeminiInstruction(instruction);
      setHybridPhase('step1_done');
      localStorage.setItem(STORAGE_KEY_INSTRUCTION, instruction);
      localStorage.setItem(STORAGE_KEY_SPEC, spec.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : '設計書の生成に失敗しました');
      setHybridPhase('input');
    }
  }, [spec, apiFetch]);

  // === Hybrid Step 2 ===
  const handleHybridStep2 = useCallback(async () => {
    if (!geminiInstruction) return;
    setHybridPhase('step2_loading');
    setPhase('generating');
    setError('');
    setGeneratedCode('');
    setPreviewUrl(null);
    setShowCode(false);
    setCopied(false);
    try {
      const data = await apiFetch('/api/kokoro-builder-hybrid', { spec: spec.trim(), step: 'claude', instruction: geminiInstruction });
      showPreview(data.code as string);
      setHybridPhase('done');
      localStorage.removeItem(STORAGE_KEY_INSTRUCTION);
      localStorage.removeItem(STORAGE_KEY_SPEC);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'コード生成に失敗しました');
      setHybridPhase('step1_done');
      setPhase('input');
    }
  }, [spec, geminiInstruction, showPreview, apiFetch]);

  // === Modular Step 1a: 設計書生成 ===
  const handleModularDesign = useCallback(async () => {
    if (!spec.trim()) return;
    setModularPhase('designing');
    setError('');
    setModules([]);
    setIntegrationNotes('');
    setDesignDoc('');
    try {
      const data = await apiFetch('/api/builder-split', { spec: spec.trim() });
      setDesignDoc(data.designDoc || '');
      setModularPhase('design_done');
    } catch (e) {
      setError(e instanceof Error ? e.message : '設計書の生成に失敗しました');
      setModularPhase('input');
    }
  }, [spec, apiFetch]);

  // === Modular Step 1b: モジュール分割 ===
  const handleModularSplit = useCallback(async () => {
    if (!designDoc) return;
    setModularPhase('splitting');
    setError('');
    setModules([]);
    setIntegrationNotes('');
    try {
      const data = await apiFetch('/api/builder-split-modules', { designDoc });
      const mods: GeneratedModule[] = (data.modules as ModuleInfo[]).map(m => ({ ...m, code: '', state: 'pending' as ModuleState }));
      setModules(mods);
      setIntegrationNotes(data.integration_notes || '');
      setModularPhase('split_done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'モジュール分割に失敗しました');
      setModularPhase('design_done');
    }
  }, [designDoc, apiFetch]);

  // === Modular: 全モジュール順番に生成 ===
  const handleModularBuild = useCallback(async () => {
    if (modules.length === 0) return;
    setModularPhase('building');
    setError('');

    const updated = [...modules];

    for (let i = 0; i < updated.length; i++) {
      setCurrentModuleIndex(i);
      updated[i] = { ...updated[i], state: 'generating' };
      setModules([...updated]);

      // 依存モジュールのコードを収集
      const previousCode = updated
        .filter(m => updated[i].dependencies.includes(m.id) && m.state === 'done')
        .map(m => `// === ${m.name} ===\n${m.code}`)
        .join('\n\n');

      try {
        const data = await apiFetch('/api/builder-module', {
          spec: spec.trim(),
          moduleName: updated[i].name,
          moduleDescription: updated[i].description,
          implementationNotes: updated[i].implementation_notes,
          previousModules: previousCode,
        });
        updated[i] = { ...updated[i], code: data.code as string, state: 'done' };
        setModules([...updated]);
      } catch (e) {
        updated[i] = { ...updated[i], state: 'error' };
        setModules([...updated]);
        setError(`Module「${updated[i].name}」の生成に失敗: ${e instanceof Error ? e.message : 'エラー'}`);
        return; // 中断
      }
    }

    // 全モジュール完了 → 統合
    setModularPhase('integrating');
    setCurrentModuleIndex(-1);
    try {
      const modulesForIntegration = updated
        .filter(m => m.state === 'done')
        .map(m => ({ name: m.name, code: m.code }));

      const moduleDesigns = updated.map(m => ({
        id: m.id,
        name: m.name,
        description: m.description,
        dependencies: m.dependencies,
        implementation_notes: m.implementation_notes,
      }));

      const data = await apiFetch('/api/builder-integrate', {
        spec: spec.trim(),
        modules: modulesForIntegration,
        integrationNotes,
        moduleDesigns,
        designDoc,
      });

      showPreview(data.code as string);
      setModularPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : '統合に失敗しました');
      setModularPhase('split_done');
    }
  }, [modules, spec, integrationNotes, designDoc, apiFetch, showPreview]);

  // === Modular: 失敗モジュールをリトライ ===
  const handleRetryModule = useCallback(async (index: number) => {
    const updated = [...modules];
    updated[index] = { ...updated[index], state: 'generating' };
    setModules([...updated]);
    setError('');

    const previousCode = updated
      .filter(m => updated[index].dependencies.includes(m.id) && m.state === 'done')
      .map(m => `// === ${m.name} ===\n${m.code}`)
      .join('\n\n');

    try {
      const data = await apiFetch('/api/builder-module', {
        spec: spec.trim(),
        moduleName: updated[index].name,
        moduleDescription: updated[index].description,
        implementationNotes: updated[index].implementation_notes,
        previousModules: previousCode,
      });
      updated[index] = { ...updated[index], code: data.code as string, state: 'done' };
      setModules([...updated]);
    } catch (e) {
      updated[index] = { ...updated[index], state: 'error' };
      setModules([...updated]);
      setError(`リトライ失敗: ${e instanceof Error ? e.message : 'エラー'}`);
    }
  }, [modules, spec, apiFetch]);

  // ビルド実行（通常モード用）
  const handleBuild = useCallback(() => {
    handleBuildNormal();
  }, [handleBuildNormal]);

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

  // リセット
  const handleReset = useCallback(() => {
    setPhase('input');
    setHybridPhase('input');
    setModularPhase('input');
    setGeneratedCode('');
    setPreviewUrl(null);
    setError('');
    setShowCode(false);
    setCopied(false);
    setGeminiInstruction('');
    setModules([]);
    setIntegrationNotes('');
    setDesignDoc('');
    setCurrentModuleIndex(-1);
    localStorage.removeItem(STORAGE_KEY_INSTRUCTION);
    localStorage.removeItem(STORAGE_KEY_SPEC);
  }, []);

  const isHybrid = buildType === 'hybrid';
  const isModular = buildType === 'modular';

  // モジュール進捗
  const doneCount = modules.filter(m => m.state === 'done').length;

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
        {phase === 'input' && (!isHybrid || hybridPhase === 'input' || hybridPhase === 'step1_loading') && (!isModular || modularPhase === 'input' || modularPhase === 'designing') && (
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
              placeholder="仕様書をここに貼り付けてください"
              disabled={hybridPhase === 'step1_loading' || modularPhase === 'designing'}
              style={{
                width: '100%', minHeight: 200, resize: 'vertical',
                fontFamily: "'Noto Sans JP', sans-serif", fontSize: 13, lineHeight: 1.8,
                background: '#f8f9fa', border: '1px solid #d1d5db', borderRadius: 6,
                padding: 16, outline: 'none', color: '#374151',
                opacity: (hybridPhase === 'step1_loading' || modularPhase === 'designing') ? 0.5 : 1,
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
                    disabled={hybridPhase === 'step1_loading' || modularPhase === 'designing'}
                    style={{
                      textAlign: 'left', padding: '10px 14px',
                      background: buildType === opt.value ? 'rgba(124,58,237,0.06)' : '#f8f9fa',
                      border: buildType === opt.value ? `2px solid ${accentColor}` : '1px solid #e5e7eb',
                      borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ ...mono, fontSize: 10, marginRight: 8, color: buildType === opt.value ? accentColor : '#9ca3af' }}>
                      {buildType === opt.value ? '◉' : '○'}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: buildType === opt.value ? 500 : 300, color: buildType === opt.value ? accentColor : '#374151' }}>
                      {opt.label}
                    </span>
                    <span style={{ ...mono, fontSize: 9, color: '#9ca3af', marginLeft: 10 }}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ボタン */}
            {isHybrid ? (
              <div>
                <button onClick={handleHybridStep1} disabled={!spec.trim() || hybridPhase === 'step1_loading'} style={{
                  ...mono, fontSize: 11, letterSpacing: '0.16em', background: '#3b82f6', border: 'none', color: '#fff',
                  padding: '14px 32px', borderRadius: 4, cursor: (!spec.trim() || hybridPhase === 'step1_loading') ? 'not-allowed' : 'pointer',
                  marginTop: 24, opacity: (!spec.trim() || hybridPhase === 'step1_loading') ? 0.5 : 1, display: 'block', width: '100%',
                }}>
                  {hybridPhase === 'step1_loading' ? '// Geminiが設計中...' : 'Step 1: Geminiで設計する'}
                </button>
                {hybridPhase === 'step1_loading' && <PersonaLoading />}
              </div>
            ) : isModular ? (
              <div>
                <button onClick={handleModularDesign} disabled={!spec.trim() || modularPhase === 'designing'} style={{
                  ...mono, fontSize: 11, letterSpacing: '0.16em', background: '#f59e0b', border: 'none', color: '#fff',
                  padding: '14px 32px', borderRadius: 4, cursor: (!spec.trim() || modularPhase === 'designing') ? 'not-allowed' : 'pointer',
                  marginTop: 24, opacity: (!spec.trim() || modularPhase === 'designing') ? 0.5 : 1, display: 'block', width: '100%',
                }}>
                  {modularPhase === 'designing' ? '// Geminiが設計中...' : 'Step 1: Geminiで設計書を生成する'}
                </button>
                {modularPhase === 'designing' && <PersonaLoading />}
              </div>
            ) : (
              <button onClick={handleBuild} disabled={!spec.trim()} style={{
                ...mono, fontSize: 11, letterSpacing: '0.16em', background: accentColor, border: 'none', color: '#fff',
                padding: '14px 32px', borderRadius: 4, cursor: spec.trim() ? 'pointer' : 'not-allowed',
                marginTop: 24, opacity: spec.trim() ? 1 : 0.5, display: 'block', width: '100%',
              }}>
                Yoroshiku
              </button>
            )}
          </div>
        )}

        {/* === Hybrid Step 1完了 === */}
        {isHybrid && (hybridPhase === 'step1_done' || hybridPhase === 'step2_loading') && phase !== 'done' && (
          <div>
            <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: '#059669', textTransform: 'uppercase', marginBottom: 16 }}>
              // Step 1完了 — Geminiの設計書
            </div>
            <div style={{ background: '#f8f9fa', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: 20, marginBottom: 20, maxHeight: 500, overflowY: 'auto' }}>
              <pre style={{ fontSize: 12, lineHeight: 1.8, color: '#374151', fontFamily: "'Noto Sans JP', sans-serif", whiteSpace: 'pre-wrap', margin: 0 }}>
                {geminiInstruction}
              </pre>
            </div>
            <button onClick={handleHybridStep2} disabled={hybridPhase === 'step2_loading'} style={{
              ...mono, fontSize: 11, letterSpacing: '0.16em', background: accentColor, border: 'none', color: '#fff',
              padding: '14px 32px', borderRadius: 4, cursor: hybridPhase === 'step2_loading' ? 'not-allowed' : 'pointer',
              opacity: hybridPhase === 'step2_loading' ? 0.5 : 1, display: 'block', width: '100%', marginBottom: 12,
            }}>
              {hybridPhase === 'step2_loading' ? '// Claudeが実装中...' : 'Step 2: Claudeで実装する'}
            </button>
            {hybridPhase === 'step2_loading' && <PersonaLoading />}
            <button onClick={handleReset} disabled={hybridPhase === 'step2_loading'} style={{
              ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
              padding: '10px 20px', borderRadius: 4, cursor: hybridPhase === 'step2_loading' ? 'not-allowed' : 'pointer', display: 'block', width: '100%',
            }}>最初からやり直す</button>
          </div>
        )}

        {/* === Modular: 設計書完了 → モジュール分割ボタン === */}
        {isModular && (modularPhase === 'design_done' || modularPhase === 'splitting') && (
          <div>
            <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: '#059669', textTransform: 'uppercase', marginBottom: 16 }}>
              // Step 1完了 — Geminiの設計書
            </div>
            <div style={{ background: '#f8f9fa', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: 20, marginBottom: 20, maxHeight: 500, overflowY: 'auto' }}>
              <pre style={{ fontSize: 12, lineHeight: 1.8, color: '#374151', fontFamily: "'Noto Sans JP', sans-serif", whiteSpace: 'pre-wrap', margin: 0 }}>
                {designDoc}
              </pre>
            </div>
            <button onClick={handleModularSplit} disabled={modularPhase === 'splitting'} style={{
              ...mono, fontSize: 11, letterSpacing: '0.16em', background: '#f59e0b', border: 'none', color: '#fff',
              padding: '14px 32px', borderRadius: 4, cursor: modularPhase === 'splitting' ? 'not-allowed' : 'pointer',
              opacity: modularPhase === 'splitting' ? 0.5 : 1, display: 'block', width: '100%', marginBottom: 12,
            }}>
              {modularPhase === 'splitting' ? '// モジュール分割中...' : 'Step 2: モジュールに分割する'}
            </button>
            {modularPhase === 'splitting' && <PersonaLoading />}
            <button onClick={handleReset} disabled={modularPhase === 'splitting'} style={{
              ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
              padding: '10px 20px', borderRadius: 4, cursor: modularPhase === 'splitting' ? 'not-allowed' : 'pointer', display: 'block', width: '100%',
            }}>最初からやり直す</button>
          </div>
        )}

        {/* === Modular: モジュール一覧 + ビルド === */}
        {isModular && (modularPhase === 'split_done' || modularPhase === 'building' || modularPhase === 'integrating') && phase !== 'done' && (
          <div>
            <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: '#f59e0b', textTransform: 'uppercase', marginBottom: 16 }}>
              // モジュール構成
            </div>

            {/* モジュール一覧 */}
            <div style={{ background: '#f8f9fa', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
              {modules.map((m, i) => (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                  borderBottom: i < modules.length - 1 ? '1px solid #e5e7eb' : 'none',
                }}>
                  <span style={{ ...mono, fontSize: 14, width: 20, textAlign: 'center' }}>
                    {m.state === 'done' ? '✓' : m.state === 'generating' ? '○' : m.state === 'error' ? '✗' : '-'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: m.state === 'generating' ? 500 : 300, color: m.state === 'generating' ? accentColor : m.state === 'done' ? '#059669' : m.state === 'error' ? '#ef4444' : '#6b7280' }}>
                      Module {m.id}: {m.name}
                    </div>
                    <div style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>{m.description}</div>
                  </div>
                  {m.state === 'error' && modularPhase !== 'building' && (
                    <button onClick={() => handleRetryModule(i)} style={{
                      ...mono, fontSize: 8, color: '#ef4444', background: 'transparent', border: '1px solid #ef4444',
                      padding: '3px 8px', borderRadius: 3, cursor: 'pointer',
                    }}>retry</button>
                  )}
                  {m.state === 'generating' && (
                    <span style={{ ...mono, fontSize: 9, color: accentColor, animation: 'personaBlink 1.0s ease-in-out infinite' }}>生成中</span>
                  )}
                </div>
              ))}
            </div>

            {/* プログレスバー */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>
                  {modularPhase === 'integrating' ? '統合中...' : `${doneCount}/${modules.length} 完了`}
                </span>
              </div>
              <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2 }}>
                <div style={{
                  height: '100%', borderRadius: 2, transition: 'width 0.3s ease',
                  background: modularPhase === 'integrating' ? '#059669' : '#f59e0b',
                  width: modularPhase === 'integrating' ? '100%' : `${(doneCount / modules.length) * 100}%`,
                }} />
              </div>
            </div>

            {modularPhase === 'integrating' && <PersonaLoading />}

            {/* ビルド開始ボタン（split_doneのとき） */}
            {modularPhase === 'split_done' && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={handleModularBuild} style={{
                  ...mono, fontSize: 11, letterSpacing: '0.16em', background: accentColor, border: 'none', color: '#fff',
                  padding: '14px 32px', borderRadius: 4, cursor: 'pointer', flex: 1,
                }}>
                  Step 3: 全モジュールを生成・統合する
                </button>
                <button onClick={handleReset} style={{
                  ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
                  padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                }}>やり直す</button>
              </div>
            )}
          </div>
        )}

        {/* === 通常モード: 生成中 === */}
        {!isHybrid && !isModular && phase === 'generating' && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ ...mono, fontSize: 11, letterSpacing: '0.16em', color: accentColor }}>
              // コードを生成しています...
            </div>
            <PersonaLoading />
            <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginTop: 8 }}>
              仕様書の複雑さにより1〜2分かかる場合があります
            </div>
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
              <button onClick={() => setShowCode(prev => !prev)} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>{showCode ? 'コードを隠す' : 'コードを見る'}</button>
              <button onClick={handleReset} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>もう一度</button>
            </div>

            {/* Geminiの設計書（Hybrid） */}
            {isHybrid && geminiInstruction && (
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
          <div style={{ marginTop: 16, ...mono, fontSize: 10, color: '#ef4444', lineHeight: 1.6 }}>
            // エラー: {error}
          </div>
        )}
      </div>
    </div>
  );
}
