import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({
        writing: null, thought: null, structure: null, tripCache: null,
        updatedAt: {}, fileCount: {},
      });
    }

    const { data } = await supabase
      .from('user_profiles')
      .select(`
        sensibility_cache, sensibility_updated_at, sensibility_file_count,
        sensibility_thought_cache, sensibility_thought_updated_at, sensibility_thought_file_count,
        sensibility_structure_cache, sensibility_structure_updated_at, sensibility_structure_file_count,
        trip_cache, trip_updated_at, trip_file_count
      `)
      .eq('user_id', user.id)
      .single();

    return NextResponse.json({
      writing: data?.sensibility_cache || null,
      thought: data?.sensibility_thought_cache || null,
      structure: data?.sensibility_structure_cache || null,
      tripCache: data?.trip_cache || null,
      updatedAt: {
        writing: data?.sensibility_updated_at || null,
        thought: data?.sensibility_thought_updated_at || null,
        structure: data?.sensibility_structure_updated_at || null,
        trip: data?.trip_updated_at || null,
      },
      fileCount: {
        writing: data?.sensibility_file_count || 0,
        thought: data?.sensibility_thought_file_count || 0,
        structure: data?.sensibility_structure_file_count || 0,
        trip: data?.trip_file_count || 0,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
