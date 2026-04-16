import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ bookmarks: [] });
    }

    const { data: bms, error } = await supabase
      .from('bookmarks')
      .select('id, note_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);
    if (!bms || bms.length === 0) {
      return NextResponse.json({ bookmarks: [] });
    }

    const noteIds = bms.map(b => b.note_id);

    const { data: notes } = await supabase
      .from('notes')
      .select('id, title, user_id, is_product, author_name')
      .in('id', noteIds);

    const userIds = [...new Set((notes || []).map(n => n.user_id))];
    const displayNameMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, display_name')
        .in('user_id', userIds);
      (profiles || []).forEach(p => {
        if (p.display_name) displayNameMap[p.user_id] = p.display_name;
      });
    }

    const noteMap: Record<string, { title: string; authorName: string; type: 'note' | 'product' }> = {};
    (notes || []).forEach(n => {
      noteMap[n.id] = {
        title: n.title || '',
        authorName: displayNameMap[n.user_id] || n.author_name || '匿名',
        type: n.is_product ? 'product' : 'note',
      };
    });

    const bookmarks = bms
      .filter(b => noteMap[b.note_id])
      .map(b => ({
        noteId: b.note_id,
        title: noteMap[b.note_id].title,
        authorName: noteMap[b.note_id].authorName,
        type: noteMap[b.note_id].type,
        createdAt: b.created_at,
      }));

    return NextResponse.json({ bookmarks });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
