'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { matchNotesToGamesen } from '@/lib/kokoro-browser/matchNotes';
import type { PublicNote, GamesenNote, ProductNote } from '@/types/browser';

const mono = { fontFamily: "'Space Mono', monospace" };

const CATEGORY_LABELS: Record<string, string> = {
  news: 'News', blog: 'Blog', essay: 'Essay', creative: 'Creative',
  tech: 'Tech', culture: 'Culture', other: 'Other',
};

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF', data: 'Data', svg: 'SVG', html: 'HTML', text: 'Text', other: 'Other',
};

const SOURCE_LABELS: Record<string, string> = {
  talk: 'Talk', zen: 'Zen', emi: 'エミ', manual: '手書き',
};

const WEB_CACHE_KEY = 'kokoroBrowserWebCache';
const CUSTOM_TABS_KEY = 'kokoroBrowserCustomTabs2';
const BM_CATEGORIES_KEY = 'kokoroBrowserBmCats';
const WEB_BM_KEY = 'kokoroBrowserWebBm';
const RESCAN_COOLDOWN_MS = 5 * 60 * 1000;

type TopTab = 'internet' | 'city';

type WebResult = {
  id: string;
  title: string;
  url: string;
  snippet: string;
  reason: string;
  category: string;
};

type WebCacheEntry = { results: WebResult[]; timestamp: number; keywords: string[] };
type WebCache = Record<string, WebCacheEntry>;

type CustomTab = {
  id: string;
  title: string;
  keywords: string[];
  color: string;
  tier: TopTab;
};

type BmCategory = { noteId: string; major: string; minor: string };

type TimelineItem =
  | { type: 'note'; data: PublicNote }
  | { type: 'web'; data: WebResult }
  | { type: 'product'; data: ProductNote };

type BmEntry = {
  noteId: string;
  title: string;
  authorName: string;
  type: 'note' | 'product' | 'web';
  createdAt: string;
  url?: string;
};

type WebBmStore = Record<string, { title: string; category: string; snippet: string; bookmarkedAt: string }>;

const DEFAULT_SITES: WebResult[] = [
  { id: 'def_1', title: 'Google', url: 'https://www.google.com', snippet: '世界最大の検索エンジン', reason: '', category: 'other' },
  { id: 'def_2', title: 'Yahoo! JAPAN', url: 'https://www.yahoo.co.jp', snippet: 'ニュース・天気・メール・ショッピング', reason: '', category: 'news' },
  { id: 'def_3', title: 'Wikipedia', url: 'https://ja.wikipedia.org', snippet: 'フリー百科事典', reason: '', category: 'other' },
  { id: 'def_4', title: 'YouTube', url: 'https://www.youtube.com', snippet: '動画共有プラットフォーム', reason: '', category: 'culture' },
  { id: 'def_5', title: 'note', url: 'https://note.com', snippet: 'クリエイターのためのコンテンツプラットフォーム', reason: '', category: 'creative' },
  { id: 'def_6', title: 'Zenn', url: 'https://zenn.dev', snippet: 'エンジニアのための技術情報共有', reason: '', category: 'tech' },
];

const COLOR_CHOICES = ['#7c3aed', '#c084fc', '#60a5fa', '#34d399', '#fb923c', '#f59e0b', '#ef4444', '#db2777'];

