import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 30;

// 商品一覧取得（Browser用）
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    const keywords = req.nextUrl.searchParams.get('keywords')?.split(',') || [];

    // 商品ノートを取得（is_product = true, is_public = true）
    let query = supabase
      .from('notes')
      .select('id, user_id, title, text, tags, source, created_at, is_product, product_price, product_description, product_external_url, product_type, author_name')
      .eq('is_product', true)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(20);

    const { data: products, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    if (!products || products.length === 0) {
      return NextResponse.json({ products: [] });
    }

    // キーワードフィルタリング（あれば）
    let filtered = products;
    if (keywords.length > 0 && keywords[0] !== '') {
      const kwLower = keywords.map(k => k.toLowerCase());
      filtered = products.filter(p => {
        const searchText = [
          p.title, p.text?.slice(0, 300), p.product_description,
          ...(p.tags || []),
        ].join(' ').toLowerCase();
        return kwLower.some(kw => searchText.includes(kw));
      });
    }

    // ブックマーク数を取得
    const noteIds = filtered.map(p => p.id);
    const bookmarkCounts: Record<string, number> = {};
    const myBookmarks: Set<string> = new Set();

    if (noteIds.length > 0) {
      // 全ブックマーク数
      for (const nid of noteIds) {
        const { count } = await supabase
          .from('bookmarks')
          .select('*', { count: 'exact', head: true })
          .eq('note_id', nid);
        bookmarkCounts[nid] = count ?? 0;
      }

      // 自分のブックマーク状態
      if (user) {
        const { data: myBms } = await supabase
          .from('bookmarks')
          .select('note_id')
          .eq('user_id', user.id)
          .in('note_id', noteIds);
        (myBms || []).forEach(bm => myBookmarks.add(bm.note_id));
      }
    }

    const result = filtered.map(p => ({
      id: p.id,
      title: p.title,
      body: p.text?.slice(0, 200),
      tags: p.tags || [],
      source: p.source,
      createdAt: p.created_at,
      authorName: p.author_name || '匿名',
      authorId: p.user_id,
      productPrice: p.product_price || 0,
      productDescription: p.product_description || '',
      productExternalUrl: p.product_external_url || '',
      productType: p.product_type || 'text',
      bookmarkCount: bookmarkCounts[p.id] || 0,
      isBookmarked: myBookmarks.has(p.id),
    }));

    return NextResponse.json({ products: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// 商品登録（Note を商品に変換）
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const {
      noteId, productPrice, productDescription, productExternalUrl, productType, authorName,
    } = await req.json() as {
      noteId: string;
      productPrice: number;
      productDescription: string;
      productExternalUrl: string;
      productType: string;
      authorName: string;
    };

    if (!noteId) {
      return NextResponse.json({ error: 'noteId が必要です' }, { status: 400 });
    }

    // ノートが自分のものか確認
    const { data: note } = await supabase
      .from('notes')
      .select('id, user_id')
      .eq('id', noteId)
      .eq('user_id', user.id)
      .single();

    if (!note) {
      return NextResponse.json({ error: 'ノートが見つかりません' }, { status: 404 });
    }

    // 商品フィールドを更新
    const { error } = await supabase
      .from('notes')
      .update({
        is_product: true,
        is_public: true,
        product_price: productPrice || 0,
        product_description: productDescription || '',
        product_external_url: productExternalUrl || '',
        product_type: productType || 'text',
        author_name: authorName || '匿名',
        updated_at: new Date().toISOString(),
      })
      .eq('id', noteId)
      .eq('user_id', user.id);

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
