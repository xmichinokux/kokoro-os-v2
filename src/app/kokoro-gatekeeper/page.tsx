'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import PersonaLoading from '@/components/PersonaLoading';

const mono = { fontFamily: "'Space Mono', monospace" } as const;
const accentColor = '#6366f1';

type HistoryEntry = {
  question: string;
  options: string[];
  selected: string;
};

type Phase = 'input' | 'questions' | 'generating' | 'done';

export default function KokoroGatekeeperPage() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('input');
  const [input, setInput] = useState('');
  const [strategyData, setStrategyData] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [holdList, setHoldList] = useState<string[]>([]);

  // 質問フェーズ
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentOptions, setCurrentOptions] = useState<string[]>([]);
  const [selectedOption, setSelectedOption] = useState('');
  const [isLast, setIsLast] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 7 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 仕様書
  const [spec, setSpec] = useState('');

  // Strategyデータ読み込み
  useEffect(() => {
    try {
      const raw = localStorage.getItem('kokoro_strategy_inputs');
      if (raw) {
        const parsed = JSON.parse(raw);
        const text = Object.entries(parsed)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n');
        if (text.trim()) setStrategyData(text);
      }
    } catch { /* ignore */ }
  }, []);

  const callApi = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch('/api/kokoro-gatekeeper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`サーバーエラー（${res.status}）: ${text.slice(0, 100)}`); }
    if (data.error) throw new Error(data.error);
    return data;
  }, []);

  // ステップ1: 最初の質問を取得
  const handleStart = useCallback(async () => {
    if (!input.trim() && !strategyData) return;
    setLoading(true);
    setError('');
    try {
      const data = await callApi({
        phase: 'start',
        input: input.trim(),
        strategyData: strategyData || undefined,
      });
      setCurrentQuestion(data.question);
      setCurrentOptions(data.options);
      setIsLast(data.isLast);
      setProgress(data.progress);
      setSelectedOption('');
      setPhase('questions');
    } catch (e) {
      setError(e instanceof Error ? e.message : '質問の生成に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [input, strategyData, callApi]);

  // 次の質問 or 仕様書生成
  const handleNext = useCallback(async () => {
    if (!selectedOption) return;
    const newHistory = [...history, { question: currentQuestion, options: currentOptions, selected: selectedOption }];
    setHistory(newHistory);

    if (isLast) {
      // 仕様書生成
      setPhase('generating');
      setLoading(true);
      setError('');
      try {
        const data = await callApi({
          phase: 'generate',
          input: input.trim(),
          history: newHistory,
        });
        setSpec(data.spec);
        // Builderへの受け渡し
        localStorage.setItem('kokoro_builder_input', JSON.stringify({
          spec: data.spec,
          savedAt: new Date().toISOString(),
        }));
        setPhase('done');
      } catch (e) {
        setError(e instanceof Error ? e.message : '仕様書の生成に失敗しました');
        setPhase('questions');
      } finally {
        setLoading(false);
      }
      return;
    }

    // 次の質問
    setLoading(true);
    setError('');
    try {
      const data = await callApi({
        phase: 'next',
        history: newHistory,
        questionCount: newHistory.length + 1,
      });
      setCurrentQuestion(data.question);
      setCurrentOptions(data.options);
      setIsLast(data.isLast);
      setProgress(data.progress);
      setSelectedOption('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '質問の生成に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [selectedOption, history, currentQuestion, currentOptions, isLast, input, callApi]);

  // 持ち帰りリストに追加
  const addToHoldList = useCallback(() => {
    if (currentQuestion && !holdList.includes(currentQuestion)) {
      setHoldList(prev => [...prev, currentQuestion]);
    }
  }, [currentQuestion, holdList]);

  // mdダウンロード
  const downloadSpec = useCallback(() => {
    // 持ち帰りリストを仕様書の末尾に追加
    let fullSpec = spec;
    if (holdList.length > 0) {
      fullSpec += '\n\n## 持ち帰りリスト（未決定事項）\n' + holdList.map(q => `- ${q}`).join('\n');
    }
    const blob = new Blob([fullSpec], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gatekeeper-spec-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [spec, holdList]);

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
            width: 32, height: 32, border: `1px solid rgba(99,102,241,0.3)`,
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(circle at 40% 40%,rgba(99,102,241,0.1) 0%,transparent 70%)',
            fontSize: 16,
          }}>🔒</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: accentColor }}>Gatekeeper</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>
              要求から仕様書を生成
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

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 28px 100px' }}>

        {/* ステップ1: 入力 */}
        {phase === 'input' && (
          <div>
            <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: accentColor, textTransform: 'uppercase', marginBottom: 16 }}>
              // 何を作りますか？
            </div>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="自由に記入してください（企画書・アイデア・やりたいこと等）"
              style={{
                width: '100%', minHeight: 160, resize: 'vertical',
                fontFamily: "'Noto Sans JP', sans-serif", fontSize: 14, lineHeight: 1.8,
                background: '#f8f9fa', border: '1px solid #d1d5db', borderRadius: 6,
                padding: 16, outline: 'none', color: '#374151',
              }}
            />

            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              {strategyData && (
                <button
                  onClick={() => setInput(prev => prev ? prev + '\n\n' + strategyData : strategyData!)}
                  style={{
                    ...mono, fontSize: 9, letterSpacing: '0.12em',
                    background: '#fff', border: '1px solid #f59e0b', color: '#f59e0b',
                    padding: '8px 16px', borderRadius: 3, cursor: 'pointer',
                  }}
                >Strategy から読み込む</button>
              )}
              <label style={{
                ...mono, fontSize: 9, letterSpacing: '0.12em',
                background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
                padding: '8px 16px', borderRadius: 3, cursor: 'pointer',
                display: 'flex', alignItems: 'center',
              }}>
                テキストファイルを選択
                <input type="file" accept=".txt,.md" style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setInput(prev => prev ? prev + '\n\n' + reader.result : String(reader.result));
                    reader.readAsText(file);
                  }}
                />
              </label>
            </div>

            <button
              onClick={handleStart}
              disabled={loading || (!input.trim() && !strategyData)}
              style={{
                ...mono, fontSize: 11, letterSpacing: '0.16em',
                background: accentColor, border: 'none', color: '#fff',
                padding: '14px 32px', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer',
                marginTop: 24, opacity: loading || (!input.trim() && !strategyData) ? 0.5 : 1,
                display: 'block', width: '100%',
              }}
            >
              {loading ? '// 質問を生成中...' : 'Yoroshiku'}
            </button>

            {loading && <PersonaLoading />}
          </div>
        )}

        {/* ステップ2: 質問フェーズ */}
        {phase === 'questions' && (
          <div>
            {/* 進行バー */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ ...mono, fontSize: 9, color: '#9ca3af', letterSpacing: '0.12em' }}>
                  質問 {progress.current}/{progress.total}
                </span>
                {holdList.length > 0 && (
                  <span style={{ ...mono, fontSize: 9, color: '#f59e0b' }}>
                    持ち帰り: {holdList.length}件
                  </span>
                )}
              </div>
              <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2 }}>
                <div style={{
                  height: '100%', background: accentColor, borderRadius: 2,
                  width: `${(progress.current / progress.total) * 100}%`,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>

            {/* 質問 */}
            <div style={{ fontSize: 16, fontWeight: 500, color: '#111827', lineHeight: 1.8, marginBottom: 20 }}>
              {currentQuestion}
            </div>

            {/* 選択肢 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {currentOptions.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedOption(opt)}
                  disabled={loading}
                  style={{
                    textAlign: 'left', padding: '12px 16px',
                    background: selectedOption === opt ? 'rgba(99,102,241,0.08)' : '#f8f9fa',
                    border: selectedOption === opt ? `2px solid ${accentColor}` : '1px solid #e5e7eb',
                    borderRadius: 6, cursor: 'pointer',
                    fontSize: 14, color: selectedOption === opt ? accentColor : '#374151',
                    fontWeight: selectedOption === opt ? 500 : 300,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ ...mono, fontSize: 10, marginRight: 8, color: selectedOption === opt ? accentColor : '#9ca3af' }}>
                    {selectedOption === opt ? '◉' : '○'}
                  </span>
                  {opt}
                </button>
              ))}
            </div>

            {/* アクションボタン */}
            <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
              <button
                onClick={addToHoldList}
                disabled={loading || holdList.includes(currentQuestion)}
                style={{
                  ...mono, fontSize: 9, letterSpacing: '0.1em',
                  background: '#fff', border: '1px solid #f59e0b', color: '#f59e0b',
                  padding: '8px 14px', borderRadius: 3,
                  cursor: holdList.includes(currentQuestion) ? 'not-allowed' : 'pointer',
                  opacity: holdList.includes(currentQuestion) ? 0.5 : 1,
                }}
              >
                {holdList.includes(currentQuestion) ? '✓ リストに追加済み' : '持ち帰りリストに追加'}
              </button>
              <div style={{ flex: 1 }} />
              <button
                onClick={handleNext}
                disabled={!selectedOption || loading}
                style={{
                  ...mono, fontSize: 11, letterSpacing: '0.14em',
                  background: accentColor, border: 'none', color: '#fff',
                  padding: '10px 24px', borderRadius: 4,
                  cursor: (!selectedOption || loading) ? 'not-allowed' : 'pointer',
                  opacity: (!selectedOption || loading) ? 0.5 : 1,
                }}
              >
                {loading ? '// 処理中...' : isLast ? '仕様書を生成 →' : '次へ →'}
              </button>
            </div>

            {loading && <PersonaLoading />}

            {/* 回答履歴 */}
            {history.length > 0 && (
              <div style={{ marginTop: 28, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                <div style={{ ...mono, fontSize: 8, letterSpacing: '0.16em', color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase' }}>
                  // これまでの回答
                </div>
                {history.map((h, i) => (
                  <div key={i} style={{ ...mono, fontSize: 9, color: '#6b7280', lineHeight: 1.8, marginBottom: 4 }}>
                    Q{i + 1}: {h.question} → <span style={{ color: accentColor }}>{h.selected}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ステップ3: 仕様書生成中 */}
        {phase === 'generating' && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ ...mono, fontSize: 11, letterSpacing: '0.16em', color: accentColor }}>
              // 仕様書を生成しています...
            </div>
            <PersonaLoading />
          </div>
        )}

        {/* ステップ4: 完了 */}
        {phase === 'done' && spec && (
          <div>
            <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: accentColor, textTransform: 'uppercase', marginBottom: 16 }}>
              // 仕様書が生成されました
            </div>

            {/* 仕様書プレビュー */}
            <div style={{
              background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: 8,
              padding: 24, maxHeight: 500, overflowY: 'auto', marginBottom: 20,
              fontSize: 13, lineHeight: 1.9, color: '#374151', whiteSpace: 'pre-wrap',
            }}>
              {spec}
            </div>

            {/* 持ち帰りリスト表示 */}
            {holdList.length > 0 && (
              <div style={{
                background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: 6, padding: 16, marginBottom: 20,
              }}>
                <div style={{ ...mono, fontSize: 9, letterSpacing: '0.14em', color: '#f59e0b', marginBottom: 8, textTransform: 'uppercase' }}>
                  // 持ち帰りリスト
                </div>
                {holdList.map((q, i) => (
                  <div key={i} style={{ ...mono, fontSize: 10, color: '#6b7280', lineHeight: 1.8 }}>
                    • {q}
                  </div>
                ))}
              </div>
            )}

            {/* アクションボタン */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={downloadSpec}
                style={{
                  ...mono, fontSize: 10, letterSpacing: '0.12em',
                  background: accentColor, border: 'none', color: '#fff',
                  padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                }}
              >Download ↓ md</button>
              <button
                onClick={() => router.push('/kokoro-builder')}
                style={{
                  ...mono, fontSize: 10, letterSpacing: '0.12em',
                  background: '#fff', border: `1px solid ${accentColor}`, color: accentColor,
                  padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                }}
              >Builder →</button>
              <button
                onClick={() => { setPhase('input'); setInput(''); setHistory([]); setHoldList([]); setSpec(''); setError(''); }}
                style={{
                  ...mono, fontSize: 10, letterSpacing: '0.12em',
                  background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
                  padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                }}
              >最初からやり直す</button>
            </div>
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
