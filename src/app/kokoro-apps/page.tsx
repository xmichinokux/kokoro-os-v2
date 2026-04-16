'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/supabase/auth';

const mono = { fontFamily: "'Space Mono', monospace" } as const;
const accentColor = '#7c3aed';

type MiniApp = {
  id: string;
  title: string;
  createdAt: string;
  lastOpenedAt: string | null;
};

type SortKey = 'created' | 'lastOpened';

function formatRelative(iso: string | null): string {
  if (!iso) return '未起動';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return '今';
  const min = Math.floor(diff / 60000);
  if (min < 1) return '今';
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}日前`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon}ヶ月前`;
  return `${Math.floor(mon / 12)}年前`;
}

const TEST_APP_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Kokoro SDK Test</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 24px; max-width: 640px; margin: 0 auto; color: #1a1a1a; background: #f8f9fa; }
  h1 { font-size: 18px; letter-spacing: 0.06em; margin-bottom: 24px; }
  section { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  h2 { font-size: 13px; color: #7c3aed; margin: 0 0 10px; letter-spacing: 0.08em; }
  button { background: #7c3aed; color: #fff; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px; }
  button:hover { background: #6d28d9; }
  input { width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 13px; margin-bottom: 8px; box-sizing: border-box; }
  pre { background: #f3f4f6; padding: 10px; border-radius: 4px; font-size: 11px; overflow: auto; max-height: 200px; white-space: pre-wrap; word-break: break-all; margin: 8px 0 0; }
  select { padding: 6px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px; margin-right: 8px; }
</style>
</head>
<body>
  <h1>🧪 Kokoro SDK テストアプリ</h1>
  <p style="font-size:12px;color:#6b7280">window.kokoro.* が正しく動作するかを確認します。</p>

  <section>
    <h2>1. user.me() — 現在のユーザー</h2>
    <button onclick="showUser()">取得</button>
    <pre id="user">未実行</pre>
  </section>

  <section>
    <h2>2. notes.list() — ノート一覧（最新5件）</h2>
    <button onclick="listNotes()">取得</button>
    <pre id="notes">未実行</pre>
  </section>

  <section>
    <h2>3. llm.complete() — AI呼び出し</h2>
    <select id="model">
      <option value="haiku">Haiku（速い・安い）</option>
      <option value="sonnet">Sonnet（高精度）</option>
      <option value="gemini-flash">Gemini Flash（無料枠）</option>
    </select>
    <input id="prompt" value="こんにちは、と30字以内で挨拶してください" />
    <button onclick="askLLM()">送信</button>
    <pre id="llm">未実行</pre>
  </section>

  <section>
    <h2>4. notes.create() — ノート作成</h2>
    <input id="noteTitle" value="SDK Test Note" />
    <input id="noteBody" value="mini-app から作成されたテストノートです" />
    <button onclick="createNote()">作成</button>
    <pre id="createResult">未実行</pre>
  </section>

<script>
async function showUser() {
  var el = document.getElementById('user');
  try {
    var u = await window.kokoro.user.me();
    el.textContent = JSON.stringify(u, null, 2);
  } catch(e) { el.textContent = 'エラー: ' + e.message; }
}
async function listNotes() {
  var el = document.getElementById('notes');
  try {
    var notes = await window.kokoro.notes.list({ limit: 5 });
    el.textContent = JSON.stringify(notes.map(function(n){ return { id: n.id.slice(0,8), title: n.title, source: n.source }; }), null, 2);
  } catch(e) { el.textContent = 'エラー: ' + e.message; }
}
async function askLLM() {
  var el = document.getElementById('llm');
  el.textContent = '生成中...';
  try {
    var model = document.getElementById('model').value;
    var prompt = document.getElementById('prompt').value;
    var text = await window.kokoro.llm.complete({ prompt: prompt, model: model, maxTokens: 300 });
    el.textContent = text;
  } catch(e) { el.textContent = 'エラー: ' + e.message; }
}
async function createNote() {
  var el = document.getElementById('createResult');
  try {
    var title = document.getElementById('noteTitle').value;
    var body = document.getElementById('noteBody').value;
    var note = await window.kokoro.notes.create({ title: title, body: body, tags: ['sdk-test'] });
    el.textContent = JSON.stringify({ ok: true, id: note.id, title: note.title }, null, 2);
  } catch(e) { el.textContent = 'エラー: ' + e.message; }
}
</script>
</body>
</html>`;

export default function KokoroAppsListPage() {
  const [apps, setApps] = useState<MiniApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('lastOpened');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        setError('ログインが必要です');
        setLoading(false);
        return;
      }
      const { data, error: dbErr } = await supabase
        .from('notes')
        .select('id, title, created_at')
        .eq('user_id', userId)
        .eq('source', 'mini-app')
        .order('created_at', { ascending: false });
      if (dbErr) throw new Error(dbErr.message);
      setApps((data || []).map(r => {
        let lastOpenedAt: string | null = null;
        try { lastOpenedAt = localStorage.getItem('kokoro_app_lastOpened_' + r.id); } catch { /* ignore */ }
        return { id: r.id, title: r.title, createdAt: r.created_at, lastOpenedAt };
      }));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadApps(); }, [loadApps]);

  const createTestApp = useCallback(async () => {
    setCreating(true);
    try {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('ログインが必要です');
      const now = new Date().toISOString();
      const { error: dbErr } = await supabase.from('notes').insert({
        id: crypto.randomUUID(),
        user_id: userId,
        title: 'SDK テストアプリ',
        text: TEST_APP_HTML,
        source: 'mini-app',
        tags: ['mini-app', 'test'],
        is_public: false,
        created_at: now,
        updated_at: now,
      });
      if (dbErr) throw new Error(dbErr.message);
      await loadApps();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー');
    } finally {
      setCreating(false);
    }
  }, [loadApps]);

  const deleteApp = useCallback(async (id: string) => {
    if (!confirm('このアプリを削除しますか？')) return;
    try {
      const { error: dbErr } = await supabase.from('notes').delete().eq('id', id);
      if (dbErr) throw new Error(dbErr.message);
      try { localStorage.removeItem('kokoro_app_lastOpened_' + id); } catch { /* ignore */ }
      await loadApps();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー');
    }
  }, [loadApps]);

  const startRename = useCallback((app: MiniApp) => {
    setRenamingId(app.id);
    setRenameValue(app.title);
  }, []);

  const cancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameValue('');
  }, []);

  const saveRename = useCallback(async () => {
    if (!renamingId) return;
    const newTitle = renameValue.trim().slice(0, 200);
    if (!newTitle) { cancelRename(); return; }
    setRenameSaving(true);
    try {
      const { error: dbErr } = await supabase
        .from('notes')
        .update({ title: newTitle, updated_at: new Date().toISOString() })
        .eq('id', renamingId);
      if (dbErr) throw new Error(dbErr.message);
      setApps(prev => prev.map(a => a.id === renamingId ? { ...a, title: newTitle } : a));
      cancelRename();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラー');
    } finally {
      setRenameSaving(false);
    }
  }, [renamingId, renameValue, cancelRename]);

  const sortedApps = [...apps].sort((a, b) => {
    if (sortKey === 'lastOpened') {
      const aT = a.lastOpenedAt ? new Date(a.lastOpenedAt).getTime() : 0;
      const bT = b.lastOpenedAt ? new Date(b.lastOpenedAt).getTime() : 0;
      if (aT !== bT) return bT - aT;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#1a1a1a', fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 300 }}>
      <header style={{
        padding: '14px 28px', borderBottom: '1px solid #e5e7eb',
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 32, height: 32, border: `1px solid rgba(124,58,237,0.3)`,
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16,
          }}>📦</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: accentColor }}>Apps</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>
              mini-app runtime
            </span>
          </div>
        </div>
        <Link href="/" style={{ ...mono, fontSize: 9, color: '#6b7280', textDecoration: 'none' }}>← Home</Link>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 28px 100px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: accentColor, textTransform: 'uppercase' }}>
            // マイアプリ（{apps.length}）
          </div>
          <button
            onClick={createTestApp}
            disabled={creating}
            style={{
              ...mono, fontSize: 10, letterSpacing: '0.12em',
              background: accentColor, border: 'none', color: '#fff',
              padding: '10px 20px', borderRadius: 4, cursor: creating ? 'wait' : 'pointer',
              opacity: creating ? 0.5 : 1,
            }}
          >{creating ? '作成中...' : '🧪 テストアプリを追加'}</button>
        </div>

        {apps.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 4, background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, padding: 3 }}>
              <button onClick={() => setSortKey('lastOpened')} style={{
                ...mono, fontSize: 9, letterSpacing: '0.08em',
                background: sortKey === 'lastOpened' ? '#fff' : 'transparent',
                border: sortKey === 'lastOpened' ? '1px solid #d1d5db' : '1px solid transparent',
                color: sortKey === 'lastOpened' ? '#1a1a1a' : '#9ca3af',
                padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
              }}>最終実行順</button>
              <button onClick={() => setSortKey('created')} style={{
                ...mono, fontSize: 9, letterSpacing: '0.08em',
                background: sortKey === 'created' ? '#fff' : 'transparent',
                border: sortKey === 'created' ? '1px solid #d1d5db' : '1px solid transparent',
                color: sortKey === 'created' ? '#1a1a1a' : '#9ca3af',
                padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
              }}>作成日順</button>
            </div>
          </div>
        )}

        {error && (
          <div style={{ ...mono, fontSize: 10, color: '#ef4444', marginBottom: 16 }}>エラー: {error}</div>
        )}

        {loading ? (
          <div style={{ ...mono, fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: 40 }}>
            読み込み中...
          </div>
        ) : apps.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
            <div style={{ ...mono, fontSize: 11, letterSpacing: '0.1em' }}>
              まだアプリがありません
            </div>
            <div style={{ ...mono, fontSize: 9, marginTop: 8 }}>
              右上の「🧪 テストアプリを追加」で SDK 動作確認ができます
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {sortedApps.map(app => (
              <div key={app.id} style={{
                border: '1px solid #e5e7eb', borderRadius: 6, padding: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  {renamingId === app.id ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveRename();
                          else if (e.key === 'Escape') cancelRename();
                        }}
                        disabled={renameSaving}
                        style={{
                          flex: 1, fontSize: 14, padding: '6px 10px',
                          border: `1px solid ${accentColor}`, borderRadius: 4, outline: 'none',
                          fontFamily: "'Noto Sans JP', sans-serif", color: '#1a1a1a',
                        }}
                      />
                      <button onClick={saveRename} disabled={renameSaving || !renameValue.trim()} style={{
                        ...mono, fontSize: 9, letterSpacing: '0.1em',
                        background: accentColor, border: 'none', color: '#fff',
                        padding: '6px 10px', borderRadius: 3,
                        cursor: (renameSaving || !renameValue.trim()) ? 'not-allowed' : 'pointer',
                        opacity: (renameSaving || !renameValue.trim()) ? 0.5 : 1,
                      }}>{renameSaving ? '保存中' : '保存'}</button>
                      <button onClick={cancelRename} disabled={renameSaving} style={{
                        ...mono, fontSize: 9, letterSpacing: '0.1em',
                        background: 'transparent', border: '1px solid #d1d5db', color: '#6b7280',
                        padding: '6px 10px', borderRadius: 3, cursor: 'pointer',
                      }}>×</button>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 14, color: '#1a1a1a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, wordBreak: 'break-all' }}>
                        <span>{app.title}</span>
                        <button
                          onClick={() => startRename(app)}
                          title="リネーム"
                          style={{
                            ...mono, fontSize: 10, background: 'transparent', border: 'none',
                            color: '#9ca3af', cursor: 'pointer', padding: '2px 4px',
                          }}
                        >✎</button>
                      </div>
                      <div style={{ ...mono, fontSize: 9, color: '#9ca3af', letterSpacing: '0.08em', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <span>作成: {new Date(app.createdAt).toLocaleDateString('ja-JP')}</span>
                        <span style={{ color: app.lastOpenedAt ? '#6b7280' : '#d1d5db' }}>
                          最終起動: {formatRelative(app.lastOpenedAt)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                {renamingId !== app.id && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Link href={`/kokoro-apps/${app.id}`} style={{
                      ...mono, fontSize: 10, letterSpacing: '0.1em',
                      background: accentColor, color: '#fff', textDecoration: 'none',
                      padding: '8px 14px', borderRadius: 3,
                    }}>開く →</Link>
                    <button onClick={() => deleteApp(app.id)} style={{
                      ...mono, fontSize: 10, letterSpacing: '0.1em',
                      background: '#fff', border: '1px solid #fca5a5', color: '#ef4444',
                      padding: '7px 12px', borderRadius: 3, cursor: 'pointer',
                    }}>削除</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
