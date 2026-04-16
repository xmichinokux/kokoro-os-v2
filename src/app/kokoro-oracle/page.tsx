'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import PersonaLoading from '@/components/PersonaLoading';

type OracleNode = {
  id: string;
  parentId: string | null;
  question: string;
  hypothesis: string;
  reasoning: string;
  estimate: string;
  nextQuestions: string[];
  createdAt: string;
};

type OracleSession = {
  rootQuestion: string;
  nodes: OracleNode[];
  model: 'haiku' | 'sonnet';
};

const STORAGE_KEY = 'kokoro_oracle_session_v1';

const EXAMPLE_QUESTIONS = [
  '自動車エンジンのエネルギー効率をどこまで上げられるか',
  '小さな書店が10年生き延びるための条件',
  '日本の地方都市で人口減を止めるレバレッジ点',
  'AIが「発見」する科学と人間の科学の違い',
];

const mono = { fontFamily: "'Space Mono', monospace" } as const;
const serif = { fontFamily: "'Noto Serif JP', serif" } as const;
const accent = '#7c3aed';

function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'node-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

export default function KokoroOraclePage() {
  const [rootQuestion, setRootQuestion] = useState('');
  const [nodes, setNodes] = useState<OracleNode[]>([]);
  const [model, setModel] = useState<'haiku' | 'sonnet'>('haiku');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const chainEndRef = useRef<HTMLDivElement>(null);

  // 初回読み込み: localStorageから復元
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as OracleSession;
      if (parsed.rootQuestion && Array.isArray(parsed.nodes)) {
        setRootQuestion(parsed.rootQuestion);
        setNodes(parsed.nodes);
        if (parsed.model === 'sonnet' || parsed.model === 'haiku') setModel(parsed.model);
      }
    } catch { /* ignore */ }
  }, []);

  // 保存
  useEffect(() => {
    if (nodes.length === 0 && !rootQuestion) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    try {
      const session: OracleSession = { rootQuestion, nodes, model };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch { /* ignore */ }
  }, [rootQuestion, nodes, model]);

  // 最新ノードへスクロール
  useEffect(() => {
    if (nodes.length === 0) return;
    chainEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [nodes.length]);

  const callOracle = useCallback(async (question: string, parentId: string | null) => {
    setLoading(true);
    setError('');
    try {
      const context = nodes.map(n => ({
        question: n.question,
        hypothesis: n.hypothesis,
        reasoning: n.reasoning,
        estimate: n.estimate,
      }));
      const res = await fetch('/api/kokoro-oracle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context, model }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `API エラー (${res.status})`);
      const newNode: OracleNode = {
        id: genId(),
        parentId,
        question,
        hypothesis: data.hypothesis,
        reasoning: data.reasoning,
        estimate: data.estimate,
        nextQuestions: Array.isArray(data.nextQuestions) ? data.nextQuestions : [],
        createdAt: new Date().toISOString(),
      };
      setNodes(prev => [...prev, newNode]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [nodes, model]);

  const handleStart = useCallback(async () => {
    const q = input.trim();
    if (!q || loading) return;
    setRootQuestion(q);
    setNodes([]);
    setInput('');
    await callOracle(q, null);
  }, [input, loading, callOracle]);

  const handleDrill = useCallback(async (question: string, parentId: string) => {
    if (loading) return;
    await callOracle(question, parentId);
  }, [loading, callOracle]);

  const handleCustomDrill = useCallback(async () => {
    const q = input.trim();
    if (!q || loading) return;
    const lastId = nodes.length > 0 ? nodes[nodes.length - 1].id : null;
    setInput('');
    await callOracle(q, lastId);
  }, [input, loading, nodes, callOracle]);

  const handleReset = useCallback(() => {
    if (!window.confirm('探索をすべて初期化します。よろしいですか？')) return;
    setRootQuestion('');
    setNodes([]);
    setInput('');
    setError('');
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const handleUndo = useCallback(() => {
    setNodes(prev => prev.slice(0, -1));
    setError('');
  }, []);

  const started = rootQuestion !== '' && nodes.length > 0;

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#1a1a1a' }}>
      {/* Header */}
      <header style={{
        padding: '14px 28px', borderBottom: '1px solid #e5e7eb',
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/" style={{ ...mono, fontSize: 10, color: '#6b7280', textDecoration: 'none' }}>← Home</Link>
          <div style={{
            width: 32, height: 32, border: `1px solid ${accent}40`,
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `radial-gradient(circle at 40% 40%,${accent}15 0%,transparent 70%)`,
            fontSize: 16,
          }}>🔮</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.06em' }}>
              Kokoro <span style={{ color: accent }}>Oracle</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '0.14em' }}>仮説を反復精錬する探索</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4, background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, padding: 3 }}>
            <button onClick={() => setModel('haiku')} style={{
              ...mono, fontSize: 9, letterSpacing: '0.08em',
              background: model === 'haiku' ? '#fff' : 'transparent',
              border: model === 'haiku' ? '1px solid #d1d5db' : '1px solid transparent',
              color: model === 'haiku' ? '#1a1a1a' : '#9ca3af',
              padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
            }}>Haiku</button>
            <button onClick={() => setModel('sonnet')} style={{
              ...mono, fontSize: 9, letterSpacing: '0.08em',
              background: model === 'sonnet' ? '#fff' : 'transparent',
              border: model === 'sonnet' ? '1px solid #d1d5db' : '1px solid transparent',
              color: model === 'sonnet' ? '#1a1a1a' : '#9ca3af',
              padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
            }}>Sonnet</button>
          </div>
          {started && (
            <button onClick={handleReset} style={{
              ...mono, fontSize: 9, letterSpacing: '0.1em',
              background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
              padding: '6px 12px', borderRadius: 4, cursor: 'pointer',
            }}>初期化</button>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px 140px' }}>
        {/* 最初の問いがまだ → 入力画面 */}
        {!started && (
          <div>
            <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: accent, marginBottom: 12, textTransform: 'uppercase' }}>
              // ORACLE — 大きな問いを投げてください
            </div>
            <p style={{ ...serif, fontSize: 14, color: '#6b7280', lineHeight: 1.9, marginBottom: 24 }}>
              問いを投げると、仮説・根拠・見積もり・次に掘るべき3つの問いが返ってきます。<br />
              そこから一つを選んで掘る、を繰り返すことで真の答えに近づいていきます。
            </p>

            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleStart(); }}
              placeholder="例: 自動車エンジンのエネルギー効率をどこまで上げられるか"
              rows={3}
              style={{
                width: '100%', ...serif, fontSize: 14, lineHeight: 1.8,
                background: '#f8f9fa', border: '1px solid #d1d5db', borderRadius: 8,
                padding: 14, outline: 'none', color: '#1a1a1a',
                resize: 'vertical', minHeight: 80, marginBottom: 12,
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={handleStart}
              disabled={!input.trim() || loading}
              style={{
                ...mono, fontSize: 10, letterSpacing: '0.12em',
                background: (!input.trim() || loading) ? '#d1d5db' : accent,
                border: 'none', color: '#fff',
                padding: '10px 24px', borderRadius: 4,
                cursor: (!input.trim() || loading) ? 'not-allowed' : 'pointer',
                width: '100%',
              }}
            >
              {loading ? '問いかけ中...' : '問いを投げる →'}
            </button>

            <div style={{ marginTop: 28 }}>
              <div style={{ ...mono, fontSize: 9, color: '#9ca3af', letterSpacing: '0.12em', marginBottom: 10 }}>
                // EXAMPLES
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {EXAMPLE_QUESTIONS.map(q => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    style={{
                      ...serif, fontSize: 12, padding: '7px 14px',
                      border: '1px solid #e5e7eb', borderRadius: 20,
                      color: '#6b7280', background: '#fafafa', cursor: 'pointer',
                    }}
                  >{q}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 探索チェーン */}
        {started && (
          <div>
            <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: accent, marginBottom: 20, textTransform: 'uppercase' }}>
              // ROOT QUESTION
            </div>
            <div style={{
              ...serif, fontSize: 15, lineHeight: 1.9, color: '#1a1a1a',
              padding: '14px 18px', background: '#faf5ff',
              border: `1px solid ${accent}30`, borderLeft: `3px solid ${accent}`,
              borderRadius: 6, marginBottom: 24,
            }}>
              {rootQuestion}
            </div>

            {nodes.map((node, i) => (
              <div key={node.id} style={{ marginBottom: 28 }}>
                {i > 0 && (
                  <div style={{ ...mono, fontSize: 9, color: '#9ca3af', letterSpacing: '0.14em', marginBottom: 10 }}>
                    ↓ DRILL {i}
                  </div>
                )}

                {/* 問い（最初以外） */}
                {i > 0 && (
                  <div style={{
                    ...serif, fontSize: 13, color: '#6b7280', lineHeight: 1.8,
                    padding: '8px 14px', marginBottom: 12,
                    borderLeft: '2px solid #d1d5db',
                  }}>
                    {node.question}
                  </div>
                )}

                {/* カード */}
                <div style={{
                  border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden',
                  background: '#ffffff',
                }}>
                  {/* 仮説 */}
                  <div style={{ padding: '16px 18px', borderBottom: '1px solid #f3f4f6', background: '#fafafa' }}>
                    <div style={{ ...mono, fontSize: 8, color: accent, letterSpacing: '0.16em', marginBottom: 6 }}>
                      HYPOTHESIS
                    </div>
                    <div style={{ ...serif, fontSize: 14, lineHeight: 1.9, color: '#1a1a1a', fontWeight: 500 }}>
                      {node.hypothesis}
                    </div>
                  </div>

                  {/* 根拠 */}
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ ...mono, fontSize: 8, color: '#6b7280', letterSpacing: '0.16em', marginBottom: 6 }}>
                      REASONING
                    </div>
                    <div style={{ ...serif, fontSize: 13, lineHeight: 1.85, color: '#374151' }}>
                      {node.reasoning}
                    </div>
                  </div>

                  {/* 見積 */}
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ ...mono, fontSize: 8, color: '#6b7280', letterSpacing: '0.16em', marginBottom: 6 }}>
                      ESTIMATE
                    </div>
                    <div style={{ ...serif, fontSize: 13, lineHeight: 1.85, color: '#374151' }}>
                      {node.estimate}
                    </div>
                  </div>

                  {/* 次の問い */}
                  <div style={{ padding: '14px 18px' }}>
                    <div style={{ ...mono, fontSize: 8, color: '#6b7280', letterSpacing: '0.16em', marginBottom: 10 }}>
                      NEXT QUESTIONS
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {node.nextQuestions.map((q, qi) => (
                        <button
                          key={qi}
                          onClick={() => handleDrill(q, node.id)}
                          disabled={loading || i !== nodes.length - 1}
                          title={i !== nodes.length - 1 ? '最新ノードからのみ掘れます' : ''}
                          style={{
                            ...serif, fontSize: 13, lineHeight: 1.7, textAlign: 'left',
                            padding: '10px 14px', borderRadius: 6,
                            border: `1px solid ${i === nodes.length - 1 ? accent + '40' : '#e5e7eb'}`,
                            background: i === nodes.length - 1 ? `${accent}08` : '#fafafa',
                            color: i === nodes.length - 1 ? '#1a1a1a' : '#9ca3af',
                            cursor: (loading || i !== nodes.length - 1) ? 'not-allowed' : 'pointer',
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => {
                            if (i === nodes.length - 1 && !loading) {
                              e.currentTarget.style.background = `${accent}15`;
                              e.currentTarget.style.borderColor = accent;
                            }
                          }}
                          onMouseLeave={e => {
                            if (i === nodes.length - 1 && !loading) {
                              e.currentTarget.style.background = `${accent}08`;
                              e.currentTarget.style.borderColor = accent + '40';
                            }
                          }}
                        >
                          <span style={{ ...mono, fontSize: 9, color: accent, marginRight: 8, letterSpacing: '0.1em' }}>
                            Q{qi + 1} ↓
                          </span>
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div ref={chainEndRef} />

            {loading && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ ...mono, fontSize: 10, letterSpacing: '0.16em', color: accent }}>
                  // 仮説を精錬中...
                </div>
                <PersonaLoading />
              </div>
            )}

            {error && (
              <div style={{
                ...mono, fontSize: 11, color: '#dc2626', padding: '10px 14px',
                background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6,
                marginTop: 12,
              }}>
                // エラー: {error}
              </div>
            )}

            {/* 自由入力で掘る */}
            {!loading && nodes.length > 0 && (
              <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #e5e7eb' }}>
                <div style={{ ...mono, fontSize: 9, color: '#9ca3af', letterSpacing: '0.12em', marginBottom: 8 }}>
                  // 自由に問いを追加
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleCustomDrill(); }}
                    placeholder="自分の角度で次の問いを書く"
                    rows={2}
                    style={{
                      flex: 1, ...serif, fontSize: 13, lineHeight: 1.7,
                      background: '#f8f9fa', border: '1px solid #d1d5db', borderRadius: 6,
                      padding: 10, outline: 'none', color: '#1a1a1a',
                      resize: 'none', boxSizing: 'border-box',
                    }}
                  />
                  <button
                    onClick={handleCustomDrill}
                    disabled={!input.trim()}
                    style={{
                      ...mono, fontSize: 10, letterSpacing: '0.1em',
                      background: input.trim() ? accent : '#d1d5db',
                      border: 'none', color: '#fff',
                      padding: '0 18px', borderRadius: 6,
                      cursor: input.trim() ? 'pointer' : 'not-allowed',
                    }}
                  >掘る</button>
                </div>
                {nodes.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                    <button
                      onClick={handleUndo}
                      style={{
                        ...mono, fontSize: 9, letterSpacing: '0.1em',
                        background: 'transparent', border: '1px solid #e5e7eb', color: '#9ca3af',
                        padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                      }}
                    >← 1つ戻す</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
