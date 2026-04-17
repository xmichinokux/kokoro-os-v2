import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// 全ユーザーの公開Note（商品除外）を取得
export async function GET() {
  try {
    const supabase = await createServerSupabase();

    const { data, error } = await supabase
      .from('notes')
      .select('id, user_id, title, text, tags, source, created_at, author_name')
      .eq('is_public', true)
      .or('is_product.is.null,is_product.eq.false')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw new Error(error.message);

    const notes = (data || []).map(n => ({
      id: n.id,
      title: n.title || '',
      body: (n.text || '').slice(0, 300),
      tags: n.tags || [],
      source: n.source || 'manual',
      createdAt: n.created_at,
      isPublic: true,
      authorLabel: n.author_name || undefined,
      authorId: n.user_id,
    }));

    return NextResponse.json({ notes });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
