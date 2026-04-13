'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import PersonaLoading from '@/components/PersonaLoading';

const mono = { fontFamily: "'Space Mono', monospace" } as const;
const accentColor = '#7c3aed';

type BuildType = 'html' | 'nextjs' | 'react' | 'auto';

type BuildResult =
  | { type: 'single'; code: string }
  | { type: 'project'; files: { path: string; content: string }[]; instructions: string };

const BUILD_OPTIONS: { value: BuildType; label: string; desc: string }[] = [
  { value: 'html', label: 'シングルHTMLファイル', desc: '1ファイルで完結。すぐ動く。' },
  { value: 'nextjs', label: 'Next.jsプロジェクト', desc: 'App Router + TypeScript + Tailwind。' },
  { value: 'react', label: 'Reactコンポーネント', desc: '関数コンポーネント + Hooks。' },
  { value: 'auto', label: 'AIに任せる', desc: '仕様書から最適な形式を判断。' },
];

export default function KokoroBuilderPage() {
  const router = useRouter();

  const [spec, setSpec] = useState('');
  const [buildType, setBuildType] = useState<BuildType>('html');
  const [fromGatekeeper, setFromGatekeeper] = useState(false);
  const [phase, setPhase] = useState<'input' | 'generating' | 'done'>('input');
  const [result, setResult] = useState<BuildResult | null>(null);
  const [error, setError] = useState('');

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

  // コード生成
  const handleBuild = useCallback(async () => {
    if (!spec.trim()) return;
    setPhase('generating');
    setError('');
    setResult(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2分タイムアウト

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
      setResult(data as BuildResult);
      setPhase('done');
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
  }, [spec, buildType]);

  // ZIPダウンロード
  const handleDownloadZip = useCallback(async () => {
    if (!result) return;
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    if (result.type === 'single') {
      zip.file('index.html', result.code);
    } else {
      result.files.forEach(({ path, content }) => {
        zip.file(path, content);
      });
      if (result.instructions) {
        zip.file('README.md', result.instructions);
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kokoro-builder-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  // Worldへ渡す
  const handleToWorld = useCallback(() => {
    if (!result || result.type !== 'single') return;
    localStorage.setItem('kokoro_world_input', JSON.stringify({
      strategyHtml: result.code,
      strategyText: spec,
      savedAt: new Date().toISOString(),
      source: 'builder',
    }));
    router.push('/kokoro-world');
  }, [result, spec, router]);

  // コードプレビュー取得
  const getPreviewCode = () => {
    if (!result) return '';
    if (result.type === 'single') return result.code;
    return result.files.map(f => `// === ${f.path} ===\n${f.content}`).join('\n\n');
  };

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
            width: 32, height: 32, border: `1px solid rgba(124,58,237,0.3)`,
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
            <div style={{ ...mono, fontSize: 11, letterSpacing: '0.16em', color: accentColor }}>
              // コードを生成しています...
            </div>
            <PersonaLoading />
            <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginTop: 8 }}>
              仕様書の複雑さにより1〜2分かかる場合があります
            </div>
          </div>
        )}

        {/* 完了 */}
        {phase === 'done' && result && (
          <div>
            <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: '#059669', textTransform: 'uppercase', marginBottom: 16 }}>
              // 生成完了
            </div>

            {/* ファイル情報 */}
            {result.type === 'project' && (
              <div style={{
                ...mono, fontSize: 9, color: '#6b7280', background: '#f8f9fa',
                border: '1px solid #e5e7eb', borderRadius: 6, padding: 12, marginBottom: 16,
              }}>
                {result.files.length}ファイル生成
                {result.files.map(f => (
                  <div key={f.path} style={{ marginTop: 4, color: accentColor }}>{f.path}</div>
                ))}
              </div>
            )}

            {/* コードプレビュー */}
            <div style={{
              background: '#1e1e1e', border: '1px solid #333', borderRadius: 8,
              padding: 20, maxHeight: 500, overflowY: 'auto', marginBottom: 20,
            }}>
              <pre style={{
                fontSize: 11, lineHeight: 1.6, color: '#d4d4d4',
                fontFamily: "'Space Mono', 'Courier New', monospace",
                whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0,
              }}>
                {getPreviewCode()}
              </pre>
            </div>

            {/* アクションボタン */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={handleDownloadZip}
                style={{
                  ...mono, fontSize: 10, letterSpacing: '0.12em',
                  background: accentColor, border: 'none', color: '#fff',
                  padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                }}
              >Download ZIP ↓</button>

              {result.type === 'single' && (
                <button
                  onClick={handleToWorld}
                  style={{
                    ...mono, fontSize: 10, letterSpacing: '0.12em',
                    background: '#fff', border: '1px solid #10b981', color: '#10b981',
                    padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                  }}
                >World →</button>
              )}

              <button
                onClick={() => router.push('/kokoro-note')}
                style={{
                  ...mono, fontSize: 10, letterSpacing: '0.12em',
                  background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
                  padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                }}
              >Note +</button>

              <button
                onClick={() => { setPhase('input'); setResult(null); setError(''); }}
                style={{
                  ...mono, fontSize: 10, letterSpacing: '0.12em',
                  background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
                  padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                }}
              >もう一度</button>
            </div>

            {/* セットアップ手順 */}
            {result.type === 'project' && result.instructions && (
              <div style={{
                marginTop: 24, background: '#f8f9fa', border: '1px solid #e5e7eb',
                borderRadius: 6, padding: 16,
              }}>
                <div style={{ ...mono, fontSize: 9, letterSpacing: '0.14em', color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase' }}>
                  // セットアップ手順
                </div>
                <pre style={{
                  fontSize: 12, lineHeight: 1.8, color: '#374151',
                  fontFamily: "'Noto Sans JP', sans-serif",
                  whiteSpace: 'pre-wrap', margin: 0,
                }}>
                  {result.instructions}
                </pre>
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
