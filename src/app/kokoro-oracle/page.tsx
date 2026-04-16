'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import PersonaLoading from '@/components/PersonaLoading';
import { supabase } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/supabase/auth';

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
  id: string | null;
  rootQuestion: string;
  nodes: OracleNode[];
  model: 'haiku' | 'sonnet';
};

type SavedSession = {
  id: string;
  title: string;
  updatedAt: string;
  nodeCount: number;
};

const STORAGE_KEY = 'kokoro_oracle_session_v2';
const ORACLE_SOURCE = 'oracle';

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

function getAncestorChain(nodes: OracleNode[], parentId: string | null): OracleNode[] {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const chain: OracleNode[] = [];
  let cur = parentId ? byId.get(parentId) : undefined;
  while (cur) {
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}

function computeDepth(nodes: OracleNode[], node: OracleNode): number {
  const byId = new Map(nodes.map(n => [n.id, n]));
  let depth = 0;
  let cur: OracleNode | undefined = node;
  while (cur && cur.parentId) {
    depth++;
    cur = byId.get(cur.parentId);
    if (depth > 50) break;
  }
  return depth;
}

export default function KokoroOraclePage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [rootQuestion, setRootQuestion] = useState('');
  const [nodes, setNodes] = useState<OracleNode[]>([]);
  const [model, setModel] = useState<'haiku' | 'sonnet'>('haiku');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const [drillFromId, setDrillFromId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const chainEndRef = useRef<HTMLDivElement>(null);

  // localStorageから復元
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as OracleSession;
      if (parsed.rootQuestion && Array.isArray(parsed.nodes)) {
        setSessionId(parsed.id ?? null);
        setRootQuestion(parsed.rootQuestion);
        setNodes(parsed.nodes);
        if (parsed.model === 'sonnet' || parsed.model === 'haiku') setModel(parsed.model);
      }
    } catch { /* ignore */ }
  }, []);

  // 保存（localStorage）
  useEffect(() => {
    if (nodes.length === 0 && !rootQuestion) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    try {
      const session: OracleSession = { id: sessionId, rootQuestion, nodes, model };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch { /* ignore */ }
  }, [sessionId, rootQuestion, nodes, model]);

  // 過去セッション一覧を取得
  const loadSavedSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const userId = await getCurrentUserId();
      if (!userId) return;
      const { data, error: e } = await supabase
        .from('notes')
        .select('id, title, updated_at, text')
        .eq('user_id', userId)
        .eq('source', ORACLE_SOURCE)
        .order('updated_at', { ascending: false })
        .limit(10);
      if (e) return;
      const list: SavedSession[] = (data || []).map(r => {
        let nodeCount = 0;
        try {
          const parsed = JSON.parse(r.text);
          if (Array.isArray(parsed.nodes)) nodeCount = parsed.nodes.length;
        } catch { /* ignore */ }
        return { id: r.id, title: r.title, updatedAt: r.updated_at, nodeCount };
      });
      setSavedSessions(list);
    } catch { /* ignore */ } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => { loadSavedSessions(); }, [loadSavedSessions]);

  // 最新ノードへスクロール
  useEffect(() => {
    if (nodes.length === 0) return;
    chainEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [nodes.length]);

  const callOracle = useCallback(async (question: string, parentId: string | null) => {
    setLoading(true);
    setError('');
    try {
      const ancestors = getAncestorChain(nodes, parentId);
      const context = ancestors.map(n => ({
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
      setSavedAt(null); // dirty
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [nodes, model]);

  const handleStart = useCallback(async () => {
    const q = input.trim();
    if (!q || loading) return;
    setSessionId(null);
    setSavedAt(null);
    setRootQuestion(q);
    setNodes([]);
    setInput('');
    await callOracle(q, null);
  }, [input, loading, callOracle]);

  const handleDrill = useCallback(async (question: string, parentId: string) => {
    if (loading) return;
    setDrillFromId(null);
    await callOracle(question, parentId);
  }, [loading, callOracle]);

  const handleCustomDrill = useCallback(async () => {
    const q = input.trim();
    if (!q || loading) return;
    const parentId = drillFromId ?? (nodes.length > 0 ? nodes[nodes.length - 1].id : null);
    setInput('');
    setDrillFromId(null);
    await callOracle(q, parentId);
  }, [input, loading, nodes, drillFromId, callOracle]);

  const handleReset = useCallback(() => {
    if (!window.confirm('探索をすべて初期化します。保存済みセッションは残ります。')) return;
    setSessionId(null);
    setRootQuestion('');
    setNodes([]);
    setInput('');
    setError('');
    setSavedAt(null);
    setDrillFromId(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    loadSavedSessions();
  }, [loadSavedSessions]);

  const handleUndo = useCallback(() => {
    setNodes(prev => prev.slice(0, -1));
    setError('');
    setSavedAt(null);
  }, []);

  // Supabaseに保存
  const handleSave = useCallback(async () => {
    if (nodes.length === 0) return;
    setSaving(true);
    setError('');
    try {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('ログインが必要です');
      const now = new Date().toISOString();
      const payload: Omit<OracleSession, 'id'> = { rootQuestion, nodes, model };
      const text = JSON.stringify(payload);
      const title = (rootQuestion || 'Oracle session').slice(0, 100);
      if (sessionId) {
        const { error: e } = await supabase
          .from('notes')
          .update({ title, text, tags: ['oracle'], updated_at: now })
          .eq('id', sessionId);
        if (e) throw new Error(e.message);
      } else {
        const newId = crypto.randomUUID();
        const { error: e } = await supabase.from('notes').insert({
          id: newId, user_id: userId, title, text,
          source: ORACLE_SOURCE, tags: ['oracle'],
          is_public: false, created_at: now, updated_at: now,
        });
        if (e) throw new Error(e.message);
        setSessionId(newId);
      }
      setSavedAt(now);
      loadSavedSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存エラー');
    } finally {
      setSaving(false);
    }
  }, [nodes, rootQuestion, model, sessionId, loadSavedSessions]);

  const handleLoadSession = useCallback(async (id: string) => {
    setLoading(true);
    setError('');
    try {
      const { data, error: e } = await supabase
        .from('notes')
        .select('id, title, text, updated_at')
        .eq('id', id)
        .single();
      if (e || !data) throw new Error(e?.message || 'セッションが見つかりません');
      const parsed = JSON.parse(data.text) as OracleSession;
      setSessionId(data.id);
      setRootQuestion(parsed.rootQuestion || data.title);
      setNodes(Array.isArray(parsed.nodes) ? parsed.nodes : []);
      setModel(parsed.model === 'sonnet' ? 'sonnet' : 'haiku');
      setSavedAt(data.updated_at);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ロードエラー');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDeleteSession = useCallback(async (id: string) => {
    if (!window.confirm('この保存済み探索を削除しますか？')) return;
    try {
      const { error: e } = await supabase.from('notes').delete().eq('id', id);
      if (e) throw new Error(e.message);
      if (sessionId === id) setSessionId(null);
      loadSavedSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除エラー');
    }
  }, [sessionId, loadSavedSessions]);

  const started = rootQuestion !== '' && nodes.length > 0;
  const dirty = nodes.length > 0 && !savedAt;

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#1a1a1a' }}>
      {/* Header */}
      <header style={{
        padding: '14px 28px', borderBottom: '1px solid #e5e7eb',
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 10,
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
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
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
            <>
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                title={!dirty ? '変更なし' : '保存'}
                style={{
                  ...mono, fontSize: 9, letterSpacing: '0.1em',
                  background: dirty ? accent : '#f3f4f6',
                  border: 'none', color: dirty ? '#fff' : '#9ca3af',
                  padding: '6px 12px', borderRadius: 4,
                  cursor: (saving || !dirty) ? 'default' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >{saving ? '保存中...' : dirty ? '💾 保存' : '✓ 保存済'}</button>
              <button onClick={handleReset} style={{
                ...mono, fontSize: 9, letterSpacing: '0.1em',
                background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
                padding: '6px 12px', borderRadius: 4, cursor: 'pointer',
              }}>初期化</button>
            </>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 780, margin: '0 auto', padding: '32px 24px 140px' }}>
        {/* 最初の問いがまだ → 入力画面 */}
        {!started && (
          <div>
            <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: accent, marginBottom: 12, textTransform: 'uppercase' }}>
              // ORACLE — 大きな問いを投げてください
            </div>
            <p style={{ ...serif, fontSize: 14, color: '#6b7280', lineHeight: 1.9, marginBottom: 24 }}>
              問いを投げると、仮説・根拠・見積もり・次に掘るべき3つの問いが返ってきます。<br />
              そこから任意の問いを選んで掘り進める、を繰り返して仮説を精錬します。
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

            {error && (
              <div style={{
                ...mono, fontSize: 11, color: '#dc2626', padding: '10px 14px',
                background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6,
                marginTop: 12,
              }}>
                // エラー: {error}
                {error.includes('ログイン') && (
                  <div style={{ marginTop: 6 }}>
                    <Link href="/auth" style={{ color: accent, textDecoration: 'underline', fontSize: 10 }}>
                      → ログインページへ
                    </Link>
                  </div>
                )}
              </div>
            )}

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

            {/* 過去の探索 */}
            {savedSessions.length > 0 && (
              <div style={{ marginTop: 36, borderTop: '1px solid #e5e7eb', paddingTop: 24 }}>
                <div style={{ ...mono, fontSize: 9, color: '#9ca3af', letterSpacing: '0.12em', marginBottom: 12 }}>
                  // 過去の探索（{savedSessions.length}）
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {savedSessions.map(s => (
                    <div key={s.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', border: '1px solid #e5e7eb',
                      borderRadius: 6, background: '#ffffff',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ ...serif, fontSize: 13, color: '#1a1a1a', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.title}
                        </div>
                        <div style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '0.1em' }}>
                          {s.nodeCount} nodes · {new Date(s.updatedAt).toLocaleDateString('ja-JP')}
                        </div>
                      </div>
                      <button
                        onClick={() => handleLoadSession(s.id)}
                        disabled={loading}
                        style={{
                          ...mono, fontSize: 9, letterSpacing: '0.1em',
                          background: accent, border: 'none', color: '#fff',
                          padding: '6px 12px', borderRadius: 3,
                          cursor: loading ? 'wait' : 'pointer',
                        }}
                      >開く</button>
                      <button
                        onClick={() => handleDeleteSession(s.id)}
                        style={{
                          ...mono, fontSize: 9, letterSpacing: '0.1em',
                          background: 'transparent', border: '1px solid #fca5a5', color: '#ef4444',
                          padding: '5px 10px', borderRadius: 3, cursor: 'pointer',
                        }}
                      >削除</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {loadingSessions && savedSessions.length === 0 && (
              <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginTop: 24, textAlign: 'center' }}>
                保存済みを確認中...
              </div>
            )}
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

            {nodes.map((node, i) => {
              const depth = computeDepth(nodes, node);
              const indent = Math.min(depth, 4) * 20;
              const parent = node.parentId ? nodes.find(n => n.id === node.parentId) : null;
              return (
                <div key={node.id} style={{ marginBottom: 22, marginLeft: indent }}>
                  {i > 0 && (
                    <div style={{ ...mono, fontSize: 9, color: '#9ca3af', letterSpacing: '0.14em', marginBottom: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>↳ DRILL {i}</span>
                      {parent && (
                        <span style={{ color: '#d1d5db', fontSize: 8 }}>
                          from: {parent.question.slice(0, 30)}{parent.question.length > 30 ? '…' : ''}
                        </span>
                      )}
                    </div>
                  )}

                  {i > 0 && (
                    <div style={{
                      ...serif, fontSize: 13, color: '#6b7280', lineHeight: 1.8,
                      padding: '8px 14px', marginBottom: 12,
                      borderLeft: '2px solid #d1d5db',
                    }}>
                      {node.question}
                    </div>
                  )}

                  <div style={{
                    border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden',
                    background: '#ffffff',
                  }}>
                    <div style={{ padding: '16px 18px', borderBottom: '1px solid #f3f4f6', background: '#fafafa' }}>
                      <div style={{ ...mono, fontSize: 8, color: accent, letterSpacing: '0.16em', marginBottom: 6 }}>
                        HYPOTHESIS
                      </div>
                      <div style={{ ...serif, fontSize: 14, lineHeight: 1.9, color: '#1a1a1a', fontWeight: 500 }}>
                        {node.hypothesis}
                      </div>
                    </div>

                    <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ ...mono, fontSize: 8, color: '#6b7280', letterSpacing: '0.16em', marginBottom: 6 }}>
                        REASONING
                      </div>
                      <div style={{ ...serif, fontSize: 13, lineHeight: 1.85, color: '#374151' }}>
                        {node.reasoning}
                      </div>
                    </div>

                    <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ ...mono, fontSize: 8, color: '#6b7280', letterSpacing: '0.16em', marginBottom: 6 }}>
                        ESTIMATE
                      </div>
                      <div style={{ ...serif, fontSize: 13, lineHeight: 1.85, color: '#374151' }}>
                        {node.estimate}
                      </div>
                    </div>

                    <div style={{ padding: '14px 18px' }}>
                      <div style={{ ...mono, fontSize: 8, color: '#6b7280', letterSpacing: '0.16em', marginBottom: 10 }}>
                        NEXT QUESTIONS — クリックで任意の問いから掘り下げ
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {node.nextQuestions.map((q, qi) => (
                          <button
                            key={qi}
                            onClick={() => handleDrill(q, node.id)}
                            disabled={loading}
                            style={{
                              ...serif, fontSize: 13, lineHeight: 1.7, textAlign: 'left',
                              padding: '10px 14px', borderRadius: 6,
                              border: `1px solid ${accent}40`,
                              background: `${accent}08`,
                              color: '#1a1a1a',
                              cursor: loading ? 'not-allowed' : 'pointer',
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => {
                              if (!loading) {
                                e.currentTarget.style.background = `${accent}15`;
                                e.currentTarget.style.borderColor = accent;
                              }
                            }}
                            onMouseLeave={e => {
                              if (!loading) {
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
                      <button
                        onClick={() => setDrillFromId(node.id === drillFromId ? null : node.id)}
                        style={{
                          ...mono, fontSize: 8, letterSpacing: '0.12em', marginTop: 10,
                          background: node.id === drillFromId ? `${accent}15` : 'transparent',
                          border: `1px solid ${node.id === drillFromId ? accent : '#e5e7eb'}`,
                          color: node.id === drillFromId ? accent : '#9ca3af',
                          padding: '5px 10px', borderRadius: 3, cursor: 'pointer',
                        }}
                      >
                        {node.id === drillFromId ? '✓ このノードから自由に掘る' : '+ このノードから自由に掘る'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

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
                  // 自由に問いを追加 — {drillFromId
                    ? '選択されたノードから分岐'
                    : '最新ノードから分岐（各カードの + ボタンで分岐元を選択可）'}
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
