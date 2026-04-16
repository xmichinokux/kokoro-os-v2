'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/supabase/auth';
import { injectSdkIntoHtml } from '@/lib/kokoro-sdk/client';

const mono = { fontFamily: "'Space Mono', monospace" } as const;

type AppRow = {
  id: string;
  title: string;
  text: string;
};

type RuntimeError = {
  kind: string;
  message: string;
  stack: string;
  at: number;
};

export default function KokoroAppRuntimePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [app, setApp] = useState<AppRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [runtimeErrors, setRuntimeErrors] = useState<RuntimeError[]>([]);
  const [errorOpen, setErrorOpen] = useState(true);
  const [sdkCallLog, setSdkCallLog] = useState<{ method: string; ok: boolean; error?: string; at: number }[]>([]);

  // mini-app をロード
  useEffect(() => {
    (async () => {
      try {
        const { id } = await params;
        const userId = await getCurrentUserId();
        if (!userId) {
          setError('ログインが必要です');
          setLoading(false);
          return;
        }
        const { data, error: dbErr } = await supabase
          .from('notes')
          .select('id, title, text')
          .eq('id', id)
          .eq('user_id', userId)
          .eq('source', 'mini-app')
          .single();
        if (dbErr || !data) {
          setError('アプリが見つかりません');
          setLoading(false);
          return;
        }
        setApp(data as AppRow);
        setLoading(false);
        try { localStorage.setItem('kokoro_app_lastOpened_' + id, new Date().toISOString()); } catch { /* ignore */ }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'エラー');
        setLoading(false);
      }
    })();
  }, [params]);

  // postMessage ブリッジ: iframe からのリクエストを受けて Supabase/LLM を実行
  const dispatch = useCallback(async (method: string, args: Record<string, unknown>): Promise<unknown> => {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('未ログイン');

    switch (method) {
      case 'user.me': {
        const { data: { user } } = await supabase.auth.getUser();
        return { id: user?.id, email: user?.email };
      }
      case 'notes.list': {
        const tag = typeof args.tag === 'string' ? args.tag : null;
        const source = typeof args.source === 'string' ? args.source : null;
        const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200);
        let q = supabase
          .from('notes')
          .select('id, title, text, source, tags, created_at, updated_at, is_public')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (tag) q = q.contains('tags', [tag]);
        if (source) q = q.eq('source', source);
        const { data, error: e } = await q;
        if (e) throw new Error(e.message);
        return (data || []).map(r => ({
          id: r.id, title: r.title, body: r.text, source: r.source,
          tags: r.tags || [], createdAt: r.created_at, updatedAt: r.updated_at,
          isPublic: r.is_public ?? false,
        }));
      }
      case 'notes.get': {
        const id = String(args.id || '');
        if (!id) throw new Error('id が必要です');
        const { data, error: e } = await supabase
          .from('notes')
          .select('id, title, text, source, tags, created_at, updated_at, is_public')
          .eq('id', id)
          .eq('user_id', userId)
          .single();
        if (e || !data) throw new Error(e?.message || 'not found');
        return {
          id: data.id, title: data.title, body: data.text, source: data.source,
          tags: data.tags || [], createdAt: data.created_at, updatedAt: data.updated_at,
          isPublic: data.is_public ?? false,
        };
      }
      case 'notes.create': {
        const title = String(args.title || '').slice(0, 200);
        const body = String(args.body || '');
        const tags = Array.isArray(args.tags) ? args.tags.filter((t): t is string => typeof t === 'string').slice(0, 20) : [];
        const source = typeof args.source === 'string' ? args.source : 'mini-app-data';
        const now = new Date().toISOString();
        const newId = crypto.randomUUID();
        const { data, error: e } = await supabase.from('notes').insert({
          id: newId, user_id: userId, title: title || '(無題)', text: body,
          source, tags, is_public: false, created_at: now, updated_at: now,
        }).select('id, title, text, source, tags, created_at, updated_at').single();
        if (e) throw new Error(e.message);
        return {
          id: data.id, title: data.title, body: data.text, source: data.source,
          tags: data.tags || [], createdAt: data.created_at, updatedAt: data.updated_at,
        };
      }
      case 'notes.update': {
        const id = String(args.id || '');
        const patchRaw = args.patch as Record<string, unknown> || {};
        if (!id) throw new Error('id が必要です');
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (typeof patchRaw.title === 'string') update.title = patchRaw.title.slice(0, 200);
        if (typeof patchRaw.body === 'string') update.text = patchRaw.body;
        if (Array.isArray(patchRaw.tags)) update.tags = patchRaw.tags.filter((t): t is string => typeof t === 'string').slice(0, 20);
        const { data, error: e } = await supabase
          .from('notes').update(update)
          .eq('id', id).eq('user_id', userId)
          .select('id, title, text, source, tags, created_at, updated_at').single();
        if (e || !data) throw new Error(e?.message || 'update failed');
        return {
          id: data.id, title: data.title, body: data.text, source: data.source,
          tags: data.tags || [], createdAt: data.created_at, updatedAt: data.updated_at,
        };
      }
      case 'llm.complete': {
        const res = await fetch('/api/kokoro-sdk-llm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: String(args.prompt || ''),
            model: args.model,
            maxTokens: args.maxTokens,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || `LLM error (${res.status})`);
        return data.text as string;
      }
      default:
        throw new Error('Unknown method: ' + method);
    }
  }, []);

  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      const msg = e.data as {
        type?: string;
        id?: string;
        method?: string;
        args?: Record<string, unknown>;
        kind?: string;
        message?: string;
        stack?: string;
        at?: number;
      };
      if (!msg) return;
      const iframe = iframeRef.current;
      if (!iframe || e.source !== iframe.contentWindow) return;

      // Runtime error（mini-app内の window.onerror / unhandledrejection）
      if (msg.type === 'kokoro:runtime-error') {
        setRuntimeErrors(prev => [...prev, {
          kind: msg.kind || 'error',
          message: msg.message || '',
          stack: msg.stack || '',
          at: msg.at || Date.now(),
        }].slice(-20));
        setErrorOpen(true);
        return;
      }

      if (msg.type !== 'kokoro:request') return;
      const { id, method, args } = msg;
      if (!id || !method) return;
      try {
        const data = await dispatch(method, args || {});
        setSdkCallLog(prev => [...prev, { method, ok: true, at: Date.now() }].slice(-50));
        iframe.contentWindow?.postMessage({ type: 'kokoro:response', id, ok: true, data }, '*');
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        setSdkCallLog(prev => [...prev, { method, ok: false, error: errMsg, at: Date.now() }].slice(-50));
        setRuntimeErrors(prev => [...prev, {
          kind: 'sdk:' + method,
          message: errMsg,
          stack: '',
          at: Date.now(),
        }].slice(-20));
        setErrorOpen(true);
        iframe.contentWindow?.postMessage({ type: 'kokoro:response', id, ok: false, error: errMsg }, '*');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [dispatch]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', ...mono, fontSize: 12, color: '#6b7280' }}>
        読み込み中...
      </div>
    );
  }

  if (error || !app) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ ...mono, fontSize: 12, color: '#ef4444', marginBottom: 16 }}>
          {error || 'アプリを読み込めませんでした'}
        </div>
        <button onClick={() => router.push('/kokoro-apps')} style={{
          ...mono, fontSize: 10, letterSpacing: '0.12em',
          background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
          padding: '8px 16px', borderRadius: 4, cursor: 'pointer',
        }}>← アプリ一覧に戻る</button>
      </div>
    );
  }

  const injectedHtml = injectSdkIntoHtml(app.text);
  const errorCount = runtimeErrors.length;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#ffffff' }}>
      <header style={{
        padding: '10px 20px', borderBottom: '1px solid #e5e7eb',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
        flex: '0 0 auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/kokoro-apps" style={{ ...mono, fontSize: 10, color: '#6b7280', textDecoration: 'none' }}>
            ← アプリ
          </Link>
          <div style={{ ...mono, fontSize: 11, color: '#1a1a1a', letterSpacing: '0.08em' }}>
            {app.title}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {errorCount > 0 && (
            <button
              onClick={() => setErrorOpen(o => !o)}
              style={{
                ...mono, fontSize: 9, letterSpacing: '0.1em',
                background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626',
                padding: '4px 10px', borderRadius: 3, cursor: 'pointer',
              }}
            >⚠ {errorCount} error{errorCount > 1 ? 's' : ''}</button>
          )}
          <div style={{ ...mono, fontSize: 9, color: '#9ca3af', letterSpacing: '0.1em' }}>
            mini-app v0.1
          </div>
        </div>
      </header>

      {errorCount > 0 && errorOpen && (
        <div style={{
          flex: '0 0 auto',
          maxHeight: 200,
          overflowY: 'auto',
          background: '#fef2f2',
          borderBottom: '1px solid #fca5a5',
          padding: '10px 20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ ...mono, fontSize: 10, color: '#dc2626', fontWeight: 600, letterSpacing: '0.08em' }}>
              mini-app エラー ({errorCount}件)
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setRuntimeErrors([])}
                style={{
                  ...mono, fontSize: 8, background: '#fff', border: '1px solid #fca5a5', color: '#dc2626',
                  padding: '2px 8px', borderRadius: 2, cursor: 'pointer',
                }}
              >クリア</button>
              <button
                onClick={() => setErrorOpen(false)}
                style={{
                  ...mono, fontSize: 8, background: 'transparent', border: '1px solid transparent', color: '#9ca3af',
                  padding: '2px 6px', cursor: 'pointer',
                }}
              >✕</button>
            </div>
          </div>
          {runtimeErrors.slice().reverse().map((err, i) => (
            <div key={err.at + '-' + i} style={{
              ...mono, fontSize: 10, color: '#7f1d1d', padding: '4px 0',
              borderTop: i === 0 ? 'none' : '1px solid rgba(220,38,38,0.15)',
              lineHeight: 1.5, wordBreak: 'break-word',
            }}>
              <span style={{ color: '#dc2626', fontWeight: 600 }}>[{err.kind}]</span> {err.message}
              {err.stack && (
                <details style={{ marginTop: 2 }}>
                  <summary style={{ ...mono, fontSize: 9, color: '#991b1b', cursor: 'pointer' }}>stack</summary>
                  <pre style={{ ...mono, fontSize: 9, color: '#7f1d1d', whiteSpace: 'pre-wrap', margin: '4px 0 0', padding: '4px 8px', background: 'rgba(255,255,255,0.5)', borderRadius: 2 }}>{err.stack}</pre>
                </details>
              )}
            </div>
          ))}
          {sdkCallLog.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ ...mono, fontSize: 9, color: '#991b1b', cursor: 'pointer' }}>SDK call log ({sdkCallLog.length})</summary>
              <div style={{ marginTop: 4 }}>
                {sdkCallLog.slice().reverse().map((log, i) => (
                  <div key={log.at + '-' + i} style={{ ...mono, fontSize: 9, color: log.ok ? '#6b7280' : '#dc2626', lineHeight: 1.6 }}>
                    {log.ok ? '✓' : '✗'} {log.method}{log.error ? ' — ' + log.error : ''}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <iframe
        ref={iframeRef}
        srcDoc={injectedHtml}
        sandbox="allow-scripts"
        title={app.title}
        style={{ flex: '1 1 auto', width: '100%', border: 'none', background: '#fff' }}
      />
    </div>
  );
}
