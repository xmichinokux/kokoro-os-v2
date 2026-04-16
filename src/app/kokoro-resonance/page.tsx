'use client';

import { useState, useCallback, useMemo } from 'react';

const mono = { fontFamily: "'Space Mono', monospace" };

const GENRE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  music:  { bg: '#ede9fe', text: '#7c3aed', border: '#c4b5fd' },
  movie:  { bg: '#dbeafe', text: '#2563eb', border: '#93c5fd' },
  book:   { bg: '#dcfce7', text: '#16a34a', border: '#86efac' },
  manga:  { bg: '#ffedd5', text: '#ea580c', border: '#fdba74' },
  anime:  { bg: '#fce7f3', text: '#db2777', border: '#f9a8d4' },
  game:   { bg: '#fee2e2', text: '#dc2626', border: '#fca5a5' },
  other:  { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' },
};

const GENRE_LABELS: Record<string, string> = {
  music: 'Music', movie: 'Movie', book: 'Book',
  manga: 'Manga', anime: 'Anime', game: 'Game', other: 'Other',
};

type TreeNode = {
  id: string;
  name: string;
  genre: string;
  description: string;
  children: TreeNode[];
};

let nodeCounter = 0;
function assignIds(node: Omit<TreeNode, 'id'> & { id?: string; children?: unknown[] }): TreeNode {
  const id = `node_${++nodeCounter}`;
  return {
    id,
    name: node.name || '',
    genre: node.genre || 'other',
    description: node.description || '',
    children: (node.children || []).map((c) => assignIds(c as Omit<TreeNode, 'id'>)),
  };
}

function addChildrenToNode(tree: TreeNode, targetId: string, children: TreeNode[]): TreeNode {
  if (tree.id === targetId) {
    return { ...tree, children };
  }
  return {
    ...tree,
    children: tree.children.map(c => addChildrenToNode(c, targetId, children)),
  };
}

function findNode(tree: TreeNode, targetId: string): TreeNode | null {
  if (tree.id === targetId) return tree;
  for (const child of tree.children) {
    const found = findNode(child, targetId);
    if (found) return found;
  }
  return null;
}

function getAncestorPath(tree: TreeNode, targetId: string, path: { id: string; name: string }[] = []): { id: string; name: string }[] | null {
  if (tree.id === targetId) return [...path, { id: tree.id, name: tree.name }];
  for (const child of tree.children) {
    const result = getAncestorPath(child, targetId, [...path, { id: tree.id, name: tree.name }]);
    if (result) return result;
  }
  return null;
}

function getNodeDepthInFull(tree: TreeNode, targetId: string, depth: number = 0): number {
  if (tree.id === targetId) return depth;
  for (const child of tree.children) {
    const d = getNodeDepthInFull(child, targetId, depth + 1);
    if (d >= 0) return d;
  }
  return -1;
}

