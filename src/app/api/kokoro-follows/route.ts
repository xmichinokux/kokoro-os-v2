import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

// フォロートグル
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });

    const { targetUserId } = await req.json() as { targetUserId: string };
    if (!targetUserId) return NextResponse.json({ error: 'targetUserId が必要です' }, { status: 400 });
    if (targetUserId === user.id) return NextResponse.json({ error: '自分はフォローできません' }, { status: 400 });

    // 既存チェック
    const { data: existing } = await supabase
      .from('account_follows')
      .select('id')
      .eq('follower_id', user.id)
      .eq('following_id', targetUserId)
      .single();

    if (existing) {
      const { error: delErr } = await supabase.from('account_follows').delete().eq('id', existing.id);
      if (delErr) return NextResponse.json({ error: `削除エラー: ${delErr.message}` }, { status: 500 });
      return NextResponse.json({ following: false });
    } else {
      const { error: insErr } = await supabase.from('account_follows').insert({
        follower_id: user.id,
        following_id: targetUserId,
      });
      if (insErr) return NextResponse.json({ error: `フォロー保存エラー: ${insErr.message}` }, { status: 500 });
      return NextResponse.json({ following: true });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// フォロー状態チェック（複数ユーザー対応）
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ follows: {} });

    const userIds = req.nextUrl.searchParams.get('userIds')?.split(',') || [];
    if (userIds.length === 0) return NextResponse.json({ follows: {} });

    const { data } = await supabase
      .from('account_follows')
      .select('following_id')
      .eq('follower_id', user.id)
      .in('following_id', userIds.slice(0, 50));

    const follows: Record<string, boolean> = {};
    for (const uid of userIds) {
      follows[uid] = (data || []).some(f => f.following_id === uid);
    }

    return NextResponse.json({ follows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
