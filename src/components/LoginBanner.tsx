'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';

/**
 * 未ログイン時に表示するバナー。
 * ログイン済みなら何も表示しない。
 */
export default function LoginBanner({ message }: { message?: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: unknown } }) => {
      setShow(!session);
    });
  }, []);

  if (!show) return null;

  return (
    <div style={{
      background: '#fffbeb', border: '1px solid #fde68a',
      borderRadius: 6, padding: '10px 16px', marginBottom: 16,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
        {message || 'ログインするとデータがクラウドに保存されます。'}
      </span>
      <Link
        href="/auth"
        style={{
          fontSize: 11, color: '#7c3aed', border: '1px solid #7c3aed',
          borderRadius: 3, padding: '4px 12px', background: 'transparent',
          textDecoration: 'none', whiteSpace: 'nowrap',
          fontFamily: "'Space Mono', monospace",
        }}
      >
        ログイン
      </Link>
    </div>
  );
}
