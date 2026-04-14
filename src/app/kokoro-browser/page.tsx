'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { GAMESEN_NOTES } from '@/lib/kokoro-browser/gamesenNotes';
import { MOCK_PUBLIC_NOTES } from '@/lib/kokoro-browser/mockPublicNotes';
import { matchNotesToGamesen } from '@/lib/kokoro-browser/matchNotes';
import { getAllNotes } from '@/lib/kokoro/noteStorage';
import type { PublicNote, GamesenNote, ProductNote } from '@/types/browser';

const SOURCE_LABELS: Record<string, string> = {
  talk: 'Talk', zen: 'Zen', emi: 'エミ', manual: '手書き',
};

const CATEGORY_LABELS: Record<string, string> = {
  news: 'News', blog: 'Blog', essay: 'Essay', creative: 'Creative',
  tech: 'Tech', culture: 'Culture', other: 'Other',
};

const SONOTA_ID = 'sonota';

const SONOTA_GAMESEN: GamesenNote = {
  id: SONOTA_ID,
  title: 'その他',
  description: 'どの棚にも入らなかった、でも公開されている記録。',
  keywords: [],
  color: '#9ca3af',
};

const STORAGE_KEY = 'kokoroBrowserCustomGamesen';

type WebResult = {
  id: string;
  title: string;
  url: string;
  snippet: string;
  reason: string;
  category: string;
};

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF', data: 'Data', svg: 'SVG', html: 'HTML', text: 'Text', other: 'Other',
};

type TimelineItem =
  | { type: 'note'; data: PublicNote }
  | { type: 'web'; data: WebResult }
  | { type: 'product'; data: ProductNote };

