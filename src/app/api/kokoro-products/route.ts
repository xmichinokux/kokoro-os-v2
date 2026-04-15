import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 30;

/* ─── AI要約生成 ─── */
async function generateAiSummary(text: string, title: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !text) return '';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `以下のテキストの内容を1〜2文で要約してください。具体的な内容には踏み込まず、「何について書かれているか」だけを伝えてください。要約のみを返してください。

タイトル：${title}
本文：${text.slice(0, 1000)}`,
        }],
      }),
    });

    if (!res.ok) return '';
    const data = await res.json();
    return data.content?.[0]?.text || '';
  } catch {
    return '';
  }
}

// 商品一覧取得（Browser用）
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    const keywords = req.nextUrl.searchParams.get('keywords')?.split(',') || [];

    // 商品ノートを取得（is_product = true, is_public = true）
    let query = supabase
      .from('notes')
      .select('id, user_id, title, tags, source, created_at, is_product, product_price, product_description, product_external_url, product_type, author_name, ai_priced_amount, show_ai_badge')
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
          p.title, p.product_description,
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

    // ユーザーのdisplay_nameを取得
    const userIds = [...new Set(filtered.map(p => p.user_id))];
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

    const result = filtered.map(p => ({
      id: p.id,
      title: p.title,
      body: p.product_description || undefined, // 生テキストは返さない。AI要約 or 商品説明のみ
      tags: p.tags || [],
      source: p.source,
      createdAt: p.created_at,
      authorName: displayNameMap[p.user_id] || '匿名',
      authorId: p.user_id,
      productPrice: p.product_price || 0,
      productDescription: p.product_description || '',
      productExternalUrl: p.product_external_url || '',
      productType: p.product_type || 'text',
      bookmarkCount: bookmarkCounts[p.id] || 0,
      isBookmarked: myBookmarks.has(p.id),
      aiPricedAmount: p.ai_priced_amount || undefined,
      showAiBadge: p.show_ai_badge || false,
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
      noteId, productPrice, productDescription, productExternalUrl, productType,
      aiPricedAmount, showAiBadge,
    } = await req.json() as {
      noteId: string;
      productPrice: number;
      productDescription: string;
      productExternalUrl: string;
      productType: string;
      aiPricedAmount?: number;
      showAiBadge?: boolean;
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

    // AI要約を生成（ユーザーが商品説明を書いていない場合）
    let finalDescription = productDescription || '';
    if (!finalDescription) {
      // ノートの本文を取得して要約
      const { data: fullNote } = await supabase
        .from('notes')
        .select('text, title')
        .eq('id', noteId)
        .single();
      if (fullNote?.text) {
        const summary = await generateAiSummary(fullNote.text, fullNote.title || '');
        if (summary) {
          finalDescription = summary;
        }
      }
    }

    // 商品フィールドを更新
    const { error } = await supabase
      .from('notes')
      .update({
        is_product: true,
        is_public: true,
        product_price: productPrice || 0,
        product_description: finalDescription,
        product_external_url: productExternalUrl || '',
        product_type: productType || 'text',
        // author_name はアカウントの display_name から自動取得
        ai_priced_amount: aiPricedAmount || null,
        show_ai_badge: showAiBadge || false,
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
