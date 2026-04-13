'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState('認証を確認中...');

  useEffect(() => {
    // onAuthStateChangeでセッション確立を検知
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        router.replace('/');
      }
    });

    // フォールバック: 一定時間後にセッション確認
    const timeout = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace('/');
      } else {
        setStatus('認証に失敗しました。もう一度お試しください。');
        setTimeout(() => router.replace('/auth'), 3000);
      }
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
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
