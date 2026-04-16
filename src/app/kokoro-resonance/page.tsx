'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';

const mono = { fontFamily: "'Space Mono', monospace" };

const GENRE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  music:   { bg: '#ede9fe', text: '#7c3aed', border: '#c4b5fd' },
  movie:   { bg: '#dbeafe', text: '#2563eb', border: '#93c5fd' },
  book:    { bg: '#dcfce7', text: '#16a34a', border: '#86efac' },
  manga:   { bg: '#ffedd5', text: '#ea580c', border: '#fdba74' },
  anime:   { bg: '#fce7f3', text: '#db2777', border: '#f9a8d4' },
  game:    { bg: '#fee2e2', text: '#dc2626', border: '#fca5a5' },
  fashion: { bg: '#fdf4ff', text: '#a855f7', border: '#d8b4fe' },
  brand:   { bg: '#f0f9ff', text: '#0284c7', border: '#7dd3fc' },
  food:    { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  art:     { bg: '#fefce8', text: '#a16207', border: '#fde68a' },
  place:   { bg: '#ecfdf5', text: '#047857', border: '#6ee7b7' },
  tech:    { bg: '#f0fdf4', text: '#15803d', border: '#86efac' },
  sports:  { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' },
  other:   { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' },
};

const GENRE_LABELS: Record<string, string> = {
  music: 'Music', movie: 'Movie', book: 'Book', manga: 'Manga',
  anime: 'Anime', game: 'Game', fashion: 'Fashion', brand: 'Brand',
  food: 'Food', art: 'Art', place: 'Place', tech: 'Tech',
  sports: 'Sports', other: 'Other',
};

type TreeNode = {
  id: string;
  name: string;
  genre: string;
  description: string;
  children: TreeNode[];
};

type ViewEntry = { id: string; name: string };
type SavedEntry = { keyword: string; tree: TreeNode; savedAt: string };
type SharedEntry = {
  id: string;
  title: string;
  treeData: TreeNode | null;
  tags: string[];
  authorName: string;
  authorId: string;
  createdAt: string;
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

function collectGenres(node: TreeNode): string[] {
  const genres = new Set<string>();
  function walk(n: TreeNode) {
    if (n.genre && n.genre !== 'other') genres.add(n.genre);
    n.children.forEach(walk);
  }
  walk(node);
  return [...genres];
}

function reassignIds(node: TreeNode): TreeNode {
  const id = `node_${++nodeCounter}`;
  return {
    id,
    name: node.name || '',
    genre: node.genre || 'other',
    description: node.description || '',
    children: (node.children || []).map(c => reassignIds(c)),
  };
}

const HISTORY_KEY = 'kokoroResonanceHistory';

export default function KokoroResonancePage() {
  const [keyword, setKeyword] = useState('');
  const [rootTree, setRootTree] = useState<TreeNode | null>(null);
  const [expandedTrees, setExpandedTrees] = useState<Record<string, TreeNode>>({});
  const [viewStack, setViewStack] = useState<ViewEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandingId, setExpandingId] = useState<string | null>(null);
  const [hasAestheticMap, setHasAestheticMap] = useState(false);
  const [savedTrees, setSavedTrees] = useState<SavedEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [sharedTrees, setSharedTrees] = useState<SharedEntry[]>([]);
  const [showShared, setShowShared] = useState(false);
  const [sharing, setSharing] = useState(false);

  const displayTree = useMemo(() => {
    if (!rootTree || viewStack.length === 0) return rootTree;
    const current = viewStack[viewStack.length - 1];
    if (current.id === rootTree.id) return rootTree;
    return expandedTrees[current.id] || rootTree;
  }, [rootTree, viewStack, expandedTrees]);

  const canGoBack = viewStack.length > 1;
  const isAtRoot = viewStack.length <= 1;

  // ─── History persistence ───
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setSavedTrees(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const saveTreesToStorage = useCallback((trees: SavedEntry[]) => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trees));
    setSavedTrees(trees);
  }, []);

  // ─── Generate ───
  const handleGenerate = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw) return;

    setLoading(true);
    setError('');
    setRootTree(null);
    setExpandedTrees({});
    setViewStack([]);
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
      setRootTree(newTree);
      setViewStack([{ id: newTree.id, name: newTree.name }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  // ─── Drill down (folder-style) ───
  const handleDrillDown = useCallback(async (node: TreeNode) => {
    if (expandingId) return;

    if (expandedTrees[node.id]) {
      setViewStack(prev => [...prev, { id: node.id, name: node.name }]);
      return;
    }

    const parentContext = viewStack.map(v => v.name).join(' → ');

    setExpandingId(node.id);
    try {
      const res = await fetch('/api/kokoro-resonance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: node.name,
          mode: 'expand',
          parentContext: parentContext ? `${parentContext} → ${node.name}` : node.name,
        }),
        signal: AbortSignal.timeout(60000),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const children = (data.children || []).map((c: Omit<TreeNode, 'id'>) => assignIds(c));
      if (children.length > 0) {
        const newRoot: TreeNode = {
          id: node.id,
          name: node.name,
          genre: node.genre,
          description: node.description,
          children,
        };
        setExpandedTrees(prev => ({ ...prev, [node.id]: newRoot }));
        setViewStack(prev => [...prev, { id: node.id, name: node.name }]);
      }
    } catch {
      /* ignore */
    } finally {
      setExpandingId(null);
    }
  }, [expandingId, expandedTrees, viewStack]);

  // ─── Navigation ───
  const handleGoBack = useCallback(() => {
    if (viewStack.length > 1) {
      setViewStack(prev => prev.slice(0, -1));
    }
  }, [viewStack.length]);

  const handleGoToRoot = useCallback(() => {
    if (rootTree) {
      setViewStack([{ id: rootTree.id, name: rootTree.name }]);
    }
  }, [rootTree]);

  const handleNavigateTo = useCallback((index: number) => {
    setViewStack(prev => prev.slice(0, index + 1));
  }, []);

  // ─── Reset ───
  const handleReset = useCallback(() => {
    setRootTree(null);
    setExpandedTrees({});
    setKeyword('');
    setError('');
    setViewStack([]);
    nodeCounter = 0;
  }, []);

  // ─── Save / Load / Delete ───
  const handleSave = useCallback(() => {
    if (!rootTree || !keyword.trim()) return;
    const entry: SavedEntry = { keyword: keyword.trim(), tree: rootTree, savedAt: new Date().toISOString() };
    const existing = savedTrees.filter(s => s.keyword !== entry.keyword);
    const updated = [entry, ...existing].slice(0, 30);
    saveTreesToStorage(updated);
  }, [rootTree, keyword, savedTrees, saveTreesToStorage]);

  const handleLoadSaved = useCallback((entry: SavedEntry) => {
    nodeCounter = 0;
    setRootTree(entry.tree);
    setExpandedTrees({});
    setKeyword(entry.keyword);
    setViewStack([{ id: entry.tree.id, name: entry.tree.name }]);
    setShowHistory(false);
    setError('');
  }, []);

  const handleDeleteSaved = useCallback((kw: string) => {
    saveTreesToStorage(savedTrees.filter(s => s.keyword !== kw));
  }, [savedTrees, saveTreesToStorage]);

  const handleClearAll = useCallback(() => {
    saveTreesToStorage([]);
  }, [saveTreesToStorage]);

  // ─── Share to DB (public Note) ───
  const handleShare = useCallback(async () => {
    if (!rootTree || !keyword.trim() || sharing) return;
    setSharing(true);
    try {
      const genreTags = collectGenres(rootTree);
      const res = await fetch('/api/kokoro-resonance-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: keyword.trim(),
          treeData: rootTree,
          tags: genreTags,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      alert('Noteに公開しました！他のユーザーが掘り下げを継承できます。');
    } catch (e) {
      alert(e instanceof Error ? e.message : '公開に失敗しました');
    } finally {
      setSharing(false);
    }
  }, [rootTree, keyword, sharing]);

  // ─── Load shared trees ───
  const loadSharedTrees = useCallback(async () => {
    try {
      const res = await fetch('/api/kokoro-resonance-share');
      const data = await res.json();
      if (data.notes) setSharedTrees(data.notes);
    } catch { /* ignore */ }
  }, []);

  const handleLoadShared = useCallback((entry: SharedEntry) => {
    if (!entry.treeData) return;
    nodeCounter = 0;
    const tree = reassignIds(entry.treeData);
    setRootTree(tree);
    setExpandedTrees({});
    setKeyword(entry.title.replace(/^🎵\s*/, ''));
    setViewStack([{ id: tree.id, name: tree.name }]);
    setShowShared(false);
    setError('');
  }, []);

  const hasTree = !!rootTree;

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
              ジャンルを超えたファミリーツリーを探索する
            </span>
          </div>
          {hasAestheticMap && (
            <span style={{ ...mono, fontSize: 8, color: '#059669', letterSpacing: '0.1em' }}>
              ✦ 感性マップ連動中
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!hasTree && (
            <>
              {savedTrees.length > 0 && (
                <button onClick={() => { setShowHistory(!showHistory); setShowShared(false); }} title="履歴"
                  style={{
                    ...mono, fontSize: 9, letterSpacing: '.1em',
                    color: showHistory ? '#7c3aed' : '#9ca3af', background: 'transparent',
                    border: `1px solid ${showHistory ? '#7c3aed' : '#e5e7eb'}`, borderRadius: 4,
                    padding: '6px 12px', cursor: 'pointer',
                  }}>
                  📚 履歴 ({savedTrees.length})
                </button>
              )}
              <button onClick={() => { setShowShared(!showShared); setShowHistory(false); if (!showShared) loadSharedTrees(); }} title="みんなの探索"
                style={{
                  ...mono, fontSize: 9, letterSpacing: '.1em',
                  color: showShared ? '#7c3aed' : '#9ca3af', background: 'transparent',
                  border: `1px solid ${showShared ? '#7c3aed' : '#e5e7eb'}`, borderRadius: 4,
                  padding: '6px 12px', cursor: 'pointer',
                }}>
                🌐 みんなの探索
              </button>
            </>
          )}
          {hasTree && (
            <>
              <button onClick={handleSave} title="ローカル保存"
                style={{
                  ...mono, fontSize: 9, letterSpacing: '.1em',
                  color: '#059669', background: 'transparent',
                  border: '1px solid #bbf7d0', borderRadius: 4,
                  padding: '6px 12px', cursor: 'pointer',
                }}>
                💾 保存
              </button>
              <button onClick={handleShare} disabled={sharing} title="Noteに公開"
                style={{
                  ...mono, fontSize: 9, letterSpacing: '.1em',
                  color: sharing ? '#9ca3af' : '#2563eb', background: 'transparent',
                  border: `1px solid ${sharing ? '#e5e7eb' : '#93c5fd'}`, borderRadius: 4,
                  padding: '6px 12px', cursor: sharing ? 'not-allowed' : 'pointer',
                }}>
                {sharing ? '公開中...' : '🌐 公開'}
              </button>
              <button onClick={handleReset} title="リセット"
                style={{
                  ...mono, fontSize: 9, letterSpacing: '.1em',
                  color: '#9ca3af', background: 'transparent',
                  border: '1px solid #e5e7eb', borderRadius: 4,
                  padding: '6px 12px', cursor: 'pointer',
                }}>
                Reset
              </button>
            </>
          )}
        </div>
      </header>

      <div style={{ maxWidth: '100%', margin: '0 auto', padding: '36px 28px 120px' }}>

        {/* 入力エリア */}
        {!hasTree && (
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
                placeholder="例: Hatebreed / Supreme / AKIRA / Tesla"
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

            {!loading && !error && !showHistory && (
              <div style={{ marginTop: 40, padding: '20px 24px', background: '#f9fafb', borderRadius: 8, border: '1px solid #f3f4f6' }}>
                <div style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', marginBottom: 12 }}>
                  // 使い方
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', fontFamily: "'Noto Serif JP', serif", lineHeight: 2 }}>
                  バンド名、映画、漫画、ファッションブランド、車、何でも入力できます。<br />
                  ジャンルの壁を越えて、ファミリーツリー形式でおすすめが広がります。<br />
                  ノードをクリックするとフォルダに入るように掘り下げ、戻るで階層を上がれます。
                </div>
              </div>
            )}

            {/* 履歴パネル */}
            {showHistory && savedTrees.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af' }}>
                    // 保存した探索 ({savedTrees.length})
                  </div>
                  <button
                    onClick={() => { if (confirm('すべての履歴を削除しますか？')) handleClearAll(); }}
                    style={{
                      ...mono, fontSize: 8, color: '#ef4444', background: 'transparent',
                      border: '1px solid #fecaca', borderRadius: 4, padding: '3px 8px', cursor: 'pointer',
                    }}
                  >
                    すべて削除
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {savedTrees.map(s => (
                    <div key={s.keyword} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px', background: '#fff', border: '1px solid #e5e7eb',
                      borderRadius: 8, cursor: 'pointer', transition: 'border-color 0.15s',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = '#7c3aed')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
                    >
                      <div onClick={() => handleLoadSaved(s)} style={{ flex: 1, cursor: 'pointer' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', fontFamily: "'Noto Serif JP', serif" }}>
                          🎵 {s.keyword}
                        </div>
                        <div style={{ ...mono, fontSize: 8, color: '#9ca3af', marginTop: 4 }}>
                          {new Date(s.savedAt).toLocaleDateString('ja-JP')} {new Date(s.savedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteSaved(s.keyword); }}
                        title="削除"
                        style={{
                          fontSize: 12, color: '#d1d5db', background: 'transparent',
                          border: 'none', cursor: 'pointer', padding: '4px 8px',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* みんなの探索パネル */}
            {showShared && (
              <div style={{ marginTop: 24 }}>
                <div style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', marginBottom: 12 }}>
                  // みんなの探索 — 他のユーザーが公開したツリー
                </div>
                {sharedTrees.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#9ca3af', fontFamily: "'Noto Serif JP', serif", textAlign: 'center', padding: '40px 0' }}>
                    まだ公開された探索がありません
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sharedTrees.map(s => (
                      <div key={s.id}
                        onClick={() => handleLoadShared(s)}
                        style={{
                          padding: '12px 16px', background: '#fff', border: '1px solid #e5e7eb',
                          borderRadius: 8, cursor: 'pointer', transition: 'border-color 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = '#7c3aed')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
                      >
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', fontFamily: "'Noto Serif JP', serif" }}>
                          {s.title}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                          <span style={{ ...mono, fontSize: 8, color: '#9ca3af' }}>
                            by {s.authorName}
                          </span>
                          <span style={{ ...mono, fontSize: 8, color: '#d1d5db' }}>|</span>
                          <span style={{ ...mono, fontSize: 8, color: '#9ca3af' }}>
                            {new Date(s.createdAt).toLocaleDateString('ja-JP')}
                          </span>
                          {s.tags.length > 0 && (
                            <>
                              <span style={{ ...mono, fontSize: 8, color: '#d1d5db' }}>|</span>
                              {s.tags.slice(0, 4).map(t => (
                                <span key={t} style={{
                                  ...mono, fontSize: 7, color: GENRE_COLORS[t]?.text || '#9ca3af',
                                  background: GENRE_COLORS[t]?.bg || '#f3f4f6',
                                  padding: '1px 5px', borderRadius: 4,
                                }}>
                                  {GENRE_LABELS[t] || t}
                                </span>
                              ))}
                            </>
                          )}
                        </div>
                        <div style={{ ...mono, fontSize: 8, color: '#7c3aed', marginTop: 6 }}>
                          📂 掘り下げを継承する →
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ツリー表示 */}
        {hasTree && displayTree && (
          <>
            {/* ナビゲーションバー */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
              maxWidth: 680, margin: '0 auto 20px',
            }}>
              <button
                onClick={handleGoBack}
                disabled={!canGoBack}
                title="戻る（上の階層へ）"
                style={{
                  ...mono, fontSize: 11, padding: '6px 10px', borderRadius: 4,
                  border: '1px solid #e5e7eb', background: canGoBack ? '#fff' : '#f9fafb',
                  color: canGoBack ? '#7c3aed' : '#d1d5db',
                  cursor: canGoBack ? 'pointer' : 'not-allowed',
                }}
              >
                ← 戻る
              </button>

              {/* パンくずリスト（フォルダパス） */}
              {viewStack.length > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
                  flex: 1, overflow: 'hidden',
                }}>
                  {viewStack.map((entry, i) => (
                    <span key={`${entry.id}_${i}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {i > 0 && <span style={{ ...mono, fontSize: 9, color: '#d1d5db' }}>/</span>}
                      <button
                        onClick={() => handleNavigateTo(i)}
                        style={{
                          ...mono, fontSize: 9,
                          color: i === viewStack.length - 1 ? '#7c3aed' : '#9ca3af',
                          fontWeight: i === viewStack.length - 1 ? 600 : 400,
                          background: 'transparent', border: 'none',
                          cursor: 'pointer', padding: '2px 4px',
                          whiteSpace: 'nowrap', maxWidth: 120,
                          overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                      >
                        {entry.name}
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {!isAtRoot && (
                <button
                  onClick={handleGoToRoot}
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
  node, isRoot, expandingId, onDrillDown,
}: {
  node: TreeNode;
  isRoot?: boolean;
  expandingId: string | null;
  onDrillDown: (node: TreeNode) => void;
}) {
  const genre = GENRE_COLORS[node.genre] || GENRE_COLORS.other;
  const isExpanding = expandingId === node.id;
  const lineColor = '#d1d5db';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

      {/* Node card */}
      <div
        onClick={!isExpanding && !isRoot ? () => onDrillDown(node) : undefined}
        style={{
          padding: isRoot ? '14px 20px' : '10px 16px',
          border: `1px solid ${genre.border}`,
          borderRadius: 8,
          background: isRoot ? genre.bg : '#fff',
          minWidth: isRoot ? 180 : 130,
          maxWidth: 200,
          textAlign: 'center',
          cursor: !isExpanding && !isRoot ? 'pointer' : 'default',
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

        {/* Drill-down indicator (not on root) */}
        {!isRoot && !isExpanding && (
          <div style={{
            ...mono, fontSize: 8, color: '#7c3aed',
            marginTop: 6, letterSpacing: '.08em',
          }}>
            📂 掘り下げる
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
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
