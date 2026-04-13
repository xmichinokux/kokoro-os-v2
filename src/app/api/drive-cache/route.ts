import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ cache: null });
    }

    const { data } = await supabase
      .from('user_profiles')
      .select('sensibility_cache, sensibility_updated_at, sensibility_file_count')
      .eq('user_id', user.id)
      .single();

    return NextResponse.json({
      cache: data?.sensibility_cache || null,
      updatedAt: data?.sensibility_updated_at || null,
      fileCount: data?.sensibility_file_count || 0,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
