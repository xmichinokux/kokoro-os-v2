'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function AuthPage() {
  const router = useRouter();
  const mono = { fontFamily: "'Space Mono', monospace" };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // すでにログイン済みならリダイレクト
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: unknown } }) => {
      if (session) router.replace('/');
    });
  }, [router]);

  const handleEmailAuth = async (mode: 'login' | 'signup') => {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError('');
    setMessage('');

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setError(error.message);
      } else {
        setMessage('確認メールを送信しました。メール内のリンクをクリックしてください。');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      } else {
        router.replace('/');
      }
    }
    setLoading(false);
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 380, padding: '0 24px' }}>

        {/* ロゴ */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: '#111827', letterSpacing: '.08em' }}>
            Kokoro <span style={{ color: '#7c3aed' }}>OS</span>
          </div>
          <div style={{ ...mono, fontSize: 9, color: '#9ca3af', letterSpacing: '.16em', marginTop: 6 }}>
            // ログイン
          </div>
        </div>

        {/* Google ログイン */}
        <button
          onClick={handleGoogleAuth}
          disabled={loading}
          style={{
            width: '100%', padding: '12px 16px',
            background: '#ffffff', border: '1px solid #d1d5db',
            borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            fontSize: 14, color: '#374151',
            fontFamily: "'Noto Sans JP', sans-serif",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Google でログイン
        </button>

        {/* 区切り線 */}
        <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0', gap: 12 }}>
          <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>または</span>
          <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
        </div>

        {/* メール・パスワード */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="メールアドレス"
            style={{
              width: '100%', padding: '10px 14px', fontSize: 13,
              border: '1px solid #d1d5db', borderRadius: 4,
              background: '#f8f9fa', color: '#111827', outline: 'none',
              fontFamily: "'Noto Sans JP', sans-serif", boxSizing: 'border-box',
            }}
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="パスワード"
            onKeyDown={e => e.key === 'Enter' && handleEmailAuth(isSignUp ? 'signup' : 'login')}
            style={{
              width: '100%', padding: '10px 14px', fontSize: 13,
              border: '1px solid #d1d5db', borderRadius: 4,
              background: '#f8f9fa', color: '#111827', outline: 'none',
              fontFamily: "'Noto Sans JP', sans-serif", boxSizing: 'border-box',
            }}
          />
        </div>

        {/* ログイン / 新規登録ボタン */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button
            onClick={() => { setIsSignUp(false); handleEmailAuth('login'); }}
            disabled={loading || !email.trim() || !password.trim()}
            style={{
              flex: 1, padding: '11px 0',
              background: !isSignUp ? '#7c3aed' : 'transparent',
              color: !isSignUp ? '#ffffff' : '#7c3aed',
              border: `1px solid #7c3aed`, borderRadius: 3,
              fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: "'Noto Sans JP', sans-serif",
            }}
          >
            ログイン
          </button>
          <button
            onClick={() => { setIsSignUp(true); handleEmailAuth('signup'); }}
            disabled={loading || !email.trim() || !password.trim()}
            style={{
              flex: 1, padding: '11px 0',
              background: isSignUp ? '#7c3aed' : 'transparent',
              color: isSignUp ? '#ffffff' : '#7c3aed',
              border: `1px solid #7c3aed`, borderRadius: 3,
              fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: "'Noto Sans JP', sans-serif",
            }}
          >
            新規登録
          </button>
        </div>

        {/* メッセージ表示 */}
        {error && (
          <div style={{ marginTop: 14, ...mono, fontSize: 11, color: '#ef4444', lineHeight: 1.6 }}>
            // {error}
          </div>
        )}
        {message && (
          <div style={{ marginTop: 14, ...mono, fontSize: 11, color: '#10b981', lineHeight: 1.6 }}>
            // {message}
          </div>
        )}

        {/* 戻る */}
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <button
            onClick={() => router.push('/')}
            style={{
              ...mono, fontSize: 9, color: '#9ca3af', background: 'transparent',
              border: 'none', cursor: 'pointer', letterSpacing: '.12em',
            }}
          >
            ← ログインせずに使う
          </button>
        </div>
      </div>
    </div>
  );
}
