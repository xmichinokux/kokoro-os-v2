'use client';

import { useState, useCallback } from 'react';

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

function getNodeDepth(tree: TreeNode, targetId: string, depth: number = 0): number {
  if (tree.id === targetId) return depth;
  for (const child of tree.children) {
    const d = getNodeDepth(child, targetId, depth + 1);
    if (d >= 0) return d;
  }
  return -1;
}

function getAncestorPath(tree: TreeNode, targetId: string, path: string[] = []): string[] | null {
  if (tree.id === targetId) return [...path, tree.name];
  for (const child of tree.children) {
    const result = getAncestorPath(child, targetId, [...path, tree.name]);
    if (result) return result;
  }
  return null;
}

export default function KokoroResonancePage() {
  const [keyword, setKeyword] = useState('');
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandingId, setExpandingId] = useState<string | null>(null);
  const [hasAestheticMap, setHasAestheticMap] = useState(false);

  const handleGenerate = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw) return;

    setLoading(true);
    setError('');
    setTree(null);
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
      setTree(assignIds(data.tree));
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  const handleExpand = useCallback(async (nodeId: string, nodeName: string) => {
    if (!tree || expandingId) return;

    const depth = getNodeDepth(tree, nodeId);
    if (depth >= 6) {
      alert('これ以上掘り下げられません（最大6段）');
      return;
    }

    const path = getAncestorPath(tree, nodeId);
    const parentContext = path ? path.join(' → ') : nodeName;

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
      }
    } catch {
      /* ignore */
    } finally {
      setExpandingId(null);
    }
  }, [tree, expandingId]);

  const handleReset = () => {
    setTree(null);
    setKeyword('');
    setError('');
    nodeCounter = 0;
  };

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

            {/* 使い方ヒント */}
            {!loading && !error && (
              <div style={{ marginTop: 40, padding: '20px 24px', background: '#f9fafb', borderRadius: 8, border: '1px solid #f3f4f6' }}>
                <div style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', marginBottom: 12 }}>
                  // 使い方
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', fontFamily: "'Noto Serif JP', serif", lineHeight: 2 }}>
                  バンド名、映画タイトル、漫画タイトル、ジャンル名など何でも入力できます。<br />
                  入力したキーワードを起点にファミリーツリー形式でおすすめが広がります。<br />
                  葉ノードをクリックするとさらに掘り下げることができます。
                </div>
              </div>
            )}
          </div>
        )}

        {/* ツリー表示 */}
        {tree && (
          <div style={{ overflowX: 'auto', paddingBottom: 40 }}>
            <div style={{ display: 'inline-block', minWidth: '100%' }}>
              <TreeNodeView
                node={tree}
                isRoot
                expandingId={expandingId}
                onExpand={handleExpand}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Tree Node Component ─── */
function TreeNodeView({
  node, isRoot, expandingId, onExpand,
}: {
  node: TreeNode;
  isRoot?: boolean;
  expandingId: string | null;
  onExpand: (nodeId: string, nodeName: string) => void;
}) {
  const genre = GENRE_COLORS[node.genre] || GENRE_COLORS.other;
  const isLeaf = node.children.length === 0;
  const isExpanding = expandingId === node.id;
  const lineColor = '#d1d5db';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

      {/* Node card */}
      <div
        onClick={isLeaf && !isExpanding ? () => onExpand(node.id, node.name) : undefined}
        style={{
          padding: isRoot ? '14px 20px' : '10px 16px',
          border: `1px solid ${genre.border}`,
          borderRadius: 8,
          background: isRoot ? genre.bg : '#fff',
          minWidth: isRoot ? 180 : 130,
          maxWidth: 200,
          textAlign: 'center',
          cursor: isLeaf && !isExpanding ? 'pointer' : 'default',
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

        {/* Expand indicator for leaves */}
        {isLeaf && !isExpanding && (
          <div style={{
            ...mono, fontSize: 8, color: '#7c3aed',
            marginTop: 6, letterSpacing: '.08em',
          }}>
            + 掘り下げる
          </div>
        )}

        {/* Expanding spinner */}
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
          {/* Vertical line from parent to connector */}
          <div style={{ width: 2, height: 28, background: lineColor }} />

          {/* Children row */}
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            {node.children.map((child, i) => (
              <div
                key={child.id}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  position: 'relative', padding: '0 16px',
                }}
              >
                {/* Horizontal connector */}
                {node.children.length > 1 && (
                  <div style={{
                    position: 'absolute', top: 0,
                    left: i === 0 ? '50%' : 0,
                    right: i === node.children.length - 1 ? '50%' : 0,
                    height: 2, background: lineColor,
                  }} />
                )}

                {/* Vertical line from connector to child */}
                <div style={{ width: 2, height: 28, background: lineColor }} />

                {/* Recursive child */}
                <TreeNodeView
                  node={child}
                  expandingId={expandingId}
                  onExpand={onExpand}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
