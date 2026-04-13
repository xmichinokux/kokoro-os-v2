'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

/**
 * Supabase認証コールバックページ
 *
 * メール確認リンクやOAuthリダイレクトからここに飛ぶ。
 * URLのハッシュフラグメントやクエリパラメータからセッションを取得し、
 * トップページにリダイレクトする。
 */
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Supabaseクライアントが自動的にURLからトークンを検出してセッションを設定する
    supabase.auth.onAuthStateChange((event: string) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        router.replace('/');
      }
    });

    // フォールバック: 3秒後にまだここにいたらトップに飛ばす
    const timer = setTimeout(() => router.replace('/'), 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#ffffff',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 13, color: '#7c3aed', letterSpacing: '.1em',
        }}>
          // 認証を確認中...
        </div>
      </div>
    </div>
  );
}