function loadCustomGamesen(): GamesenNote[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomGamesen(notes: GamesenNote[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export default function KokoroBrowserPage() {
  const router = useRouter();
  const mono = { fontFamily: "'Space Mono', monospace" };

  const [customGamesen, setCustomGamesen] = useState<GamesenNote[]>([]);
  const [selectedId, setSelectedId] = useState<string>(GAMESEN_NOTES[0].id);

  // ゲーセンノート作成フォーム
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [newColor, setNewColor] = useState('#7c3aed');

  // 編集モード
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editKeywords, setEditKeywords] = useState('');

  // Web検索
  const [webResults, setWebResults] = useState<WebResult[]>([]);
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState('');
  const [hasAestheticMap, setHasAestheticMap] = useState(false);
  const searchCacheRef = useRef<Record<string, WebResult[]>>({});
  const lastSearchIdRef = useRef<string>('');

  // 商品
  const [products, setProducts] = useState<ProductNote[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const productCacheRef = useRef<Record<string, ProductNote[]>>({});

  useEffect(() => {
    setCustomGamesen(loadCustomGamesen());
  }, []);

  const allGamesen = useMemo(
    () => [...GAMESEN_NOTES, ...customGamesen],
    [customGamesen]
  );

  const selectedGamesen = useMemo(
    () => allGamesen.find(g => g.id === selectedId) ?? GAMESEN_NOTES[0],
    [selectedId, allGamesen]
  );

  // 公開Noteを取得してPublicNote形式に変換
  const [localPublicNotes, setLocalPublicNotes] = useState<PublicNote[]>([]);
  useEffect(() => {
    getAllNotes().then(all => {
      setLocalPublicNotes(
        all.filter(n => n.isPublic && !n.isProduct).map(n => ({
          id: n.id,
          title: n.title,
          body: n.body,
          tags: n.tags,
          topic: n.topic,
          source: n.source as PublicNote['source'],
          createdAt: n.createdAt,
          isPublic: true as const,
        }))
      );
    });
  }, []);

  const allPublicNotes = useMemo(
    () => [...localPublicNotes, ...MOCK_PUBLIC_NOTES],
    [localPublicNotes]
  );

  const matchedNotes = useMemo(
    () => matchNotesToGamesen(allPublicNotes, selectedGamesen),
    [allPublicNotes, selectedGamesen]
  );

  // どのゲーセンノートにも属さない公開Note
  const sonotaNotes = useMemo(() => {
    return allPublicNotes.filter(note => {
      const belongsToAny = allGamesen.some(g =>
        matchNotesToGamesen([note], g).length > 0
      );
      return !belongsToAny;
    });
  }, [allPublicNotes, allGamesen]);

  const displayedNotes = selectedId === SONOTA_ID ? sonotaNotes : matchedNotes;
  const currentGamesen = selectedId === SONOTA_ID ? SONOTA_GAMESEN : selectedGamesen;

  // ========================
  // Web検索（Gemini Grounding）
  // ========================
  const searchWeb = useCallback(async (keywords: string[], tabId: string) => {
    if (keywords.length === 0) {
      setWebResults([]);
      return;
    }

    // キャッシュチェック
    if (searchCacheRef.current[tabId]) {
      setWebResults(searchCacheRef.current[tabId]);
      return;
    }

    setWebLoading(true);
    setWebError('');
    lastSearchIdRef.current = tabId;

    try {
      const res = await fetch('/api/kokoro-browser-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords }),
        signal: AbortSignal.timeout(30000),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const results: WebResult[] = (data.results || []).map((r: {
        title: string; url: string; snippet: string; reason: string; category: string;
      }, i: number) => ({
        id: `web_${tabId}_${i}`,
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        reason: r.reason,
        category: r.category || 'other',
      }));

      if (data.hasAestheticMap) setHasAestheticMap(true);

      // 現在のタブがまだ選択されていれば結果を表示
      if (lastSearchIdRef.current === tabId) {
        setWebResults(results);
        searchCacheRef.current[tabId] = results;
      }
    } catch (e) {
      if (lastSearchIdRef.current === tabId) {
        setWebError(e instanceof Error ? e.message : 'Web検索に失敗しました');
      }
    } finally {
      if (lastSearchIdRef.current === tabId) {
        setWebLoading(false);
      }
    }
  }, []);

  // タブ選択時に自動Web検索 + 商品検索
  useEffect(() => {
    const gamesen = allGamesen.find(g => g.id === selectedId);
    const hasKeywords = gamesen && gamesen.keywords.length > 0 && selectedId !== SONOTA_ID;

    if (hasKeywords) {
      searchWeb(gamesen.keywords, selectedId);
    } else {
      setWebResults([]);
    }

    // 商品検索（キーワードありならフィルタ、なしなら全商品）
    const productKey = selectedId || '__all__';
    if (productCacheRef.current[productKey]) {
      setProducts(productCacheRef.current[productKey]);
    } else {
      setProductLoading(true);
      const url = hasKeywords
        ? `/api/kokoro-products?keywords=${encodeURIComponent(gamesen.keywords.join(','))}`
        : '/api/kokoro-products';
      fetch(url)
        .then(r => r.json())
        .then(data => {
          const prods = (data.products || []) as ProductNote[];
          setProducts(prods);
          productCacheRef.current[productKey] = prods;
        })
        .catch(() => setProducts([]))
        .finally(() => setProductLoading(false));
    }
  }, [selectedId, allGamesen, searchWeb]);

  // ブックマークトグル
  const handleBookmark = useCallback(async (noteId: string) => {
    try {
      const res = await fetch('/api/kokoro-bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId }),
      });
      const data = await res.json();
      if (data.error) return;
      // ローカル状態を更新
      setProducts(prev => prev.map(p =>
        p.id === noteId ? {
          ...p,
          isBookmarked: data.bookmarked,
          bookmarkCount: p.bookmarkCount + (data.bookmarked ? 1 : -1),
        } : p
      ));
      // キャッシュも更新
      if (productCacheRef.current[selectedId]) {
        productCacheRef.current[selectedId] = productCacheRef.current[selectedId].map(p =>
          p.id === noteId ? {
            ...p,
            isBookmarked: data.bookmarked,
            bookmarkCount: p.bookmarkCount + (data.bookmarked ? 1 : -1),
          } : p
        );
      }
    } catch { /* ignore */ }
  }, [selectedId]);

  // ========================
  // 統合タイムライン
  // ========================
  const timeline = useMemo<TimelineItem[]>(() => {
    const noteItems: TimelineItem[] = displayedNotes.map(n => ({ type: 'note' as const, data: n }));
    const webItems: TimelineItem[] = webResults.map(w => ({ type: 'web' as const, data: w }));
    const productItems: TimelineItem[] = products.map(p => ({ type: 'product' as const, data: p }));

    const all = [...noteItems, ...webItems, ...productItems];
    if (all.length === 0) return [];

    // インターリーブ: Note → Product → Web を混ぜる
    const merged: TimelineItem[] = [];
    let ni = 0, pi = 0, wi = 0;
    // 最初に自分のNoteを2つ
    while (ni < Math.min(2, noteItems.length)) {
      merged.push(noteItems[ni++]);
    }
    // 残りを交互に（Product → Web → Note の順）
    while (ni < noteItems.length || pi < productItems.length || wi < webItems.length) {
      if (pi < productItems.length) merged.push(productItems[pi++]);
      if (wi < webItems.length) merged.push(webItems[wi++]);
      if (ni < noteItems.length) merged.push(noteItems[ni++]);
    }
    return merged;
  }, [displayedNotes, webResults, products]);

  // ========================
  // ゲーセンノート CRUD
  // ========================
  const handleCreateGamesen = () => {
    const title = newTitle.trim();
    const keywords = newKeywords.split(/[,、\s]+/).map(k => k.trim()).filter(Boolean);
    if (!title || keywords.length === 0) return;

    const newNote: GamesenNote = {
      id: `custom_${Date.now()}`,
      title,
      description: `${keywords.slice(0, 3).join('・')} に関する記録。`,
      keywords,
      color: newColor,
    };

    const updated = [...customGamesen, newNote];
    setCustomGamesen(updated);
    saveCustomGamesen(updated);
    setNewTitle('');
    setNewKeywords('');
    setShowCreateForm(false);
    setSelectedId(newNote.id);
  };

  const handleDeleteGamesen = (id: string) => {
    const updated = customGamesen.filter(g => g.id !== id);
    setCustomGamesen(updated);
    saveCustomGamesen(updated);
    if (selectedId === id) setSelectedId(GAMESEN_NOTES[0].id);
    setEditingId(null);
    // キャッシュもクリア
    delete searchCacheRef.current[id];
  };

  const handleSaveEdit = (id: string) => {
    const title = editTitle.trim();
    const keywords = editKeywords.split(/[,、\s]+/).map(k => k.trim()).filter(Boolean);
    if (!title || keywords.length === 0) return;

    const updated = customGamesen.map(g =>
      g.id === id
        ? { ...g, title, keywords, description: `${keywords.slice(0, 3).join('・')} に関する記録。` }
        : g
    );
    setCustomGamesen(updated);
    saveCustomGamesen(updated);
    setEditingId(null);
    // キーワード変更したのでキャッシュクリア
    delete searchCacheRef.current[id];
  };

  // 手動リフレッシュ
  const handleRefreshSearch = useCallback(() => {
    const gamesen = allGamesen.find(g => g.id === selectedId);
    if (gamesen && gamesen.keywords.length > 0) {
      delete searchCacheRef.current[selectedId];
      searchWeb(gamesen.keywords, selectedId);
    }
  }, [selectedId, allGamesen, searchWeb]);

  const isCustom = (id: string) => customGamesen.some(g => g.id === id);

  const COLOR_CHOICES = ['#7c3aed', '#c084fc', '#60a5fa', '#34d399', '#fb923c', '#f59e0b', '#ef4444', '#db2777'];

  return (
    <div style={{ minHeight: '100vh', background: '#f8f8f7', color: '#1a1a1a' }}>

      {/* ヘッダー */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky', top: 0, background: '#fff', zIndex: 20,
      }}>
        <div>
          <span style={{ ...mono, fontSize: 13, fontWeight: 700 }}>Kokoro</span>
          <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: '#7c3aed', marginLeft: 4 }}>OS</span>
          <span style={{ ...mono, fontSize: 9, color: '#9ca3af', marginLeft: 8, letterSpacing: '0.15em' }}>// Browser</span>
          {hasAestheticMap && (
            <span style={{ ...mono, fontSize: 8, color: '#059669', marginLeft: 8, letterSpacing: '0.1em' }}>
              ✦ 感性マップ連動中
            </span>
          )}
        </div>
        <button onClick={() => router.push('/')} title="Home に戻る"
          style={{ ...mono, fontSize: 9, color: '#6b7280', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 2, padding: '6px 12px', cursor: 'pointer' }}>
          ← Home
        </button>
      </header>

      {/* タブ行 */}
      <div style={{
        background: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky', top: 45, zIndex: 15,
      }}>
        <div className="browser-tabs" style={{
          display: 'flex', overflowX: 'auto',
          padding: '0 12px',
          gap: 2,
          scrollbarWidth: 'none',
        }}>
          <style>{`.browser-tabs::-webkit-scrollbar { display: none }`}</style>
          {allGamesen.map(g => {
            const noteCount = matchNotesToGamesen(allPublicNotes, g).length;
            const webCount = searchCacheRef.current[g.id]?.length || 0;
            const totalCount = noteCount + webCount;
            return (
              <button
                key={g.id}
                onClick={() => setSelectedId(g.id)}
                style={{
                  flexShrink: 0,
                  padding: '10px 16px',
                  background: selectedId === g.id ? '#f8f8f7' : 'transparent',
                  border: 'none',
                  borderBottom: selectedId === g.id
                    ? `2px solid ${g.color}`
                    : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: selectedId === g.id ? g.color : '#d1d5db',
                  flexShrink: 0, display: 'inline-block',
                  transition: 'background 0.15s',
                }} />
                <span style={{
                  ...mono, fontSize: 10,
                  color: selectedId === g.id ? '#1a1a1a' : '#9ca3af',
                  fontWeight: selectedId === g.id ? 600 : 400,
                  whiteSpace: 'nowrap',
                }}>
                  {g.title}
                </span>
                {totalCount > 0 && (
                  <span style={{
                    ...mono, fontSize: 8,
                    color: selectedId === g.id ? g.color : '#9ca3af',
                    background: selectedId === g.id ? `${g.color}18` : '#f3f4f6',
                    border: `1px solid ${selectedId === g.id ? `${g.color}44` : '#e5e7eb'}`,
                    padding: '0px 5px',
                    borderRadius: 8,
                    lineHeight: '16px',
                    transition: 'all 0.15s',
                  }}>
                    {totalCount}
                  </span>
                )}
              </button>
            );
          })}

          {/* その他タブ */}
          {(() => {
            const count = sonotaNotes.length;
            return (
              <button
                onClick={() => setSelectedId(SONOTA_ID)}
                style={{
                  flexShrink: 0,
                  padding: '10px 16px',
                  background: selectedId === SONOTA_ID ? '#f8f8f7' : 'transparent',
                  border: 'none',
                  borderBottom: selectedId === SONOTA_ID
                    ? '2px solid #9ca3af'
                    : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: selectedId === SONOTA_ID ? '#9ca3af' : '#d1d5db',
                  flexShrink: 0, display: 'inline-block',
                }} />
                <span style={{
                  ...mono, fontSize: 10,
                  color: selectedId === SONOTA_ID ? '#1a1a1a' : '#9ca3af',
                  fontWeight: selectedId === SONOTA_ID ? 600 : 400,
                  whiteSpace: 'nowrap',
                }}>
                  その他
                </span>
                {count > 0 && (
                  <span style={{
                    ...mono, fontSize: 8,
                    color: '#9ca3af',
                    background: '#f3f4f6',
                    border: '1px solid #e5e7eb',
                    padding: '0px 5px', borderRadius: 8, lineHeight: '16px',
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })()}

          {/* ＋ キーワードタブ作成ボタン */}
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            title="キーワードタブを作る"
            style={{
              flexShrink: 0,
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: '2px solid transparent',
              cursor: 'pointer',
              ...mono, fontSize: 12,
              color: showCreateForm ? '#7c3aed' : '#d1d5db',
              transition: 'color 0.15s',
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* タイムライン本体 */}
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px' }}>

        {/* キーワードタブ作成フォーム */}
        {showCreateForm && (
          <div style={{
            marginBottom: 20, padding: '20px',
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
          }}>
            <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginBottom: 12, letterSpacing: '0.12em' }}>
              // キーワードタブを作る — Note検索 + Web検索を同時実行
            </div>
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="タブ名（例：創作の種、AI倫理、建築美学）"
              style={{
                width: '100%', padding: '8px 12px',
                border: '1px solid #e5e7eb', borderRadius: 6,
                fontSize: 14, color: '#1a1a1a', outline: 'none',
                fontFamily: "'Noto Serif JP', serif",
                boxSizing: 'border-box', marginBottom: 10,
              }}
            />
            <input
              type="text"
              value={newKeywords}
              onChange={e => setNewKeywords(e.target.value)}
              placeholder="キーワード（カンマ区切り：創作、アイデア、表現）"
              style={{
                width: '100%', padding: '8px 12px',
                border: '1px solid #e5e7eb', borderRadius: 6,
                fontSize: 13, color: '#1a1a1a', outline: 'none',
                fontFamily: "'Space Mono', monospace",
                boxSizing: 'border-box', marginBottom: 10,
              }}
            />
            {/* カラー選択 */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center' }}>
              <span style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>色:</span>
              {COLOR_CHOICES.map(c => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: c, border: newColor === c ? '2px solid #1a1a1a' : '1px solid #e5e7eb',
                    cursor: 'pointer', padding: 0,
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleCreateGamesen}
                disabled={!newTitle.trim() || !newKeywords.trim()}
                title="作成"
                style={{
                  ...mono, fontSize: 10, letterSpacing: '0.1em',
                  padding: '8px 20px',
                  background: (!newTitle.trim() || !newKeywords.trim()) ? '#f3f4f6' : '#7c3aed',
                  color: (!newTitle.trim() || !newKeywords.trim()) ? '#9ca3af' : '#ffffff',
                  border: 'none', borderRadius: 6,
                  cursor: (!newTitle.trim() || !newKeywords.trim()) ? 'not-allowed' : 'pointer',
                }}
              >
                Yoroshiku
              </button>
              <button
                onClick={() => { setShowCreateForm(false); setNewTitle(''); setNewKeywords(''); }}
                title="キャンセル"
                style={{
                  ...mono, fontSize: 10, color: '#9ca3af',
                  background: 'transparent', border: '1px solid #e5e7eb',
                  borderRadius: 6, padding: '8px 16px', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* 選択中タブの情報パネル */}
        <div style={{
          marginBottom: 20, padding: '12px 16px',
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderLeft: `3px solid ${currentGamesen.color}`,
          borderRadius: 6,
        }}>
          {editingId === currentGamesen.id ? (
            /* 編集モード */
            <div>
              <input
                type="text"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                style={{
                  width: '100%', padding: '6px 10px',
                  border: '1px solid #e5e7eb', borderRadius: 4,
                  fontSize: 14, color: '#1a1a1a', outline: 'none',
                  fontFamily: "'Noto Serif JP', serif",
                  boxSizing: 'border-box', marginBottom: 8,
                }}
              />
              <input
                type="text"
                value={editKeywords}
                onChange={e => setEditKeywords(e.target.value)}
                placeholder="キーワード（カンマ区切り）"
                style={{
                  width: '100%', padding: '6px 10px',
                  border: '1px solid #e5e7eb', borderRadius: 4,
                  fontSize: 12, color: '#6b7280', outline: 'none',
                  ...mono, boxSizing: 'border-box', marginBottom: 8,
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleSaveEdit(currentGamesen.id)} title="保存"
                  style={{ ...mono, fontSize: 9, color: '#7c3aed', background: 'transparent', border: '1px solid #c4b5fd', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' }}>
                  Save
                </button>
                <button onClick={() => setEditingId(null)} title="キャンセル"
                  style={{ ...mono, fontSize: 9, color: '#9ca3af', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={() => handleDeleteGamesen(currentGamesen.id)} title="削除"
                  style={{ ...mono, fontSize: 9, color: '#ef4444', background: 'transparent', border: '1px solid #fca5a5', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', marginLeft: 'auto' }}>
                  Delete
                </button>
              </div>
            </div>
          ) : (
            /* 表示モード */
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ ...mono, fontSize: 9, color: currentGamesen.color, marginBottom: 4 }}>
                  // {currentGamesen.title}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {currentGamesen.keywords.length > 0 && selectedId !== SONOTA_ID && (
                    <button
                      onClick={handleRefreshSearch}
                      disabled={webLoading}
                      title="Web検索をリフレッシュ"
                      style={{ ...mono, fontSize: 8, color: webLoading ? '#d1d5db' : '#6b7280', background: 'transparent', border: 'none', cursor: webLoading ? 'not-allowed' : 'pointer' }}
                    >
                      {webLoading ? '⟳ ...' : '⟳ refresh'}
                    </button>
                  )}
                  {isCustom(currentGamesen.id) && (
                    <button
                      onClick={() => {
                        setEditingId(currentGamesen.id);
                        setEditTitle(currentGamesen.title);
                        setEditKeywords(currentGamesen.keywords.join('、'));
                      }}
                      title="編集"
                      style={{ ...mono, fontSize: 8, color: '#9ca3af', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      edit
                    </button>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
                {currentGamesen.description}
              </div>
              {/* キーワード表示 */}
              {currentGamesen.keywords.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                  {currentGamesen.keywords.map(kw => (
                    <span key={kw} style={{
                      ...mono, fontSize: 8, color: currentGamesen.color,
                      border: `1px solid ${currentGamesen.color}33`,
                      padding: '1px 6px', borderRadius: 8,
                    }}>
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 統計バー */}
        <div style={{
          ...mono, fontSize: 9, color: '#9ca3af',
          marginBottom: 16, letterSpacing: '0.1em',
          display: 'flex', gap: 12, alignItems: 'center',
        }}>
          <span>// {displayedNotes.length} Notes</span>
          {products.length > 0 && <span>+ {products.length} Products</span>}
          {webResults.length > 0 && <span>+ {webResults.length} Web</span>}
          {(webLoading || productLoading) && <span style={{ color: '#7c3aed' }}>⟳ 検索中...</span>}
        </div>

        {/* Web検索エラー */}
        {webError && (
          <div style={{
            ...mono, fontSize: 10, color: '#ef4444', marginBottom: 16,
            padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6,
          }}>
            // Web検索エラー: {webError}
          </div>
        )}

        {/* 統合タイムライン */}
        {timeline.length === 0 && !webLoading ? (
          <div style={{
            padding: '60px 0', textAlign: 'center',
            ...mono, fontSize: 10, color: '#9ca3af', letterSpacing: '0.1em',
          }}>
            // まだここに記録はない
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {timeline.map((item, idx) => (
              item.type === 'note' ? (
                <NoteTimelineItem
                  key={item.data.id}
                  note={item.data}
                  accentColor={currentGamesen.color}
                  isLast={idx === timeline.length - 1}
                  onClick={() => router.push(`/kokoro-browser/${item.data.id}`)}
                />
              ) : item.type === 'product' ? (
                <ProductTimelineItem
                  key={item.data.id}
                  product={item.data}
                  accentColor={currentGamesen.color}
                  isLast={idx === timeline.length - 1}
                  onBookmark={handleBookmark}
                />
              ) : (
                <WebTimelineItem
                  key={item.data.id}
                  result={item.data}
                  accentColor={currentGamesen.color}
                  isLast={idx === timeline.length - 1}
                />
              )
            ))}
          </div>
        )}

        {/* Web検索ローディング */}
        {webLoading && timeline.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ ...mono, fontSize: 10, color: '#7c3aed', letterSpacing: '0.14em', marginBottom: 8 }}>
              // インターネットを再編中...
            </div>
            <div style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>
              感性マップとキーワードからWeb全体を検索しています
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* ─── Note タイムラインアイテム ─── */
function NoteTimelineItem({
  note, accentColor, isLast, onClick,
}: {
  note: PublicNote;
  accentColor: string;
  isLast: boolean;
  onClick: () => void;
}) {
  const mono = { fontFamily: "'Space Mono', monospace" };

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      {/* タイムライン軸 */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        flexShrink: 0, paddingTop: 20,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: accentColor, flexShrink: 0,
          boxShadow: `0 0 0 2px ${accentColor}22`,
        }} />
        {!isLast && (
          <div style={{
            width: 1, flex: 1, minHeight: 24,
            background: '#e5e7eb', marginTop: 4,
          }} />
        )}
      </div>

      {/* カード */}
      <button
        onClick={onClick}
        style={{
          flex: 1, textAlign: 'left',
          padding: '16px 0 24px',
          background: 'transparent',
          border: 'none', cursor: 'pointer',
        }}
      >
        {/* 日付・ソース */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
        }}>
          <span style={{
            ...mono, fontSize: 8, color: '#fff', background: accentColor,
            padding: '1px 6px', borderRadius: 4, letterSpacing: '0.08em',
          }}>
            Note
          </span>
          <span style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>
            {new Date(note.createdAt).toLocaleDateString('ja-JP', {
              month: 'short', day: 'numeric',
            })}
          </span>
          <span style={{
            ...mono, fontSize: 9, color: accentColor,
            border: `1px solid ${accentColor}33`,
            padding: '1px 6px', borderRadius: 8,
          }}>
            {SOURCE_LABELS[note.source] ?? note.source}
          </span>
        </div>

        {/* タイトル */}
        <div style={{
          fontSize: 15, fontWeight: 600,
          fontFamily: 'Noto Serif JP, serif',
          color: '#1a1a1a', marginBottom: 8,
          lineHeight: 1.5,
        }}>
          {note.title}
        </div>

        {/* 本文プレビュー */}
        {note.body && (
          <div style={{
            fontSize: 13, color: '#6b7280',
            fontFamily: 'Noto Serif JP, serif',
            lineHeight: 1.8,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            marginBottom: 10,
          }}>
            {note.body}
          </div>
        )}

        {/* タグ */}
        {(note.tags ?? []).length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {(note.tags ?? []).slice(0, 4).map(tag => (
              <span key={tag} style={{
                ...mono, fontSize: 9, color: '#9ca3af',
                background: '#f3f4f6',
                padding: '1px 8px', borderRadius: 8,
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </button>
    </div>
  );
}

/* ─── Web タイムラインアイテム ─── */
function WebTimelineItem({
  result, accentColor, isLast,
}: {
  result: WebResult;
  accentColor: string;
  isLast: boolean;
}) {
  const mono = { fontFamily: "'Space Mono', monospace" };

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      {/* タイムライン軸 */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        flexShrink: 0, paddingTop: 20,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: 2,
          background: '#3b82f6', flexShrink: 0,
          boxShadow: '0 0 0 2px #3b82f622',
        }} />
        {!isLast && (
          <div style={{
            width: 1, flex: 1, minHeight: 24,
            background: '#e5e7eb', marginTop: 4,
          }} />
        )}
      </div>

      {/* カード */}
      <a
        href={result.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          flex: 1, textAlign: 'left', textDecoration: 'none',
          padding: '16px 0 24px',
        }}
      >
        {/* バッジ・カテゴリ */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
        }}>
          <span style={{
            ...mono, fontSize: 8, color: '#fff', background: '#3b82f6',
            padding: '1px 6px', borderRadius: 4, letterSpacing: '0.08em',
          }}>
            Web
          </span>
          <span style={{
            ...mono, fontSize: 9, color: '#3b82f6',
            border: '1px solid #3b82f633',
            padding: '1px 6px', borderRadius: 8,
          }}>
            {CATEGORY_LABELS[result.category] || result.category}
          </span>
          {/* ドメイン表示 */}
          <span style={{ ...mono, fontSize: 8, color: '#9ca3af' }}>
            {(() => { try { return new URL(result.url).hostname.replace('www.', ''); } catch { return ''; } })()}
          </span>
        </div>

        {/* タイトル */}
        <div style={{
          fontSize: 15, fontWeight: 600,
          fontFamily: 'Noto Serif JP, serif',
          color: '#1a1a1a', marginBottom: 6,
          lineHeight: 1.5,
        }}>
          {result.title}
        </div>

        {/* スニペット */}
        {result.snippet && (
          <div style={{
            fontSize: 13, color: '#6b7280',
            fontFamily: 'Noto Serif JP, serif',
            lineHeight: 1.8,
            marginBottom: 8,
          }}>
            {result.snippet}
          </div>
        )}

        {/* AIによる「なぜ今あなたにこれが必要か」 */}
        {result.reason && (
          <div style={{
            fontSize: 12, color: '#7c3aed',
            fontFamily: 'Noto Serif JP, serif',
            lineHeight: 1.6,
            padding: '6px 10px',
            background: '#f5f3ff',
            border: '1px solid #ede9fe',
            borderRadius: 6,
          }}>
            💡 {result.reason}
          </div>
        )}
      </a>
    </div>
  );
}

/* ─── Product タイムラインアイテム ─── */
function ProductTimelineItem({
  product, accentColor, isLast, onBookmark,
}: {
  product: ProductNote;
  accentColor: string;
  isLast: boolean;
  onBookmark: (noteId: string) => void;
}) {
  const mono = { fontFamily: "'Space Mono', monospace" };

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      {/* タイムライン軸 */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        flexShrink: 0, paddingTop: 20,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: 1,
          background: '#f59e0b', flexShrink: 0,
          boxShadow: '0 0 0 2px #f59e0b22',
          transform: 'rotate(45deg)',
        }} />
        {!isLast && (
          <div style={{
            width: 1, flex: 1, minHeight: 24,
            background: '#e5e7eb', marginTop: 4,
          }} />
        )}
      </div>

      {/* カード */}
      <div style={{
        flex: 1, padding: '16px 0 24px',
      }}>
        {/* バッジ行 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap',
        }}>
          <span style={{
            ...mono, fontSize: 8, color: '#fff', background: '#f59e0b',
            padding: '1px 6px', borderRadius: 4, letterSpacing: '0.08em',
          }}>
            Product
          </span>
          <span style={{
            ...mono, fontSize: 8, color: '#f59e0b',
            border: '1px solid #f59e0b33',
            padding: '1px 6px', borderRadius: 8,
          }}>
            {PRODUCT_TYPE_LABELS[product.productType] || product.productType}
          </span>
          <span style={{ ...mono, fontSize: 10, color: '#f59e0b', fontWeight: 700 }}>
            ¥{product.productPrice.toLocaleString()}
          </span>
          <span style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>
            by {product.authorName}
          </span>
        </div>

        {/* タイトル */}
        <div style={{
          fontSize: 15, fontWeight: 600,
          fontFamily: 'Noto Serif JP, serif',
          color: '#1a1a1a', marginBottom: 6,
          lineHeight: 1.5,
        }}>
          {product.title}
        </div>

        {/* 商品説明 */}
        {product.productDescription && (
          <div style={{
            fontSize: 13, color: '#6b7280',
            fontFamily: 'Noto Serif JP, serif',
            lineHeight: 1.8,
            marginBottom: 8,
          }}>
            {product.productDescription}
          </div>
        )}

        {/* 本文プレビュー */}
        {product.body && !product.productDescription && (
          <div style={{
            fontSize: 13, color: '#9ca3af',
            fontFamily: 'Noto Serif JP, serif',
            lineHeight: 1.8,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            marginBottom: 8,
          }}>
            {product.body}
          </div>
        )}

        {/* アクション行 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
          {/* ブックマーク */}
          <button
            onClick={() => onBookmark(product.id)}
            style={{
              ...mono, fontSize: 9, cursor: 'pointer',
              background: 'transparent', border: 'none',
              color: product.isBookmarked ? '#f59e0b' : '#9ca3af',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {product.isBookmarked ? '★' : '☆'} {product.bookmarkCount}
          </button>

          {/* 外部決済リンク */}
          {product.productExternalUrl && (
            <a
              href={product.productExternalUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                ...mono, fontSize: 9, letterSpacing: '0.08em',
                color: '#f59e0b', textDecoration: 'none',
                padding: '3px 10px', border: '1px solid #fde68a',
                borderRadius: 4,
              }}
            >
              購入する →
            </a>
          )}

          {/* タグ */}
          {product.tags?.slice(0, 3).map(tag => (
            <span key={tag} style={{
              ...mono, fontSize: 8, color: '#9ca3af',
              background: '#f3f4f6', padding: '1px 6px', borderRadius: 8,
            }}>{tag}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
