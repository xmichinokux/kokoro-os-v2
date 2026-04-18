'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  loadWishlist,
  deleteFromWishlist,
  saveToWishlist,
  CATEGORY_LABELS,
  INTENSITY_LABELS,
  type WishItem,
  type WishCategory,
  type WishIntensity,
} from '@/lib/wishlist';
import LoginBanner from '@/components/LoginBanner';

const mono = { fontFamily: "'Space Mono', monospace" };
const accentColor = '#7c3aed';

const INTENSITY_ORDER: Record<WishIntensity, number> = { now: 0, soon: 1, someday: 2 };
const INTENSITY_COLORS: Record<WishIntensity, { bg: string; text: string; border: string }> = {
  now:     { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
  soon:    { bg: '#fff7ed', text: '#ea580c', border: '#fed7aa' },
  someday: { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' },
};
const CATEGORY_EMOJIS: Record<WishCategory, string> = {
  fashion: '👔',
  food:    '🍳',
  place:   '📍',
  person:  '👥',
  thing:   '🎁',
  other:   '✨',
};

type CategoryFilter = WishCategory | 'all';
type SortMode = 'intensity' | 'date';

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

export default function KokoroWishlistPage() {
  const router = useRouter();

  const [items, setItems] = useState<WishItem[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('intensity');

  // 新規追加フォーム
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState<WishCategory>('other');
  const [newIntensity, setNewIntensity] = useState<WishIntensity>('someday');
  const [showAddForm, setShowAddForm] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const refresh = async () => setItems(await loadWishlist());

  useEffect(() => {
    refresh();
  }, []);

  const filteredSorted = useMemo(() => {
    let list = items;
    if (categoryFilter !== 'all') {
      list = list.filter((it) => it.category === categoryFilter);
    }
    const sorted = [...list];
    if (sortMode === 'intensity') {
      sorted.sort((a, b) => {
        const d = INTENSITY_ORDER[a.intensity] - INTENSITY_ORDER[b.intensity];
        if (d !== 0) return d;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
    } else {
      sorted.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return sorted;
  }, [items, categoryFilter, sortMode]);

  const handleDelete = async (id: number) => {
    if (!confirm('このウィッシュを削除しますか？')) return;
    await deleteFromWishlist(id);
    await refresh();
    showToast('削除しました');
  };

  const handleTalk = (item: WishItem) => {
    try {
      sessionStorage.setItem(
        'wishlistToTalk',
        JSON.stringify({ userText: item.text, category: item.category, intensity: item.intensity }),
      );
    } catch {
      /* ignore */
    }
    router.push('/kokoro-chat');
  };

  const handleAdd = async () => {
    const text = newText.trim();
    if (!text) return;
    const result = await saveToWishlist({
      text,
      category: newCategory,
      intensity: newIntensity,
      source: 'manual',
    });
    if (result) {
      await refresh();
      setNewText('');
      setNewCategory('other');
      setNewIntensity('someday');
      setShowAddForm(false);
      showToast('追加しました');
    } else {
      showToast('保存に失敗しました');
    }
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
            width: 32, height: 32, border: `1px solid rgba(236,72,153,0.3)`,
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(circle at 40% 40%,rgba(236,72,153,0.1) 0%,transparent 70%)',
            fontSize: 16,
          }}>⭐</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: accentColor }}>Wishlist</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>
              欲しい・行きたい・やってみたいを貯める
            </span>
          </div>
        </div>
        <div />
      </header>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '36px 28px 100px' }}>

        <LoginBanner message="ログインするとウィッシュリストがクラウドに保存されます。" />

        {/* 操作バー（フィルタ・ソート・追加） */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          {/* カテゴリフィルタ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af' }}>
              // カテゴリ
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
              style={{
                ...mono, fontSize: 11, padding: '7px 12px',
                border: '1px solid #e5e7eb', borderRadius: 4,
                background: '#fff', color: '#374151', cursor: 'pointer',
              }}
            >
              <option value="all">すべて</option>
              {(Object.keys(CATEGORY_LABELS) as WishCategory[]).map((c) => (
                <option key={c} value={c}>{CATEGORY_EMOJIS[c]} {CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          {/* ソート */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af' }}>
              // 並び替え
            </label>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              style={{
                ...mono, fontSize: 11, padding: '7px 12px',
                border: '1px solid #e5e7eb', borderRadius: 4,
                background: '#fff', color: '#374151', cursor: 'pointer',
              }}
            >
              <option value="intensity">強度順（now → someday）</option>
              <option value="date">追加日（新しい順）</option>
            </select>
          </div>

          <div style={{ flex: 1 }} />

          <button
            onClick={() => setShowAddForm((v) => !v)}
            title={showAddForm ? 'キャンセル' : '手動で追加'}
            style={{
              ...mono, fontSize: 10, letterSpacing: '.12em',
              color: showAddForm ? '#9ca3af' : accentColor,
              background: showAddForm ? '#f9fafb' : '#fff',
              border: `1px solid ${showAddForm ? '#e5e7eb' : 'rgba(236,72,153,0.4)'}`,
              padding: '8px 16px', borderRadius: 4, cursor: 'pointer',
              alignSelf: 'flex-end',
            }}
          >
            {showAddForm ? '×' : 'Wish +'}
          </button>
        </div>

        {/* 追加フォーム */}
        {showAddForm && (
          <div style={{
            border: `1px solid rgba(236,72,153,0.25)`, borderRadius: 8,
            padding: 20, marginBottom: 24, background: 'rgba(244,114,182,0.04)',
          }}>
            <label style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', display: 'block', marginBottom: 8 }}>
              // ウィッシュの内容
            </label>
            <input
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="例: 黒のロングコート / 京都の喫茶店 / 写真展に行く"
              style={{
                width: '100%', padding: '10px 14px', fontSize: 14,
                border: '1px solid #e5e7eb', borderRadius: 4,
                background: '#fff', color: '#1a1a1a', outline: 'none',
                fontFamily: 'inherit',
              }}
            />

            <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', display: 'block', marginBottom: 6 }}>
                  // カテゴリ
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as WishCategory)}
                  style={{
                    ...mono, fontSize: 11, padding: '7px 12px', width: '100%',
                    border: '1px solid #e5e7eb', borderRadius: 4,
                    background: '#fff', color: '#374151', cursor: 'pointer',
                  }}
                >
                  {(Object.keys(CATEGORY_LABELS) as WishCategory[]).map((c) => (
                    <option key={c} value={c}>{CATEGORY_EMOJIS[c]} {CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', display: 'block', marginBottom: 6 }}>
                  // 強度
                </label>
                <select
                  value={newIntensity}
                  onChange={(e) => setNewIntensity(e.target.value as WishIntensity)}
                  style={{
                    ...mono, fontSize: 11, padding: '7px 12px', width: '100%',
                    border: '1px solid #e5e7eb', borderRadius: 4,
                    background: '#fff', color: '#374151', cursor: 'pointer',
                  }}
                >
                  {(Object.keys(INTENSITY_LABELS) as WishIntensity[]).map((it) => (
                    <option key={it} value={it}>{INTENSITY_LABELS[it]}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleAdd}
              disabled={!newText.trim()}
              title="追加する"
              style={{
                ...mono, fontSize: 11, letterSpacing: '.12em',
                color: '#fff', background: newText.trim() ? accentColor : '#d1d5db',
                border: 'none', padding: '10px 20px', borderRadius: 4,
                cursor: newText.trim() ? 'pointer' : 'not-allowed',
                marginTop: 16,
              }}
            >
              Save ✓
            </button>
          </div>
        )}

        {/* 件数表示 */}
        <div style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', marginBottom: 16 }}>
          // {filteredSorted.length} 件
        </div>

        {/* リスト */}
        {filteredSorted.length === 0 ? (
          <div style={{
            border: '1px dashed #e5e7eb', borderRadius: 8, padding: 60,
            textAlign: 'center', color: '#9ca3af', fontSize: 13,
          }}>
            {items.length === 0
              ? 'まだウィッシュがありません。Talk で「〜したい」「〜が欲しい」と話すか、「+ 手動で追加」から登録できます。'
              : 'このカテゴリには該当する項目がありません。'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredSorted.map((it) => {
              const intColor = INTENSITY_COLORS[it.intensity];
              return (
                <div
                  key={it.id}
                  style={{
                    border: '1px solid #e5e7eb', borderRadius: 8,
                    padding: 18, background: '#fff',
                    display: 'flex', flexDirection: 'column', gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ fontSize: 22, lineHeight: 1 }}>
                      {CATEGORY_EMOJIS[it.category]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, color: '#111827', fontWeight: 500, lineHeight: 1.5, wordBreak: 'break-word' }}>
                        {it.text}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, alignItems: 'center' }}>
                        <span style={{
                          ...mono, fontSize: 8, letterSpacing: '.1em',
                          padding: '3px 8px', borderRadius: 3,
                          background: intColor.bg, color: intColor.text,
                          border: `1px solid ${intColor.border}`,
                        }}>
                          {INTENSITY_LABELS[it.intensity]}
                        </span>
                        <span style={{ ...mono, fontSize: 8, letterSpacing: '.1em', color: '#9ca3af' }}>
                          {CATEGORY_LABELS[it.category]}
                        </span>
                        <span style={{ ...mono, fontSize: 8, letterSpacing: '.1em', color: '#d1d5db' }}>
                          {formatDate(it.date)} // {it.source}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => handleTalk(it)}
                      title="Talkで話す"
                      style={{
                        ...mono, fontSize: 9, letterSpacing: '.1em',
                        color: '#7c3aed', background: 'transparent',
                        border: '1px solid rgba(124,58,237,0.3)',
                        padding: '5px 12px', borderRadius: 3, cursor: 'pointer',
                      }}
                    >
                      Talk →
                    </button>
                    <button
                      onClick={() => handleDelete(it.id)}
                      title="削除"
                      style={{
                        ...mono, fontSize: 9, letterSpacing: '.1em',
                        color: '#9ca3af', background: 'transparent',
                        border: '1px solid #e5e7eb',
                        padding: '5px 12px', borderRadius: 3, cursor: 'pointer',
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a1a', color: '#fff', padding: '10px 18px', borderRadius: 8,
          fontSize: 13, fontFamily: "'Noto Sans JP', sans-serif",
          boxShadow: '0 4px 12px rgba(0,0,0,0.18)', zIndex: 9999,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
