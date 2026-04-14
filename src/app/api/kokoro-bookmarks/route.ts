import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

// ブックマーク追加/削除（トグル）
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const { noteId } = await req.json() as { noteId: string };
    if (!noteId) {
      return NextResponse.json({ error: 'noteId が必要です' }, { status: 400 });
    }

    // 既存ブックマークを確認
    const { data: existing } = await supabase
      .from('bookmarks')
      .select('id')
      .eq('user_id', user.id)
      .eq('note_id', noteId)
      .single();

    if (existing) {
      // 削除（トグルオフ）
      await supabase.from('bookmarks').delete().eq('id', existing.id);
      return NextResponse.json({ bookmarked: false });
    } else {
      // 追加（トグルオン）
      const id = `bm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await supabase.from('bookmarks').insert({
        id,
        user_id: user.id,
        note_id: noteId,
        created_at: new Date().toISOString(),
      });
      return NextResponse.json({ bookmarked: true });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ブックマーク数取得 + 自分がブックマークしているか
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    const noteIds = req.nextUrl.searchParams.get('noteIds')?.split(',') || [];
    if (noteIds.length === 0) {
      return NextResponse.json({ bookmarks: {} });
    }

    // 各noteのブックマーク数を取得
    const result: Record<string, { count: number; isBookmarked: boolean }> = {};

    for (const noteId of noteIds.slice(0, 50)) {
      const { count } = await supabase
        .from('bookmarks')
        .select('*', { count: 'exact', head: true })
        .eq('note_id', noteId);

      let isBookmarked = false;
      if (user) {
        const { data } = await supabase
          .from('bookmarks')
          .select('id')
          .eq('user_id', user.id)
          .eq('note_id', noteId)
          .single();
        isBookmarked = !!data;
      }

      result[noteId] = { count: count ?? 0, isBookmarked };
    }

    return NextResponse.json({ bookmarks: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
