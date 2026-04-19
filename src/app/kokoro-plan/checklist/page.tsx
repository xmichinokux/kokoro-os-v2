'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import PersonaLoading from '@/components/PersonaLoading';

type ChecklistItem = {
  id: string;
  text: string;
  createdAt: string;
  addedAfterForget: boolean; // 忘れたことで追加された項目は ★
};

type Scene = {
  id: string;
  name: string;
  items: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
};

type Store = { scenes: Scene[] };

const STORAGE_KEY = 'kokoro_checklist_v1';
const mono = { fontFamily: "'Space Mono', monospace" };
const accent = '#10b981';

function loadStore(): Store {
  if (typeof window === 'undefined') return { scenes: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { scenes: [] };
    const parsed = JSON.parse(raw) as Store;
    if (parsed && Array.isArray(parsed.scenes)) return parsed;
    return { scenes: [] };
  } catch {
    return { scenes: [] };
  }
}

function saveStore(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function newId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function ChecklistPage() {
  const [store, setStore] = useState<Store>({ scenes: [] });
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [newSceneName, setNewSceneName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [forgotInput, setForgotInput] = useState('');
  const [addingForgot, setAddingForgot] = useState(false);
  const [addManualInput, setAddManualInput] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setStore(loadStore());
  }, []);

  const persist = useCallback((next: Store) => {
    setStore(next);
    saveStore(next);
  }, []);

  const selectedScene = store.scenes.find(s => s.id === selectedSceneId);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  /* ─── 新規シーン生成 ─── */
  const handleCreateScene = useCallback(async () => {
    const name = newSceneName.trim();
    if (!name || generating) return;
    setGenerating(true);
    setError('');

    try {
      const res = await fetch('/api/kokoro-checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'generate', sceneName: name }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'リスト生成に失敗');

      const now = new Date().toISOString();
      const items: ChecklistItem[] = (data.items || []).map((t: string) => ({
        id: newId(),
        text: t,
        createdAt: now,
        addedAfterForget: false,
      }));
      const scene: Scene = {
        id: newId(),
        name,
        items,
        createdAt: now,
        updatedAt: now,
      };
      const next: Store = { scenes: [scene, ...store.scenes] };
      persist(next);
      setNewSceneName('');
      setSelectedSceneId(scene.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setGenerating(false);
    }
  }, [newSceneName, generating, store, persist]);

  /* ─── 「忘れた」ボタン ─── */
  const handleAddForgot = useCallback(async () => {
    if (!selectedScene) return;
    const forgot = forgotInput.trim();
    if (!forgot || addingForgot) return;
    setAddingForgot(true);
    setError('');

    try {
      const res = await fetch('/api/kokoro-checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'add',
          sceneName: selectedScene.name,
          existingItems: selectedScene.items.map(i => i.text),
          forgotItem: forgot,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || '追加に失敗');

      if (data.action === 'already_exists') {
        showToast(`既に「${data.matchedExisting || forgot}」があります`);
      } else {
        const text = data.normalizedItem || forgot;
        const now = new Date().toISOString();
        const newItem: ChecklistItem = {
          id: newId(),
          text,
          createdAt: now,
          addedAfterForget: true,
        };
        const updatedScene: Scene = {
          ...selectedScene,
          items: [...selectedScene.items, newItem],
          updatedAt: now,
        };
        const next: Store = {
          scenes: store.scenes.map(s => s.id === selectedScene.id ? updatedScene : s),
        };
        persist(next);
        showToast(`「${text}」を追加しました`);
      }
      setForgotInput('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setAddingForgot(false);
    }
  }, [selectedScene, forgotInput, addingForgot, store, persist]);

  /* ─── 手動追加 ─── */
  const handleAddManual = () => {
    if (!selectedScene) return;
    const text = addManualInput.trim();
    if (!text) return;
    const now = new Date().toISOString();
    const updatedScene: Scene = {
      ...selectedScene,
      items: [...selectedScene.items, {
        id: newId(), text, createdAt: now, addedAfterForget: false,
      }],
      updatedAt: now,
    };
    persist({ scenes: store.scenes.map(s => s.id === selectedScene.id ? updatedScene : s) });
    setAddManualInput('');
  };

  /* ─── 削除 ─── */
  const handleDeleteItem = (itemId: string) => {
    if (!selectedScene) return;
    const updatedScene: Scene = {
      ...selectedScene,
      items: selectedScene.items.filter(i => i.id !== itemId),
      updatedAt: new Date().toISOString(),
    };
    persist({ scenes: store.scenes.map(s => s.id === selectedScene.id ? updatedScene : s) });
  };

  const handleDeleteScene = () => {
    if (!selectedScene) return;
    if (!confirm(`「${selectedScene.name}」のチェックリストを削除しますか？`)) return;
    persist({ scenes: store.scenes.filter(s => s.id !== selectedScene.id) });
    setSelectedSceneId(null);
  };

  /* ─── チェック状態（セッション限定） ─── */
  const [checked, setChecked] = useState<Set<string>>(new Set());
  useEffect(() => {
    setChecked(new Set());
  }, [selectedSceneId]);

  const toggleCheck = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetChecks = () => setChecked(new Set());

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#374151' }}>
      <header style={{
        padding: '14px 24px', borderBottom: '1px solid #e5e7eb',
        position: 'sticky', top: 0, background: '#fff', zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link
            href="/kokoro-plan"
            style={{ ...mono, fontSize: 10, color: '#9ca3af', textDecoration: 'none' }}
          >
            ← Plan
          </Link>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: accent }}>Plan</span> <span style={{ color: '#9ca3af', fontWeight: 400 }}>/ 忘れ物チェック</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>
              忘れるたびに育つリスト
            </span>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 120px' }}>

        {/* シーン一覧 */}
        {!selectedScene && (
          <>
            <div style={{ ...mono, fontSize: 10, color: '#6b7280', lineHeight: 1.9, marginBottom: 20 }}>
              シーンごとにチェックリストを作ります。<br />
              最初は雑でいい。忘れるたびに、AI が追記して育てていきます。
            </div>

            {/* 新規作成 */}
            <div style={{ marginBottom: 28 }}>
              <label style={{ ...mono, fontSize: 8, letterSpacing: '.14em', color: '#9ca3af', display: 'block', marginBottom: 8 }}>
                // 新しいシーンを作る
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={newSceneName}
                  onChange={e => setNewSceneName(e.target.value)}
                  placeholder="例: 出勤 / 通院 / 一泊旅行 / 子どもの朝の送り出し"
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateScene(); }}
                  style={{
                    flex: 1, background: '#f8f9fa',
                    border: '1px solid #d1d5db', borderLeft: `2px solid ${accent}`,
                    borderRadius: '0 4px 4px 0',
                    padding: '10px 14px', fontSize: 13, color: '#111827',
                    outline: 'none', fontFamily: "'Noto Serif JP', serif",
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={handleCreateScene}
                  disabled={!newSceneName.trim() || generating}
                  style={{
                    ...mono, fontSize: 10, letterSpacing: '.14em',
                    color: !newSceneName.trim() || generating ? '#9ca3af' : '#fff',
                    background: !newSceneName.trim() || generating ? '#f3f4f6' : accent,
                    border: 'none', borderRadius: 4, padding: '10px 18px',
                    cursor: !newSceneName.trim() || generating ? 'not-allowed' : 'pointer',
                  }}
                >
                  {generating ? '...' : '作る'}
                </button>
              </div>
              {generating && <PersonaLoading />}
            </div>

            {/* 既存シーン一覧 */}
            {store.scenes.length > 0 ? (
              <>
                <label style={{ ...mono, fontSize: 8, letterSpacing: '.14em', color: '#9ca3af', display: 'block', marginBottom: 10 }}>
                  // あなたのシーン ({store.scenes.length})
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {store.scenes.map(s => {
                    const grown = s.items.filter(i => i.addedAfterForget).length;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelectedSceneId(s.id)}
                        style={{
                          textAlign: 'left', background: '#fafafa',
                          border: '1px solid #e5e7eb', borderRadius: 6,
                          padding: '14px 16px', cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = accent; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontSize: 15, fontFamily: "'Noto Serif JP', serif", color: '#111827' }}>
                            {s.name}
                          </span>
                          <span style={{ ...mono, fontSize: 9, color: '#9ca3af', marginLeft: 'auto' }}>
                            {s.items.length} 項目{grown > 0 ? ` · ★${grown}` : ''}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div style={{ ...mono, fontSize: 10, color: '#d1d5db', textAlign: 'center', padding: '40px 0' }}>
                // まだシーンがありません
              </div>
            )}
          </>
        )}

        {/* シーン詳細 */}
        {selectedScene && (
          <>
            <button
              onClick={() => setSelectedSceneId(null)}
              style={{
                ...mono, fontSize: 9, color: '#9ca3af',
                background: 'transparent', border: 'none', cursor: 'pointer',
                marginBottom: 12, padding: 0,
              }}
            >
              ← シーン一覧
            </button>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
              <h1 style={{
                fontSize: 22, fontWeight: 600, color: '#111827',
                fontFamily: "'Noto Serif JP', serif", margin: 0,
              }}>{selectedScene.name}</h1>
              <span style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>
                {selectedScene.items.length} 項目
              </span>
            </div>

            {/* チェックリスト */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 }}>
              {selectedScene.items.map(item => {
                const isChecked = checked.has(item.id);
                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 4,
                      background: isChecked ? '#f0fdf4' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                  >
                    <button
                      onClick={() => toggleCheck(item.id)}
                      style={{
                        width: 20, height: 20, borderRadius: 4,
                        border: `1.5px solid ${isChecked ? accent : '#d1d5db'}`,
                        background: isChecked ? accent : '#fff',
                        color: '#fff', fontSize: 12, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isChecked ? '✓' : ''}
                    </button>
                    <span
                      onClick={() => toggleCheck(item.id)}
                      style={{
                        flex: 1, fontSize: 14,
                        fontFamily: "'Noto Serif JP', serif",
                        color: isChecked ? '#9ca3af' : '#374151',
                        textDecoration: isChecked ? 'line-through' : 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {item.addedAfterForget && (
                        <span title="忘れて追加された項目" style={{ color: accent, marginRight: 4 }}>★</span>
                      )}
                      {item.text}
                    </span>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      title="削除"
                      style={{
                        ...mono, fontSize: 12, color: '#d1d5db',
                        background: 'transparent', border: 'none',
                        cursor: 'pointer', padding: '0 4px',
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>

            {/* チェック操作 */}
            {checked.size > 0 && (
              <button
                onClick={resetChecks}
                style={{
                  ...mono, fontSize: 9, letterSpacing: '.1em',
                  color: '#9ca3af', background: 'transparent',
                  border: '1px solid #e5e7eb',
                  padding: '6px 12px', borderRadius: 3, cursor: 'pointer',
                  marginBottom: 16,
                }}
              >
                チェックをリセット
              </button>
            )}

            {/* 忘れた → 追記 */}
            <div style={{
              marginTop: 16, padding: '14px 16px',
              background: '#fafafa', border: `1px solid ${accent}30`,
              borderLeft: `3px solid ${accent}`,
              borderRadius: '0 6px 6px 0',
            }}>
              <div style={{ ...mono, fontSize: 8, letterSpacing: '.14em', color: accent, marginBottom: 8 }}>
                // 忘れた？ 教えてくれたらリストが育ちます
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={forgotInput}
                  onChange={e => setForgotInput(e.target.value)}
                  placeholder="今日忘れたものを一言で（例: 充電ケーブル）"
                  onKeyDown={e => { if (e.key === 'Enter') handleAddForgot(); }}
                  style={{
                    flex: 1, background: '#fff',
                    border: '1px solid #e5e7eb', borderRadius: 4,
                    padding: '8px 12px', fontSize: 13, color: '#111827',
                    outline: 'none', fontFamily: "'Noto Serif JP', serif",
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={handleAddForgot}
                  disabled={!forgotInput.trim() || addingForgot}
                  style={{
                    ...mono, fontSize: 10, letterSpacing: '.14em',
                    color: !forgotInput.trim() || addingForgot ? '#9ca3af' : '#fff',
                    background: !forgotInput.trim() || addingForgot ? '#f3f4f6' : accent,
                    border: 'none', borderRadius: 4, padding: '8px 16px',
                    cursor: !forgotInput.trim() || addingForgot ? 'not-allowed' : 'pointer',
                  }}
                >
                  {addingForgot ? '...' : '追加'}
                </button>
              </div>
            </div>

            {/* 手動追加 */}
            <details style={{ marginTop: 16 }}>
              <summary style={{ ...mono, fontSize: 9, color: '#9ca3af', cursor: 'pointer', letterSpacing: '.1em' }}>
                // 手動で追加する
              </summary>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  type="text"
                  value={addManualInput}
                  onChange={e => setAddManualInput(e.target.value)}
                  placeholder="項目名"
                  onKeyDown={e => { if (e.key === 'Enter') handleAddManual(); }}
                  style={{
                    flex: 1, background: '#fff',
                    border: '1px solid #e5e7eb', borderRadius: 4,
                    padding: '8px 12px', fontSize: 13, color: '#111827',
                    outline: 'none', fontFamily: "'Noto Serif JP', serif",
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={handleAddManual}
                  disabled={!addManualInput.trim()}
                  style={{
                    ...mono, fontSize: 10,
                    color: !addManualInput.trim() ? '#9ca3af' : '#6b7280',
                    background: 'transparent',
                    border: `1px solid ${!addManualInput.trim() ? '#e5e7eb' : '#d1d5db'}`,
                    borderRadius: 4, padding: '8px 14px',
                    cursor: !addManualInput.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  追加
                </button>
              </div>
            </details>

            {/* シーン削除 */}
            <div style={{ marginTop: 40, paddingTop: 16, borderTop: '1px dashed #e5e7eb' }}>
              <button
                onClick={handleDeleteScene}
                style={{
                  ...mono, fontSize: 8, letterSpacing: '.14em',
                  color: '#d1d5db', background: 'transparent',
                  border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                このシーンを削除
              </button>
            </div>
          </>
        )}

        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)',
            background: '#111827', color: '#fff',
            padding: '10px 20px', borderRadius: 20,
            ...mono, fontSize: 11, letterSpacing: '.06em',
            zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}>
            {toast}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 16, ...mono, fontSize: 11, color: '#f97316' }}>
            // エラー: {error}
          </div>
        )}
      </div>
    </div>
  );
}
