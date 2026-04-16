import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 15;

// Resonance探索をNoteとして保存・公開
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const { keyword, treeData, tags } = await req.json() as {
      keyword: string;
      treeData: unknown;
      tags: string[];
    };

    if (!keyword || !treeData) {
      return NextResponse.json({ error: 'キーワードとツリーデータが必要です' }, { status: 400 });
    }

    const id = `resonance_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    const { error } = await supabase.from('notes').insert({
      id,
      user_id: user.id,
      title: `🎵 ${keyword}`,
      text: JSON.stringify(treeData),
      source: 'resonance',
      tags: ['resonance', ...tags],
      is_public: true,
      created_at: now,
      updated_at: now,
    });

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, noteId: id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// 公開されたResonance Noteを取得
export async function GET() {
  try {
    const supabase = await createServerSupabase();

    const { data, error } = await supabase
      .from('notes')
      .select('id, user_id, title, text, tags, created_at')
      .eq('source', 'resonance')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw new Error(error.message);

    const userIds = [...new Set((data || []).map(n => n.user_id))];
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

    const notes = (data || []).map(n => ({
      id: n.id,
      title: n.title,
      treeData: (() => { try { return JSON.parse(n.text); } catch { return null; } })(),
      tags: (n.tags || []).filter((t: string) => t !== 'resonance'),
      authorName: displayNameMap[n.user_id] || '匿名',
      authorId: n.user_id,
      createdAt: n.created_at,
    }));

    return NextResponse.json({ notes });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
