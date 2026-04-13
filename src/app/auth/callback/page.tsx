'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState('認証を確認中...');

  useEffect(() => {
    const handleCallback = async () => {
      // PKCE flow: ?code=xxx
      const code = searchParams.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setStatus(`エラー: ${error.message}`);
          setTimeout(() => router.replace('/auth'), 3000);
          return;
        }
        router.replace('/');
        return;
      }

      // Hash flow / 自動検出: getSessionで確認
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace('/');
        return;
      }

      // 少し待ってリトライ
      await new Promise(r => setTimeout(r, 1500));
      const { data: { session: retry } } = await supabase.auth.getSession();
      if (retry) {
        router.replace('/');
      } else {
        setStatus('認証に失敗しました。もう一度お試しください。');
        setTimeout(() => router.replace('/auth'), 3000);
      }
    };

    handleCallback();
  }, [router, searchParams]);

  return (
    <div style={{
      fontFamily: "'Space Mono', monospace",
      fontSize: 13, color: '#7c3aed', letterSpacing: '.1em',
    }}>
      // {status}
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#ffffff',
    }}>
      <Suspense fallback={
        <div style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 13, color: '#7c3aed', letterSpacing: '.1em',
        }}>
          // 認証を確認中...
        </div>
      }>
        <CallbackHandler />
      </Suspense>
    </div>
  );
}