export default function KokoroResonancePage() {
  const [keyword, setKeyword] = useState('');
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandingId, setExpandingId] = useState<string | null>(null);
  const [hasAestheticMap, setHasAestheticMap] = useState(false);

  // Navigation: viewStack holds node IDs, viewIndex is current position
  const [viewStack, setViewStack] = useState<string[]>([]);
  const [viewIndex, setViewIndex] = useState(0);

  const currentViewId = viewStack[viewIndex] || null;
  const displayTree = useMemo(() => {
    if (!tree) return null;
    if (!currentViewId) return tree;
    return findNode(tree, currentViewId) || tree;
  }, [tree, currentViewId]);

  const breadcrumb = useMemo(() => {
    if (!tree || !currentViewId) return null;
    return getAncestorPath(tree, currentViewId);
  }, [tree, currentViewId]);

  const canGoBack = viewIndex > 0;
  const canGoForward = viewIndex < viewStack.length - 1;

  const handleGenerate = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw) return;

    setLoading(true);
    setError('');
    setTree(null);
    setViewStack([]);
    setViewIndex(0);
    nodeCounter = 0;

    try {
      const res = await fetch('/api/kokoro-resonance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw, mode: 'generate' }),
        signal: AbortSignal.timeout(60000),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.tree) throw new Error('ツリーデータが取得できませんでした');

      if (data.hasAestheticMap) setHasAestheticMap(true);
      const newTree = assignIds(data.tree);
      setTree(newTree);
      setViewStack([newTree.id]);
      setViewIndex(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  // Drill into a node: if leaf, fetch children first then navigate; if has children, just navigate
  const handleDrillDown = useCallback(async (nodeId: string, nodeName: string) => {
    if (!tree || expandingId) return;

    const targetNode = findNode(tree, nodeId);
    if (!targetNode) return;

    if (targetNode.children.length > 0) {
      // Has children already (cached) → just navigate
      setViewStack(prev => [...prev.slice(0, viewIndex + 1), nodeId]);
      setViewIndex(prev => prev + 1);
      return;
    }

    // Leaf node → fetch children, then navigate
    const depth = getNodeDepthInFull(tree, nodeId);
    if (depth >= 8) {
      alert('これ以上掘り下げられません（最大深度）');
      return;
    }

    const path = getAncestorPath(tree, nodeId);
    const parentContext = path ? path.map(p => p.name).join(' → ') : nodeName;

    setExpandingId(nodeId);
    try {
      const res = await fetch('/api/kokoro-resonance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: nodeName, mode: 'expand', parentContext }),
        signal: AbortSignal.timeout(60000),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const children = (data.children || []).map((c: Omit<TreeNode, 'id'>) => assignIds(c));
      if (children.length > 0) {
        setTree(prev => prev ? addChildrenToNode(prev, nodeId, children) : prev);
        // Navigate into this node
        setViewStack(prev => [...prev.slice(0, viewIndex + 1), nodeId]);
        setViewIndex(prev => prev + 1);
      }
    } catch {
      /* ignore */
    } finally {
      setExpandingId(null);
    }
  }, [tree, expandingId, viewIndex]);

  const handleGoBack = () => {
    if (canGoBack) setViewIndex(prev => prev - 1);
  };

  const handleGoForward = () => {
    if (canGoForward) setViewIndex(prev => prev + 1);
  };

  const handleNavigateTo = (nodeId: string) => {
    const idx = viewStack.indexOf(nodeId);
    if (idx >= 0) {
      setViewIndex(idx);
    }
  };

  const handleReset = () => {
    setTree(null);
    setKeyword('');
    setError('');
    setViewStack([]);
    setViewIndex(0);
    nodeCounter = 0;
  };

  const isAtRoot = !currentViewId || (tree && currentViewId === tree.id);

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#374151' }}>

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
          }}>🎵</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: '#7c3aed' }}>Resonance</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>
              カルチャーのファミリーツリーを探索する
            </span>
          </div>
          {hasAestheticMap && (
            <span style={{ ...mono, fontSize: 8, color: '#059669', letterSpacing: '0.1em' }}>
              ✦ 感性マップ連動中
            </span>
          )}
        </div>
        {tree && (
          <button onClick={handleReset} title="リセット"
            style={{
              ...mono, fontSize: 9, letterSpacing: '.1em',
              color: '#9ca3af', background: 'transparent',
              border: '1px solid #e5e7eb', borderRadius: 4,
              padding: '6px 12px', cursor: 'pointer',
            }}>
            Reset
          </button>
        )}
      </header>

      <div style={{ maxWidth: '100%', margin: '0 auto', padding: '36px 28px 120px' }}>

        {/* 入力エリア */}
        {!tree && (
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <div style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', marginBottom: 8 }}>
              // キーワードを入力
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="text"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleGenerate(); }}
                placeholder="例: Hatebreed / AKIRA / プラトーン / リアルスクリーモ"
                disabled={loading}
                style={{
                  flex: 1, padding: '12px 16px', fontSize: 15,
                  border: '1px solid #e5e7eb', borderRadius: 6,
                  outline: 'none', color: '#1a1a1a',
                  fontFamily: "'Noto Serif JP', serif",
                }}
              />
              <button
                onClick={handleGenerate}
                disabled={!keyword.trim() || loading}
                title="ツリーを生成"
                style={{
                  ...mono, fontSize: 11, letterSpacing: '.1em',
                  padding: '12px 24px', borderRadius: 6, border: 'none',
                  background: !keyword.trim() || loading ? '#e5e7eb' : '#7c3aed',
                  color: !keyword.trim() || loading ? '#9ca3af' : '#fff',
                  cursor: !keyword.trim() || loading ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {loading ? '生成中...' : 'Resonate'}
              </button>
            </div>

            {loading && (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{ ...mono, fontSize: 11, color: '#7c3aed', letterSpacing: '.12em', marginBottom: 8 }}>
                  // ツリーを生成中...
                </div>
                <div style={{ fontSize: 13, color: '#9ca3af', fontFamily: "'Noto Serif JP', serif" }}>
                  「{keyword}」から共鳴するカルチャーを探しています
                </div>
              </div>
            )}

            {error && (
              <div style={{
                ...mono, fontSize: 10, color: '#ef4444', marginTop: 16,
                padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6,
              }}>
                // エラー: {error}
              </div>
            )}

            {!loading && !error && (
              <div style={{ marginTop: 40, padding: '20px 24px', background: '#f9fafb', borderRadius: 8, border: '1px solid #f3f4f6' }}>
                <div style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', marginBottom: 12 }}>
                  // 使い方
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', fontFamily: "'Noto Serif JP', serif", lineHeight: 2 }}>
                  バンド名、映画タイトル、漫画タイトル、ジャンル名など何でも入力できます。<br />
                  入力したキーワードを起点にファミリーツリー形式でおすすめが広がります。<br />
                  どのノードでもクリックして掘り下げることができます。戻る・進むで履歴を移動できます。
                </div>
              </div>
            )}
          </div>
        )}

        {/* ツリー表示 */}
        {tree && displayTree && (
          <>
            {/* ナビゲーションバー */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
              maxWidth: 680, margin: '0 auto 20px',
            }}>
              {/* 戻る / 進む */}
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={handleGoBack}
                  disabled={!canGoBack}
                  title="戻る"
                  style={{
                    ...mono, fontSize: 11, padding: '6px 10px', borderRadius: 4,
                    border: '1px solid #e5e7eb', background: canGoBack ? '#fff' : '#f9fafb',
                    color: canGoBack ? '#7c3aed' : '#d1d5db',
                    cursor: canGoBack ? 'pointer' : 'not-allowed',
                  }}
                >
                  ← 戻る
                </button>
                <button
                  onClick={handleGoForward}
                  disabled={!canGoForward}
                  title="進む"
                  style={{
                    ...mono, fontSize: 11, padding: '6px 10px', borderRadius: 4,
                    border: '1px solid #e5e7eb', background: canGoForward ? '#fff' : '#f9fafb',
                    color: canGoForward ? '#7c3aed' : '#d1d5db',
                    cursor: canGoForward ? 'pointer' : 'not-allowed',
                  }}
                >
                  進む →
                </button>
              </div>

              {/* パンくずリスト */}
              {breadcrumb && breadcrumb.length > 1 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
                  flex: 1, overflow: 'hidden',
                }}>
                  {breadcrumb.map((item, i) => (
                    <span key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {i > 0 && <span style={{ ...mono, fontSize: 9, color: '#d1d5db' }}>→</span>}
                      <button
                        onClick={() => handleNavigateTo(item.id)}
                        style={{
                          ...mono, fontSize: 9,
                          color: i === breadcrumb.length - 1 ? '#7c3aed' : '#9ca3af',
                          fontWeight: i === breadcrumb.length - 1 ? 600 : 400,
                          background: 'transparent', border: 'none',
                          cursor: 'pointer', padding: '2px 4px',
                          whiteSpace: 'nowrap', maxWidth: 120,
                          overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                      >
                        {item.name}
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {!isAtRoot && (
                <button
                  onClick={() => { if (tree) { setViewStack([tree.id]); setViewIndex(0); } }}
                  title="ルートに戻る"
                  style={{
                    ...mono, fontSize: 8, letterSpacing: '.08em',
                    color: '#9ca3af', background: 'transparent',
                    border: '1px solid #e5e7eb', borderRadius: 4,
                    padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  🌳 全体
                </button>
              )}
            </div>

            {/* ツリー本体 */}
            <div style={{ overflowX: 'auto', paddingBottom: 40 }}>
              <div style={{ display: 'inline-block', minWidth: '100%' }}>
                <TreeNodeView
                  node={displayTree}
                  isRoot
                  expandingId={expandingId}
                  onDrillDown={handleDrillDown}
                  currentViewId={currentViewId}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Tree Node Component ─── */
function TreeNodeView({
  node, isRoot, expandingId, onDrillDown, currentViewId,
}: {
  node: TreeNode;
  isRoot?: boolean;
  expandingId: string | null;
  onDrillDown: (nodeId: string, nodeName: string) => void;
  currentViewId: string | null;
}) {
  const genre = GENRE_COLORS[node.genre] || GENRE_COLORS.other;
  const isLeaf = node.children.length === 0;
  const isExpanding = expandingId === node.id;
  const lineColor = '#d1d5db';
  const isCurrentRoot = node.id === currentViewId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

      {/* Node card */}
      <div
        onClick={!isExpanding && !isCurrentRoot ? () => onDrillDown(node.id, node.name) : undefined}
        style={{
          padding: isRoot ? '14px 20px' : '10px 16px',
          border: `1px solid ${genre.border}`,
          borderRadius: 8,
          background: isRoot ? genre.bg : '#fff',
          minWidth: isRoot ? 180 : 130,
          maxWidth: 200,
          textAlign: 'center',
          cursor: !isExpanding && !isCurrentRoot ? 'pointer' : 'default',
          transition: 'box-shadow 0.15s',
          boxShadow: isRoot ? `0 2px 8px ${genre.text}18` : 'none',
          position: 'relative',
        }}
      >
        {/* Genre badge */}
        <div style={{
          ...mono, fontSize: 7, letterSpacing: '.1em',
          color: genre.text, background: genre.bg,
          border: `1px solid ${genre.border}`,
          padding: '1px 6px', borderRadius: 8,
          display: 'inline-block', marginBottom: 6,
        }}>
          {GENRE_LABELS[node.genre] || node.genre}
        </div>

        {/* Name */}
        <div style={{
          fontSize: isRoot ? 15 : 13,
          fontWeight: isRoot ? 700 : 600,
          color: '#1a1a1a',
          fontFamily: "'Noto Serif JP', serif",
          lineHeight: 1.4,
          marginBottom: 4,
          wordBreak: 'break-word',
        }}>
          {node.name}
        </div>

        {/* Description */}
        {node.description && (
          <div style={{
            fontSize: 10, color: '#9ca3af',
            fontFamily: "'Noto Serif JP', serif",
            lineHeight: 1.4,
          }}>
            {node.description}
          </div>
        )}

        {/* Drill-down indicator */}
        {!isCurrentRoot && !isExpanding && (
          <div style={{
            ...mono, fontSize: 8, color: '#7c3aed',
            marginTop: 6, letterSpacing: '.08em',
          }}>
            {isLeaf ? '+ 掘り下げる' : '→ 掘り下げる'}
          </div>
        )}

        {isExpanding && (
          <div style={{
            ...mono, fontSize: 8, color: '#7c3aed',
            marginTop: 6, letterSpacing: '.08em',
          }}>
            ⟳ 探索中...
          </div>
        )}
      </div>

      {/* Children */}
      {node.children.length > 0 && (
        <>
          <div style={{ width: 2, height: 28, background: lineColor }} />

          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            {node.children.map((child, i) => (
              <div
                key={child.id}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  position: 'relative', padding: '0 16px',
                }}
              >
                {node.children.length > 1 && (
                  <div style={{
                    position: 'absolute', top: 0,
                    left: i === 0 ? '50%' : 0,
                    right: i === node.children.length - 1 ? '50%' : 0,
                    height: 2, background: lineColor,
                  }} />
                )}

                <div style={{ width: 2, height: 28, background: lineColor }} />

                <TreeNodeView
                  node={child}
                  expandingId={expandingId}
                  onDrillDown={onDrillDown}
                  currentViewId={currentViewId}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