function loadWebCache(): WebCache {
  if (typeof window === 'undefined') return {};
  try { const r = localStorage.getItem(WEB_CACHE_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
function saveWebCache(c: WebCache) { localStorage.setItem(WEB_CACHE_KEY, JSON.stringify(c)); }

function loadCustomTabs(): CustomTab[] {
  if (typeof window === 'undefined') return [];
  try { const r = localStorage.getItem(CUSTOM_TABS_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveCustomTabs(t: CustomTab[]) { localStorage.setItem(CUSTOM_TABS_KEY, JSON.stringify(t)); }

function loadWebBm(): WebBmStore {
  if (typeof window === 'undefined') return {};
  try { const r = localStorage.getItem(WEB_BM_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
function saveWebBm(s: WebBmStore) { localStorage.setItem(WEB_BM_KEY, JSON.stringify(s)); }

function loadBmCategories(): BmCategory[] {
  if (typeof window === 'undefined') return [];
  try { const r = localStorage.getItem(BM_CATEGORIES_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveBmCategories(c: BmCategory[]) { localStorage.setItem(BM_CATEGORIES_KEY, JSON.stringify(c)); }

function formatCacheTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  const hr = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  if (hr < 24) return `${hr}時間前`;
  if (day < 7) return `${day}日前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/* ================================================================
   Main Component
   ================================================================ */
export default function KokoroBrowserPage() {
  const [topTab, setTopTab] = useState<TopTab>('internet');
  const [subTabId, setSubTabId] = useState('timeline');
  const [customTabs, setCustomTabs] = useState<CustomTab[]>([]);
  const [syncCounter, setSyncCounter] = useState(0);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [newColor, setNewColor] = useState('#7c3aed');

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editKeywords, setEditKeywords] = useState('');

  const [webResults, setWebResults] = useState<WebResult[]>([]);
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState('');
  const [hasAestheticMap, setHasAestheticMap] = useState(false);
  const webCacheRef = useRef<WebCache>({});
  const lastSearchIdRef = useRef('');
  const [currentCacheTime, setCurrentCacheTime] = useState<number | null>(null);

  const [publicNotes, setPublicNotes] = useState<PublicNote[]>([]);
  const [products, setProducts] = useState<ProductNote[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const productCacheRef = useRef<Record<string, ProductNote[]>>({});

  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [webBmUrls, setWebBmUrls] = useState<Set<string>>(new Set());
  const webBmRef = useRef<WebBmStore>({});

  const [showBmViewer, setShowBmViewer] = useState(false);
  const [bmEntries, setBmEntries] = useState<BmEntry[]>([]);
  const [bmCategories, setBmCategories] = useState<BmCategory[]>([]);
  const [bmSearch, setBmSearch] = useState('');
  const [bmViewerLoading, setBmViewerLoading] = useState(false);
  const [bmOrganizing, setBmOrganizing] = useState(false);
  const [bmSelectedMajor, setBmSelectedMajor] = useState<string | null>(null);
  const [bmSelectedMinor, setBmSelectedMinor] = useState<string | null>(null);

  useEffect(() => {
    setCustomTabs(loadCustomTabs());
    webCacheRef.current = loadWebCache();
    setBmCategories(loadBmCategories());
    const wbm = loadWebBm();
    webBmRef.current = wbm;
    setWebBmUrls(new Set(Object.keys(wbm)));
  }, []);

  // Fetch public notes
  const fetchPublicNotes = useCallback(async () => {
    try {
      const res = await fetch('/api/kokoro-public-notes');
      const data = await res.json();
      setPublicNotes(
        (data.notes || []).map((n: Record<string, unknown>) => ({
          id: n.id as string,
          title: n.title as string,
          body: n.body as string,
          tags: n.tags as string[],
          source: (n.source || 'manual') as PublicNote['source'],
          createdAt: n.createdAt as string,
          isPublic: true as const,
          authorLabel: n.authorLabel as string | undefined,
          authorId: n.authorId as string | undefined,
        }))
      );
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchPublicNotes(); }, [fetchPublicNotes]);

  const tierTabs = useMemo(() => customTabs.filter(t => t.tier === topTab), [customTabs, topTab]);
  const selectedCustomTab = useMemo(() => tierTabs.find(t => t.id === subTabId), [tierTabs, subTabId]);

  const handleTopTabChange = (t: TopTab) => {
    setTopTab(t);
    setSubTabId('timeline');
    setShowCreateForm(false);
    setEditingTabId(null);
  };

  /* ─── Web search ─── */
  const fetchWebResults = useCallback(async (keywords: string[], cacheKey: string) => {
    setWebLoading(true);
    setWebError('');
    lastSearchIdRef.current = cacheKey;
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
        id: `web_${cacheKey}_${i}`,
        title: r.title, url: r.url, snippet: r.snippet,
        reason: r.reason, category: r.category || 'other',
      }));

      if (data.hasAestheticMap) setHasAestheticMap(true);

      if (lastSearchIdRef.current === cacheKey) {
        if (!data.hasAestheticMap && cacheKey === 'internet_timeline') {
          setWebResults(DEFAULT_SITES);
        } else {
          setWebResults(results);
        }
        const now = Date.now();
        setCurrentCacheTime(now);
        webCacheRef.current[cacheKey] = { results: !data.hasAestheticMap && cacheKey === 'internet_timeline' ? DEFAULT_SITES : results, timestamp: now, keywords };
        saveWebCache(webCacheRef.current);
      }
    } catch (e) {
      if (lastSearchIdRef.current === cacheKey) {
        if (cacheKey === 'internet_timeline') {
          setWebResults(DEFAULT_SITES);
        } else {
          setWebError(e instanceof Error ? e.message : 'Web検索に失敗しました');
        }
      }
    } finally {
      if (lastSearchIdRef.current === cacheKey) setWebLoading(false);
    }
  }, []);

  const loadFromCache = useCallback((key: string): boolean => {
    const entry = webCacheRef.current[key];
    if (entry) {
      setWebResults(entry.results);
      setCurrentCacheTime(entry.timestamp);
      return true;
    }
    setCurrentCacheTime(null);
    return false;
  }, []);

  /* ─── Data loading on tab change ─── */
  useEffect(() => {
    if (topTab === 'internet') {
      setProducts([]);
      if (subTabId === 'timeline') {
        const cached = loadFromCache('internet_timeline');
        if (!cached) fetchWebResults(['おすすめ', 'トレンド', '最新'], 'internet_timeline');
      } else if (selectedCustomTab) {
        const cached = loadFromCache(selectedCustomTab.id);
        if (!cached) fetchWebResults(selectedCustomTab.keywords, selectedCustomTab.id);
      } else {
        setWebResults([]);
        setCurrentCacheTime(null);
      }
    } else {
      setWebResults([]);
      setCurrentCacheTime(null);

      const pKey = subTabId === 'timeline' ? '__city_all__' : (selectedCustomTab?.id || '__city_all__');
      if (productCacheRef.current[pKey]) {
        setProducts(productCacheRef.current[pKey]);
      } else {
        setProductLoading(true);
        const url = selectedCustomTab
          ? `/api/kokoro-products?keywords=${encodeURIComponent(selectedCustomTab.keywords.join(','))}`
          : '/api/kokoro-products';
        fetch(url)
          .then(r => r.json())
          .then(data => {
            const prods = (data.products || []) as ProductNote[];
            setProducts(prods);
            productCacheRef.current[pKey] = prods;
          })
          .catch(() => setProducts([]))
          .finally(() => setProductLoading(false));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topTab, subTabId, selectedCustomTab?.id, syncCounter]);

  /* ─── Filtered notes for city (exclude product source notes) ─── */
  const productIds = useMemo(() => new Set(products.map(p => p.id)), [products]);
  const safePublicNotes = useMemo(() => publicNotes.filter(n => !productIds.has(n.id)), [publicNotes, productIds]);

  const filteredNotes = useMemo(() => {
    if (topTab !== 'city') return [];
    if (subTabId === 'timeline') return safePublicNotes;
    if (selectedCustomTab) {
      const pseudo: GamesenNote = {
        id: selectedCustomTab.id, title: selectedCustomTab.title,
        description: '', keywords: selectedCustomTab.keywords, color: selectedCustomTab.color,
      };
      return matchNotesToGamesen(safePublicNotes, pseudo);
    }
    return [];
  }, [topTab, subTabId, safePublicNotes, selectedCustomTab]);

  /* ─── Timeline ─── */
  const timeline = useMemo<TimelineItem[]>(() => {
    if (topTab === 'internet') {
      return webResults.map(w => ({ type: 'web' as const, data: w }));
    }
    const noteItems: TimelineItem[] = filteredNotes.map(n => ({ type: 'note' as const, data: n }));
    const productItems: TimelineItem[] = products.map(p => ({ type: 'product' as const, data: p }));
    const merged: TimelineItem[] = [];
    let ni = 0, pi = 0;
    while (ni < Math.min(2, noteItems.length)) merged.push(noteItems[ni++]);
    while (ni < noteItems.length || pi < productItems.length) {
      if (pi < productItems.length) merged.push(productItems[pi++]);
      if (ni < noteItems.length) merged.push(noteItems[ni++]);
    }
    return merged;
  }, [topTab, webResults, filteredNotes, products]);

  /* ─── Bookmark toggle ─── */
  const handleBookmark = useCallback(async (noteId: string) => {
    try {
      const res = await fetch('/api/kokoro-bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId }),
      });
      const data = await res.json();
      if (data.error) return;
      setBookmarkedIds(prev => {
        const next = new Set(prev);
        if (data.bookmarked) next.add(noteId); else next.delete(noteId);
        return next;
      });
      setProducts(prev => prev.map(p =>
        p.id === noteId ? { ...p, isBookmarked: data.bookmarked, bookmarkCount: p.bookmarkCount + (data.bookmarked ? 1 : -1) } : p
      ));
    } catch { /* ignore */ }
  }, []);

  const handleWebBookmark = useCallback((url: string, title: string, category: string, snippet: string) => {
    const store = { ...webBmRef.current };
    if (store[url]) {
      delete store[url];
    } else {
      store[url] = { title, category, snippet, bookmarkedAt: new Date().toISOString() };
    }
    webBmRef.current = store;
    saveWebBm(store);
    setWebBmUrls(new Set(Object.keys(store)));
  }, []);

  // Load bookmark states
  useEffect(() => {
    const allIds = [...publicNotes.map(n => n.id), ...products.map(p => p.id)];
    if (allIds.length === 0) return;
    fetch(`/api/kokoro-bookmarks?noteIds=${encodeURIComponent(allIds.slice(0, 50).join(','))}`)
      .then(r => r.json())
      .then(data => {
        const bms = data.bookmarks || {};
        const ids = new Set<string>();
        Object.entries(bms).forEach(([noteId, info]) => {
          if ((info as { isBookmarked: boolean }).isBookmarked) ids.add(noteId);
        });
        setBookmarkedIds(ids);
      })
      .catch(() => {});
  }, [publicNotes, products]);

  /* ─── Sync ─── */
  const handleSync = useCallback(() => {
    productCacheRef.current = {};
    webCacheRef.current = {};
    saveWebCache({});
    fetchPublicNotes();
    setSyncCounter(c => c + 1);
  }, [fetchPublicNotes]);

  /* ─── Custom tab CRUD ─── */
  const handleCreateTab = () => {
    const title = newTitle.trim();
    const keywords = newKeywords.split(/[,、\s]+/).map(k => k.trim()).filter(Boolean);
    if (!title || keywords.length === 0) return;
    const tab: CustomTab = { id: `tab_${Date.now()}`, title, keywords, color: newColor, tier: topTab };
    const updated = [...customTabs, tab];
    setCustomTabs(updated);
    saveCustomTabs(updated);
    setNewTitle(''); setNewKeywords(''); setShowCreateForm(false);
    setSubTabId(tab.id);
  };

  const handleDeleteTab = (id: string) => {
    const updated = customTabs.filter(t => t.id !== id);
    setCustomTabs(updated);
    saveCustomTabs(updated);
    if (subTabId === id) setSubTabId('timeline');
    setEditingTabId(null);
    delete webCacheRef.current[id];
    saveWebCache(webCacheRef.current);
  };

  const handleSaveEdit = (id: string) => {
    const title = editTitle.trim();
    const keywords = editKeywords.split(/[,、\s]+/).map(k => k.trim()).filter(Boolean);
    if (!title || keywords.length === 0) return;
    const updated = customTabs.map(t => t.id === id ? { ...t, title, keywords } : t);
    setCustomTabs(updated);
    saveCustomTabs(updated);
    setEditingTabId(null);
    delete webCacheRef.current[id];
    saveWebCache(webCacheRef.current);
  };

  const handleRescan = useCallback(() => {
    if (topTab !== 'internet') return;
    let keywords: string[];
    let cacheKey: string;
    if (subTabId === 'timeline') {
      keywords = ['おすすめ', 'トレンド', '最新'];
      cacheKey = 'internet_timeline';
    } else if (selectedCustomTab) {
      keywords = selectedCustomTab.keywords;
      cacheKey = selectedCustomTab.id;
    } else return;

    const cached = webCacheRef.current[cacheKey];
    if (cached) {
      const elapsed = Date.now() - cached.timestamp;
      if (elapsed < RESCAN_COOLDOWN_MS) {
        alert(`再スキャンは${Math.ceil((RESCAN_COOLDOWN_MS - elapsed) / 1000)}秒後に可能です`);
        return;
      }
    }
    delete webCacheRef.current[cacheKey];
    saveWebCache(webCacheRef.current);
    fetchWebResults(keywords, cacheKey);
  }, [topTab, subTabId, selectedCustomTab, fetchWebResults]);

  /* ─── Bookmark viewer ─── */
  const handleOpenBmViewer = async () => {
    setShowBmViewer(true);
    setBmViewerLoading(true);
    setBmSelectedMajor(null);
    setBmSelectedMinor(null);
    try {
      const res = await fetch('/api/kokoro-bookmark-list');
      const data = await res.json();
      const dbEntries: BmEntry[] = data.bookmarks || [];
      const webEntries: BmEntry[] = Object.entries(webBmRef.current).map(([url, info]) => ({
        noteId: url,
        title: info.title,
        authorName: (() => { try { return new URL(url).hostname.replace('www.', ''); } catch { return 'Web'; } })(),
        type: 'web' as const,
        createdAt: info.bookmarkedAt,
        url,
      }));
      setBmEntries([...dbEntries, ...webEntries]);
    } catch { /* ignore */ }
    setBmViewerLoading(false);
  };

  const handleOrganizeBm = async () => {
    if (bmEntries.length === 0) return;
    setBmOrganizing(true);
    try {
      const res = await fetch('/api/kokoro-bookmark-organize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarks: bmEntries }),
      });
      const data = await res.json();
      if (data.categories) {
        setBmCategories(data.categories);
        saveBmCategories(data.categories);
      }
    } catch { /* ignore */ }
    setBmOrganizing(false);
  };

  const currentTabColor = selectedCustomTab?.color || '#7c3aed';

  /* ================================================================
     Render
     ================================================================ */
  return (
    <div style={{ minHeight: '100vh', background: '#f8f8f7', color: '#1a1a1a' }}>

      {/* ─── ヘッダー ─── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 28px', borderBottom: '1px solid #e5e7eb',
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 32, height: 32, border: '1px solid rgba(124,58,237,0.3)',
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(circle at 40% 40%,rgba(124,58,237,0.1) 0%,transparent 70%)',
            fontSize: 16,
          }}>🌐</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: '#7c3aed' }}>Browser</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>
              インターネットとシティーを探索する
            </span>
          </div>
          {hasAestheticMap && (
            <span style={{ ...mono, fontSize: 8, color: '#059669', letterSpacing: '0.1em' }}>
              ✦ 感性マップ連動中
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={handleOpenBmViewer}
            title="ブックマーク一覧"
            style={{
              ...mono, fontSize: 9, letterSpacing: '.1em',
              color: '#7c3aed', background: 'transparent',
              border: '1px solid rgba(124,58,237,0.3)', borderRadius: 4,
              padding: '6px 12px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            📖 Bookmarks
          </button>
          <button
            onClick={handleSync}
            title="データを同期"
            style={{
              ...mono, fontSize: 9, letterSpacing: '.1em',
              color: '#6b7280', background: 'transparent',
              border: '1px solid #e5e7eb', borderRadius: 4,
              padding: '6px 12px', cursor: 'pointer',
            }}
          >
            ⟳ 同期
          </button>
        </div>
      </header>

      {/* ─── Top tier tabs ─── */}
      <div style={{
        display: 'flex', background: '#fff',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky', top: 57, zIndex: 18,
      }}>
        {([['internet', 'インターネット'], ['city', 'シティー']] as [TopTab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => handleTopTabChange(id)}
            style={{
              flex: 1, padding: '10px 0', textAlign: 'center',
              ...mono, fontSize: 11, letterSpacing: '.12em',
              color: topTab === id ? '#7c3aed' : '#9ca3af',
              fontWeight: topTab === id ? 700 : 400,
              background: 'transparent', border: 'none',
              borderBottom: topTab === id ? '2px solid #7c3aed' : '2px solid transparent',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ─── Sub tabs ─── */}
      <div style={{
        background: '#ffffff', borderBottom: '1px solid #e5e7eb',
        position: 'sticky', top: 97, zIndex: 15,
      }}>
        <div className="browser-tabs" style={{
          display: 'flex', overflowX: 'auto', padding: '0 12px', gap: 2,
          scrollbarWidth: 'none',
        }}>
          <style>{`.browser-tabs::-webkit-scrollbar { display: none }`}</style>

          {/* タイムライン */}
          <button
            onClick={() => { setSubTabId('timeline'); setEditingTabId(null); }}
            style={{
              flexShrink: 0, padding: '10px 16px',
              background: subTabId === 'timeline' ? '#f8f8f7' : 'transparent',
              border: 'none',
              borderBottom: subTabId === 'timeline' ? '2px solid #7c3aed' : '2px solid transparent',
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: subTabId === 'timeline' ? '#7c3aed' : '#d1d5db',
              flexShrink: 0, display: 'inline-block',
            }} />
            <span style={{
              ...mono, fontSize: 10,
              color: subTabId === 'timeline' ? '#1a1a1a' : '#9ca3af',
              fontWeight: subTabId === 'timeline' ? 600 : 400,
              whiteSpace: 'nowrap',
            }}>
              タイムライン
            </span>
          </button>

          {/* Custom tabs for this tier */}
          {tierTabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setSubTabId(t.id); setEditingTabId(null); }}
              style={{
                flexShrink: 0, padding: '10px 16px',
                background: subTabId === t.id ? '#f8f8f7' : 'transparent',
                border: 'none',
                borderBottom: subTabId === t.id ? `2px solid ${t.color}` : '2px solid transparent',
                cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: subTabId === t.id ? t.color : '#d1d5db',
                flexShrink: 0, display: 'inline-block',
              }} />
              <span style={{
                ...mono, fontSize: 10,
                color: subTabId === t.id ? '#1a1a1a' : '#9ca3af',
                fontWeight: subTabId === t.id ? 600 : 400,
                whiteSpace: 'nowrap',
              }}>
                {t.title}
              </span>
            </button>
          ))}

          {/* 編集ボタン（カスタムタブ選択時） */}
          {selectedCustomTab && (
            <button
              onClick={() => {
                if (editingTabId === selectedCustomTab.id) {
                  setEditingTabId(null);
                } else {
                  setEditingTabId(selectedCustomTab.id);
                  setEditTitle(selectedCustomTab.title);
                  setEditKeywords(selectedCustomTab.keywords.join('、'));
                }
              }}
              title="タブを編集"
              style={{
                flexShrink: 0, padding: '10px 12px',
                background: 'transparent', border: 'none',
                borderBottom: '2px solid transparent',
                cursor: 'pointer',
                ...mono, fontSize: 10,
                color: editingTabId === selectedCustomTab.id ? '#7c3aed' : '#9ca3af',
                transition: 'color 0.15s',
              }}
            >
              ✏️ 編集
            </button>
          )}

          {/* +タブ */}
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            title="キーワードタブを作る"
            style={{
              flexShrink: 0, padding: '10px 14px',
              background: 'transparent', border: 'none',
              borderBottom: '2px solid transparent',
              cursor: 'pointer',
              ...mono, fontSize: 10,
              color: showCreateForm ? '#7c3aed' : '#d1d5db',
              transition: 'color 0.15s',
            }}
          >
            +タブ
          </button>
        </div>
      </div>

      {/* ─── Timeline body ─── */}
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px 120px' }}>

        {/* Tab creation form */}
        {showCreateForm && (
          <div style={{
            marginBottom: 20, padding: 20,
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
          }}>
            <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginBottom: 12, letterSpacing: '0.12em' }}>
              // キーワードタブを作る
            </div>
            <input
              type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)}
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
              type="text" value={newKeywords} onChange={e => setNewKeywords(e.target.value)}
              placeholder="キーワード（カンマ区切り：創作、アイデア、表現）"
              style={{
                width: '100%', padding: '8px 12px',
                border: '1px solid #e5e7eb', borderRadius: 6,
                fontSize: 13, color: '#1a1a1a', outline: 'none',
                ...mono, boxSizing: 'border-box', marginBottom: 10,
              }}
            />
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center' }}>
              <span style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>色:</span>
              {COLOR_CHOICES.map(c => (
                <button key={c} onClick={() => setNewColor(c)} style={{
                  width: 18, height: 18, borderRadius: '50%', background: c,
                  border: newColor === c ? '2px solid #1a1a1a' : '1px solid #e5e7eb',
                  cursor: 'pointer', padding: 0,
                }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCreateTab} disabled={!newTitle.trim() || !newKeywords.trim()} title="作成"
                style={{
                  ...mono, fontSize: 10, letterSpacing: '0.1em', padding: '8px 20px',
                  background: (!newTitle.trim() || !newKeywords.trim()) ? '#f3f4f6' : '#7c3aed',
                  color: (!newTitle.trim() || !newKeywords.trim()) ? '#9ca3af' : '#fff',
                  border: 'none', borderRadius: 6,
                  cursor: (!newTitle.trim() || !newKeywords.trim()) ? 'not-allowed' : 'pointer',
                }}>
                Yoroshiku
              </button>
              <button onClick={() => { setShowCreateForm(false); setNewTitle(''); setNewKeywords(''); }} title="キャンセル"
                style={{ ...mono, fontSize: 10, color: '#9ca3af', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Tab info panel (custom tabs only) */}
        {selectedCustomTab && (
          <div style={{
            marginBottom: 20, padding: '12px 16px', background: '#fff',
            border: '1px solid #e5e7eb', borderLeft: `3px solid ${selectedCustomTab.color}`,
            borderRadius: 6,
          }}>
            {editingTabId === selectedCustomTab.id ? (
              <div>
                <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 14, color: '#1a1a1a', outline: 'none', fontFamily: "'Noto Serif JP', serif", boxSizing: 'border-box', marginBottom: 8 }} />
                <input type="text" value={editKeywords} onChange={e => setEditKeywords(e.target.value)}
                  placeholder="キーワード（カンマ区切り）"
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 12, color: '#6b7280', outline: 'none', ...mono, boxSizing: 'border-box', marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleSaveEdit(selectedCustomTab.id)} title="保存"
                    style={{ ...mono, fontSize: 9, color: '#7c3aed', background: 'transparent', border: '1px solid #c4b5fd', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setEditingTabId(null)} title="キャンセル"
                    style={{ ...mono, fontSize: 9, color: '#9ca3af', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={() => handleDeleteTab(selectedCustomTab.id)} title="削除"
                    style={{ ...mono, fontSize: 9, color: '#ef4444', background: 'transparent', border: '1px solid #fca5a5', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', marginLeft: 'auto' }}>Delete</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ ...mono, fontSize: 9, color: selectedCustomTab.color, marginBottom: 4 }}>
                    // {selectedCustomTab.title}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {topTab === 'internet' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {currentCacheTime && (
                          <span style={{ ...mono, fontSize: 8, color: '#9ca3af' }}>{formatCacheTime(currentCacheTime)}</span>
                        )}
                        <button onClick={handleRescan} disabled={webLoading} title="Web検索を再スキャン"
                          style={{ ...mono, fontSize: 8, color: webLoading ? '#d1d5db' : '#6b7280', background: 'transparent', border: 'none', cursor: webLoading ? 'not-allowed' : 'pointer' }}>
                          {webLoading ? '⟳ ...' : '⟳ rescan'}
                        </button>
                      </div>
                    )}
                    <button
                      onClick={() => { setEditingTabId(selectedCustomTab.id); setEditTitle(selectedCustomTab.title); setEditKeywords(selectedCustomTab.keywords.join('、')); }}
                      title="編集" style={{ ...mono, fontSize: 8, color: '#9ca3af', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                      edit
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                  {selectedCustomTab.keywords.map(kw => (
                    <span key={kw} style={{ ...mono, fontSize: 8, color: selectedCustomTab.color, border: `1px solid ${selectedCustomTab.color}33`, padding: '1px 6px', borderRadius: 8 }}>
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Timeline info panel */}
        {subTabId === 'timeline' && topTab === 'internet' && (
          <div style={{
            marginBottom: 20, padding: '12px 16px', background: '#fff',
            border: '1px solid #e5e7eb', borderLeft: '3px solid #7c3aed', borderRadius: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ ...mono, fontSize: 9, color: '#7c3aed' }}>// タイムライン</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {currentCacheTime && (
                  <span style={{ ...mono, fontSize: 8, color: '#9ca3af' }}>{formatCacheTime(currentCacheTime)}</span>
                )}
                <button onClick={handleRescan} disabled={webLoading} title="Web検索を再スキャン"
                  style={{ ...mono, fontSize: 8, color: webLoading ? '#d1d5db' : '#6b7280', background: 'transparent', border: 'none', cursor: webLoading ? 'not-allowed' : 'pointer' }}>
                  {webLoading ? '⟳ ...' : '⟳ rescan'}
                </button>
              </div>
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
              {hasAestheticMap
                ? 'あなたの感性マップからパーソナライズされたコンテンツを表示しています。'
                : 'プロフィールを設定すると、あなたの感性に合ったコンテンツが表示されます。'}
            </div>
          </div>
        )}

        {/* Stats bar */}
        <div style={{
          ...mono, fontSize: 9, color: '#9ca3af',
          marginBottom: 16, letterSpacing: '0.1em',
          display: 'flex', gap: 12, alignItems: 'center',
        }}>
          {topTab === 'internet' ? (
            <span>// {webResults.length} Web</span>
          ) : (
            <>
              <span>// {filteredNotes.length} Notes</span>
              {products.length > 0 && <span>+ {products.length} Products</span>}
            </>
          )}
          {(webLoading || productLoading) && <span style={{ color: '#7c3aed' }}>⟳ 検索中...</span>}
        </div>

        {/* Web error */}
        {webError && (
          <div style={{
            ...mono, fontSize: 10, color: '#ef4444', marginBottom: 16,
            padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6,
          }}>
            // Web検索エラー: {webError}
          </div>
        )}

        {/* Timeline items */}
        {timeline.length === 0 && !webLoading && !productLoading ? (
          <div style={{
            padding: '60px 0', textAlign: 'center',
            ...mono, fontSize: 10, color: '#9ca3af', letterSpacing: '0.1em',
          }}>
            // まだここに記録はない
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {timeline.map((item, idx) => {
              const isLast = idx === timeline.length - 1;
              if (item.type === 'note') {
                return (
                  <NoteTimelineItem
                    key={item.data.id} note={item.data}
                    accentColor={currentTabColor} isLast={isLast}
                    isBookmarked={bookmarkedIds.has(item.data.id)}
                    onBookmark={handleBookmark}
                  />
                );
              }
              if (item.type === 'product') {
                return (
                  <ProductTimelineItem
                    key={item.data.id} product={item.data}
                    accentColor={currentTabColor} isLast={isLast}
                    isBookmarked={bookmarkedIds.has(item.data.id) || item.data.isBookmarked || false}
                    onBookmark={handleBookmark}
                  />
                );
              }
              return (
                <WebTimelineItem key={item.data.id} result={item.data} accentColor={currentTabColor} isLast={isLast}
                  isBookmarked={webBmUrls.has(item.data.url)}
                  onBookmark={handleWebBookmark}
                />
              );
            })}
          </div>
        )}

        {/* Loading */}
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

      {/* ─── Bookmark Viewer Overlay ─── */}
      {showBmViewer && (
        <BookmarkViewer
          entries={bmEntries}
          categories={bmCategories}
          search={bmSearch}
          onSearchChange={setBmSearch}
          loading={bmViewerLoading}
          organizing={bmOrganizing}
          selectedMajor={bmSelectedMajor}
          selectedMinor={bmSelectedMinor}
          onSelectMajor={setBmSelectedMajor}
          onSelectMinor={setBmSelectedMinor}
          onOrganize={handleOrganizeBm}
          onClose={() => setShowBmViewer(false)}
        />
      )}
    </div>
  );
}

/* ─── Note Timeline Item ─── */
function NoteTimelineItem({
  note, accentColor, isLast, isBookmarked, onBookmark,
}: {
  note: PublicNote;
  accentColor: string;
  isLast: boolean;
  isBookmarked: boolean;
  onBookmark: (noteId: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingTop: 20 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor, flexShrink: 0, boxShadow: `0 0 0 2px ${accentColor}22` }} />
        {!isLast && <div style={{ width: 1, flex: 1, minHeight: 24, background: '#e5e7eb', marginTop: 4 }} />}
      </div>

      <div style={{ flex: 1, textAlign: 'left', padding: '16px 0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ ...mono, fontSize: 8, color: '#fff', background: accentColor, padding: '1px 6px', borderRadius: 4, letterSpacing: '0.08em' }}>
            Note
          </span>
          <span style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>
            {new Date(note.createdAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
          </span>
          <span style={{ ...mono, fontSize: 9, color: accentColor, border: `1px solid ${accentColor}33`, padding: '1px 6px', borderRadius: 8 }}>
            {SOURCE_LABELS[note.source] ?? note.source}
          </span>
        </div>

        <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'Noto Serif JP, serif', color: '#1a1a1a', marginBottom: 8, lineHeight: 1.5 }}>
          {note.title}
        </div>

        {note.body && (
          <div style={{
            fontSize: 13, color: '#6b7280', fontFamily: 'Noto Serif JP, serif', lineHeight: 1.8,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: 10,
          }}>
            {note.body}
          </div>
        )}

        {(note.tags ?? []).length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {(note.tags ?? []).slice(0, 4).map(tag => (
              <span key={tag} style={{ ...mono, fontSize: 9, color: '#9ca3af', background: '#f3f4f6', padding: '1px 8px', borderRadius: 8 }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Author + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          {note.authorLabel && (
            <button
              onClick={() => onBookmark(note.id)}
              title={isBookmarked ? 'ブックマーク済み' : 'ブックマークする'}
              style={{
                ...mono, fontSize: 9, cursor: 'pointer',
                color: isBookmarked ? '#7c3aed' : '#9ca3af',
                background: isBookmarked ? '#ede9fe' : 'transparent',
                border: 'none', padding: '1px 6px', borderRadius: 8,
                display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              📖 {note.authorLabel}
            </button>
          )}
          {note.authorId && (
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/kokoro-messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'greet', recipientId: note.authorId }),
                  });
                  const data = await res.json();
                  if (data.error) {
                    if (res.status === 409) window.location.href = '/kokoro-messages';
                    else alert(data.error);
                    return;
                  }
                  window.location.href = '/kokoro-messages';
                } catch { alert('送信に失敗しました'); }
              }}
              style={{
                ...mono, fontSize: 7, letterSpacing: '0.06em', cursor: 'pointer',
                padding: '1px 6px', borderRadius: 8,
                color: '#7c3aed', background: 'transparent', border: '1px solid #ede9fe',
              }}
            >
              挨拶を送る
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Web Timeline Item ─── */
function WebTimelineItem({
  result, accentColor, isLast, isBookmarked, onBookmark,
}: {
  result: WebResult;
  accentColor: string;
  isLast: boolean;
  isBookmarked: boolean;
  onBookmark: (url: string, title: string, category: string, snippet: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingTop: 20 }}>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: '#3b82f6', flexShrink: 0, boxShadow: '0 0 0 2px #3b82f622' }} />
        {!isLast && <div style={{ width: 1, flex: 1, minHeight: 24, background: '#e5e7eb', marginTop: 4 }} />}
      </div>

      <div style={{ flex: 1, padding: '16px 0 24px' }}>
        <a
          href={result.url} target="_blank" rel="noopener noreferrer"
          style={{ textAlign: 'left', textDecoration: 'none', display: 'block' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ ...mono, fontSize: 8, color: '#fff', background: '#3b82f6', padding: '1px 6px', borderRadius: 4, letterSpacing: '0.08em' }}>
              Web
            </span>
            <span style={{ ...mono, fontSize: 9, color: '#3b82f6', border: '1px solid #3b82f633', padding: '1px 6px', borderRadius: 8 }}>
              {CATEGORY_LABELS[result.category] || result.category}
            </span>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af' }}>
              {(() => { try { return new URL(result.url).hostname.replace('www.', ''); } catch { return ''; } })()}
            </span>
          </div>

          <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'Noto Serif JP, serif', color: '#1a1a1a', marginBottom: 6, lineHeight: 1.5 }}>
            {result.title}
          </div>

          {result.snippet && (
            <div style={{ fontSize: 13, color: '#6b7280', fontFamily: 'Noto Serif JP, serif', lineHeight: 1.8, marginBottom: 8 }}>
              {result.snippet}
            </div>
          )}

          {result.reason && (
            <div style={{
              fontSize: 12, color: '#7c3aed', fontFamily: 'Noto Serif JP, serif', lineHeight: 1.6,
              padding: '6px 10px', background: '#f5f3ff', border: '1px solid #ede9fe', borderRadius: 6,
            }}>
              💡 {result.reason}
            </div>
          )}
        </a>

        {/* Bookmark button */}
        <button
          onClick={(e) => { e.preventDefault(); onBookmark(result.url, result.title, result.category, result.snippet); }}
          title={isBookmarked ? 'ブックマーク済み' : 'ブックマークする'}
          style={{
            ...mono, fontSize: 9, cursor: 'pointer', marginTop: 8,
            color: isBookmarked ? '#3b82f6' : '#9ca3af',
            background: isBookmarked ? '#dbeafe' : 'transparent',
            border: 'none', padding: '2px 8px', borderRadius: 8,
            display: 'inline-flex', alignItems: 'center', gap: 3,
          }}
        >
          📖 {isBookmarked ? 'ブックマーク済み' : 'ブックマーク'}
        </button>
      </div>
    </div>
  );
}

/* ─── Product Timeline Item ─── */
function ProductTimelineItem({
  product, accentColor, isLast, isBookmarked, onBookmark,
}: {
  product: ProductNote;
  accentColor: string;
  isLast: boolean;
  isBookmarked: boolean;
  onBookmark: (noteId: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingTop: 20 }}>
        <div style={{ width: 8, height: 8, borderRadius: 1, background: '#f59e0b', flexShrink: 0, boxShadow: '0 0 0 2px #f59e0b22', transform: 'rotate(45deg)' }} />
        {!isLast && <div style={{ width: 1, flex: 1, minHeight: 24, background: '#e5e7eb', marginTop: 4 }} />}
      </div>

      <div style={{ flex: 1, padding: '16px 0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ ...mono, fontSize: 8, color: '#fff', background: '#f59e0b', padding: '1px 6px', borderRadius: 4, letterSpacing: '0.08em' }}>
            Product
          </span>
          <span style={{ ...mono, fontSize: 8, color: '#f59e0b', border: '1px solid #f59e0b33', padding: '1px 6px', borderRadius: 8 }}>
            {PRODUCT_TYPE_LABELS[product.productType] || product.productType}
          </span>
          <span style={{ ...mono, fontSize: 10, color: '#f59e0b', fontWeight: 700 }}>
            ¥{product.productPrice.toLocaleString()}
          </span>
          {product.showAiBadge && (
            <span style={{
              ...mono, fontSize: 7, color: '#fff', background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              padding: '2px 7px', borderRadius: 10, fontWeight: 700,
              letterSpacing: '0.06em', boxShadow: '0 1px 3px #f59e0b44',
            }}>
              AI鑑定
            </span>
          )}
          {/* Author name = bookmark action */}
          <button
            onClick={() => onBookmark(product.id)}
            title={isBookmarked ? 'ブックマーク済み' : 'ブックマークする'}
            style={{
              ...mono, fontSize: 9, cursor: 'pointer',
              color: isBookmarked ? '#7c3aed' : '#9ca3af',
              background: isBookmarked ? '#ede9fe' : 'transparent',
              border: 'none', padding: '1px 6px', borderRadius: 8,
              display: 'flex', alignItems: 'center', gap: 3,
            }}
          >
            📖 {product.authorName}
          </button>
        </div>

        <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'Noto Serif JP, serif', color: '#1a1a1a', marginBottom: 6, lineHeight: 1.5 }}>
          {product.title}
        </div>

        {product.productDescription && (
          <div style={{
            fontSize: 13, color: '#6b7280', fontFamily: 'Noto Serif JP, serif', lineHeight: 1.8,
            marginBottom: 8, background: '#f8f9fa', padding: '8px 12px', borderRadius: 6, borderLeft: '3px solid #e5e7eb',
          }}>
            <span style={{ fontSize: 9, fontFamily: "'Space Mono', monospace", color: '#9ca3af', letterSpacing: '.08em', display: 'block', marginBottom: 4 }}>
              AI SUMMARY
            </span>
            {product.productDescription}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <button
            onClick={() => onBookmark(product.id)}
            style={{
              ...mono, fontSize: 9, cursor: 'pointer',
              background: 'transparent', border: 'none',
              color: isBookmarked ? '#f59e0b' : '#9ca3af',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            📖 {product.bookmarkCount}
          </button>

          {product.productExternalUrl && (
            <a href={product.productExternalUrl} target="_blank" rel="noopener noreferrer"
              style={{
                ...mono, fontSize: 9, letterSpacing: '0.08em',
                color: '#f59e0b', textDecoration: 'none',
                padding: '3px 10px', border: '1px solid #fde68a', borderRadius: 4,
              }}>
              購入する →
            </a>
          )}

          {product.authorId && (
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/kokoro-messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'greet', recipientId: product.authorId }),
                  });
                  const data = await res.json();
                  if (data.error) {
                    if (res.status === 409) window.location.href = '/kokoro-messages';
                    else alert(data.error);
                    return;
                  }
                  window.location.href = '/kokoro-messages';
                } catch { alert('送信に失敗しました'); }
              }}
              style={{
                ...mono, fontSize: 8, letterSpacing: '0.06em',
                color: '#7c3aed', background: 'transparent',
                padding: '3px 8px', border: '1px solid #ede9fe', borderRadius: 4, cursor: 'pointer',
              }}
            >
              挨拶を送る
            </button>
          )}

          {product.tags?.slice(0, 3).map(tag => (
            <span key={tag} style={{ ...mono, fontSize: 8, color: '#9ca3af', background: '#f3f4f6', padding: '1px 6px', borderRadius: 8 }}>{tag}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Bookmark Viewer ─── */
function BookmarkViewer({
  entries, categories, search, onSearchChange,
  loading, organizing,
  selectedMajor, selectedMinor,
  onSelectMajor, onSelectMinor,
  onOrganize, onClose,
}: {
  entries: BmEntry[];
  categories: BmCategory[];
  search: string;
  onSearchChange: (v: string) => void;
  loading: boolean;
  organizing: boolean;
  selectedMajor: string | null;
  selectedMinor: string | null;
  onSelectMajor: (v: string | null) => void;
  onSelectMinor: (v: string | null) => void;
  onOrganize: () => void;
  onClose: () => void;
}) {
  const catMap = useMemo(() => {
    const m: Record<string, BmCategory> = {};
    categories.forEach(c => { m[c.noteId] = c; });
    return m;
  }, [categories]);

  const enriched = useMemo(() =>
    entries.map(e => ({
      ...e,
      major: catMap[e.noteId]?.major || '未分類',
      minor: catMap[e.noteId]?.minor || 'その他',
    })),
    [entries, catMap]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return enriched;
    const q = search.toLowerCase();
    return enriched.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.authorName.toLowerCase().includes(q) ||
      e.major.toLowerCase().includes(q) ||
      e.minor.toLowerCase().includes(q)
    );
  }, [enriched, search]);

  const majors = useMemo(() => [...new Set(filtered.map(e => e.major))].sort(), [filtered]);

  const minorsForMajor = useMemo(() => {
    if (!selectedMajor) return [];
    return [...new Set(filtered.filter(e => e.major === selectedMajor).map(e => e.minor))].sort();
  }, [filtered, selectedMajor]);

  const itemsForMinor = useMemo(() => {
    if (!selectedMajor) return filtered;
    let list = filtered.filter(e => e.major === selectedMajor);
    if (selectedMinor) list = list.filter(e => e.minor === selectedMinor);
    return list;
  }, [filtered, selectedMajor, selectedMinor]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center',
    }}>
      <div style={{
        width: '90vw', maxWidth: 900, height: '80vh',
        background: '#fff', borderRadius: 12, display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px', borderBottom: '1px solid #e5e7eb',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18 }}>📖</span>
            <span style={{ ...mono, fontSize: 13, fontWeight: 700, letterSpacing: '.06em' }}>Bookmarks</span>
            <span style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>
              {entries.length} 件
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={onOrganize} disabled={organizing || entries.length === 0} title="AIでブックマークを整理"
              style={{
                ...mono, fontSize: 9, letterSpacing: '.1em',
                color: organizing ? '#9ca3af' : '#7c3aed',
                background: organizing ? '#f3f4f6' : '#ede9fe',
                border: 'none', borderRadius: 4, padding: '6px 14px',
                cursor: organizing ? 'not-allowed' : 'pointer',
              }}>
              {organizing ? '整理中...' : 'AIで整理する'}
            </button>
            <button onClick={onClose} title="閉じる"
              style={{ ...mono, fontSize: 14, color: '#9ca3af', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
              ×
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid #f3f4f6' }}>
          <input
            type="text" value={search} onChange={e => onSearchChange(e.target.value)}
            placeholder="ブックマークを検索..."
            style={{
              width: '100%', padding: '8px 12px', fontSize: 13,
              border: '1px solid #e5e7eb', borderRadius: 6,
              outline: 'none', color: '#1a1a1a', boxSizing: 'border-box',
              fontFamily: "'Noto Serif JP', serif",
            }}
          />
        </div>

        {/* Body */}
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ ...mono, fontSize: 10, color: '#9ca3af' }}>読み込み中...</span>
          </div>
        ) : entries.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ ...mono, fontSize: 10, color: '#9ca3af' }}>ブックマークはまだありません</span>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Column 1: 大ジャンル */}
            <div style={{
              width: 180, borderRight: '1px solid #e5e7eb', overflowY: 'auto',
              padding: '12px 0', flexShrink: 0,
            }}>
              <div style={{ ...mono, fontSize: 8, color: '#9ca3af', padding: '0 16px', marginBottom: 8, letterSpacing: '.14em' }}>
                // 大ジャンル
              </div>
              <button
                onClick={() => { onSelectMajor(null); onSelectMinor(null); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 16px', border: 'none', cursor: 'pointer',
                  ...mono, fontSize: 11,
                  background: !selectedMajor ? '#ede9fe' : 'transparent',
                  color: !selectedMajor ? '#7c3aed' : '#6b7280',
                }}
              >
                すべて ({filtered.length})
              </button>
              {majors.map(m => {
                const count = filtered.filter(e => e.major === m).length;
                return (
                  <button
                    key={m}
                    onClick={() => { onSelectMajor(m); onSelectMinor(null); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 16px', border: 'none', cursor: 'pointer',
                      ...mono, fontSize: 11,
                      background: selectedMajor === m ? '#ede9fe' : 'transparent',
                      color: selectedMajor === m ? '#7c3aed' : '#6b7280',
                    }}
                  >
                    {m} ({count})
                  </button>
                );
              })}
            </div>

            {/* Column 2: 小ジャンル */}
            <div style={{
              width: 180, borderRight: '1px solid #e5e7eb', overflowY: 'auto',
              padding: '12px 0', flexShrink: 0,
            }}>
              <div style={{ ...mono, fontSize: 8, color: '#9ca3af', padding: '0 16px', marginBottom: 8, letterSpacing: '.14em' }}>
                // 小ジャンル
              </div>
              {!selectedMajor ? (
                <div style={{ ...mono, fontSize: 9, color: '#d1d5db', padding: '8px 16px' }}>
                  大ジャンルを選択
                </div>
              ) : (
                minorsForMajor.map(m => {
                  const count = filtered.filter(e => e.major === selectedMajor && e.minor === m).length;
                  return (
                    <button
                      key={m}
                      onClick={() => onSelectMinor(selectedMinor === m ? null : m)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 16px', border: 'none', cursor: 'pointer',
                        ...mono, fontSize: 11,
                        background: selectedMinor === m ? '#ede9fe' : 'transparent',
                        color: selectedMinor === m ? '#7c3aed' : '#6b7280',
                      }}
                    >
                      {m} ({count})
                    </button>
                  );
                })
              )}
            </div>

            {/* Column 3: Items */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              <div style={{ ...mono, fontSize: 8, color: '#9ca3af', marginBottom: 8, letterSpacing: '.14em' }}>
                // {itemsForMinor.length} 件
              </div>
              {itemsForMinor.length === 0 ? (
                <div style={{ ...mono, fontSize: 10, color: '#d1d5db', padding: '20px 0', textAlign: 'center' }}>
                  該当するブックマークはありません
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {itemsForMinor.map(e => (
                    <div key={e.noteId} style={{
                      padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fafafa',
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 500, fontFamily: "'Noto Serif JP', serif", color: '#1a1a1a', marginBottom: 4 }}>
                        {e.title}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ ...mono, fontSize: 8, color: e.type === 'product' ? '#f59e0b' : e.type === 'web' ? '#3b82f6' : '#7c3aed', background: e.type === 'product' ? '#fef3c7' : e.type === 'web' ? '#dbeafe' : '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>
                          {e.type === 'product' ? 'Product' : e.type === 'web' ? 'Web' : 'Note'}
                        </span>
                        <span style={{ ...mono, fontSize: 8, color: '#9ca3af' }}>{e.type === 'web' ? e.authorName : `by ${e.authorName}`}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
