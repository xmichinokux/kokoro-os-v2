import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { KokoroValueEngine } from '@/lib/kokoro/valueEngine';
import { PROFILE_FIELDS } from '@/lib/profileTypes';

export const maxDuration = 30;

type CoupleTab = 'consult' | 'gift' | 'date';

const BUDGET_LABELS: Record<string, string> = {
  '1000': '〜1,000円',
  '3000': '〜3,000円',
  '5000': '〜5,000円',
  '10000': '〜10,000円',
  '30000': '〜30,000円',
  '50000': '〜50,000円',
  'free': '予算なし',
};

const TAB_SYSTEMS: Record<CoupleTab, string> = {
  consult:
    'あなたはKokoro OSのCoupleアシスタントです。カップルの悩みや相談に寄り添い、関係をより良くするためのアドバイスをしてください。押しつけがましくなく、両者の気持ちを尊重しながら。二人のプロフィールとウィッシュリストから人物像を読み取り、それに基づいた具体的な助言をしてください。',
  gift:
    'あなたはKokoro OSのCoupleアシスタントです。二人のプロフィールとウィッシュリストを分析し、パートナーへのプレゼントを3つ提案してください。予算が指定されている場合はその範囲内で。理由・渡し方のコツも添えて。相手のウィッシュリストの内容は直接言わず、さりげなく反映すること。',
  date:
    'あなたはKokoro OSのCoupleアシスタントです。二人のプロフィールとウィッシュリストを分析し、デートプランを3つ提案してください。予算が指定されている場合はその範囲内で。具体的な内容と、なぜこのプランが二人に合うかも添えて。',
};

/* ─── ペアリングコード生成 ─── */
function generatePairCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'KKR-';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/* ─── プロフィール + Wishlist コンテキスト構築 ─── */
function buildPersonaContext(
  label: string,
  profile: Record<string, unknown> | null,
  wishlist: Array<Record<string, unknown>>
): string {
  const lines: string[] = [`[${label}のプロフィール]`];

  if (profile) {
    const fieldLabels: Record<string, string> = {
      p_name: '名前', p_age: '年代', p_gender: '性別',
      p_location: '地域', p_hobbies: '趣味',
      p_style: 'ファッション', p_food_pref: '好きな食べ物',
      p_work: '仕事', p_memo: 'メモ',
    };
    for (const [key, label] of Object.entries(fieldLabels)) {
      const val = profile[key];
      if (typeof val === 'string' && val.trim()) {
        lines.push(`${label}: ${val}`);
      }
    }
  }

  if (wishlist.length > 0) {
    lines.push('');
    lines.push(`[${label}のウィッシュリスト]`);
    wishlist.slice(0, 20).forEach(w => {
      const cat = w.category ? `(${w.category})` : '';
      lines.push(`- ${w.text} ${cat}`);
    });
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
  }

  // ─── ペアリングコード生成 ───
  if (action === 'generate_code') {
    const code = generatePairCode();

    // 既存ペアを解除
    await supabase.from('couple_pairs')
      .delete()
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);

    // 新しいコードを作成
    const { error } = await supabase.from('couple_pairs').insert({
      user_a: user.id,
      invite_code: code,
      status: 'pending',
    });

    if (error) {
      return NextResponse.json({ error: 'コード生成に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ code });
  }

  // ─── コード入力でペアリング ───
  if (action === 'join_code') {
    const { code } = body;
    if (!code) {
      return NextResponse.json({ error: 'コードを入力してください' }, { status: 400 });
    }

    const svc = createServiceSupabase();

    // コードを検索
    const { data: pair, error: findErr } = await svc
      .from('couple_pairs')
      .select('*')
      .eq('invite_code', code.toUpperCase().trim())
      .eq('status', 'pending')
      .single();

    if (findErr || !pair) {
      return NextResponse.json({ error: 'コードが見つかりません' }, { status: 404 });
    }

    if (pair.user_a === user.id) {
      return NextResponse.json({ error: '自分のコードは使えません' }, { status: 400 });
    }

    // 既存ペアを解除（自分側）
    await svc.from('couple_pairs')
      .delete()
      .neq('id', pair.id)
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);

    // ペアリング成立
    const { error: upErr } = await svc
      .from('couple_pairs')
      .update({ user_b: user.id, status: 'paired', paired_at: new Date().toISOString() })
      .eq('id', pair.id);

    if (upErr) {
      return NextResponse.json({ error: 'ペアリングに失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  // ─── ペアリング状態確認 ───
  if (action === 'check_pair') {
    const svc = createServiceSupabase();
    const { data: pair } = await svc
      .from('couple_pairs')
      .select('*')
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .eq('status', 'paired')
      .single();

    if (!pair) {
      // pendingコードがあるか確認
      const { data: pending } = await supabase
        .from('couple_pairs')
        .select('invite_code')
        .eq('user_a', user.id)
        .eq('status', 'pending')
        .single();

      return NextResponse.json({
        paired: false,
        pendingCode: pending?.invite_code || null,
      });
    }

    const partnerId = pair.user_a === user.id ? pair.user_b : pair.user_a;

    // パートナーの表示名を取得
    const { data: partnerProfile } = await svc
      .from('user_profiles')
      .select('display_name, p_name')
      .eq('user_id', partnerId)
      .single();

    return NextResponse.json({
      paired: true,
      partnerId,
      partnerName: partnerProfile?.display_name || partnerProfile?.p_name || '(パートナー)',
    });
  }

  // ─── ペアリング解除 ───
  if (action === 'unpair') {
    await supabase.from('couple_pairs')
      .delete()
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);

    return NextResponse.json({ success: true });
  }

  // ─── 提案生成 ───
  const { text, tab, budget } = body;

  const svc = createServiceSupabase();

  // ペア確認
  const { data: pair } = await svc
    .from('couple_pairs')
    .select('*')
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .eq('status', 'paired')
    .single();

  if (!pair) {
    return NextResponse.json({ error: 'パートナーとペアリングしてください' }, { status: 400 });
  }

  const partnerId = pair.user_a === user.id ? pair.user_b : pair.user_a;

  // 両者のプロフィール取得
  const [{ data: myProfile }, { data: partnerProfile }] = await Promise.all([
    svc.from('user_profiles').select('*').eq('user_id', user.id).single(),
    svc.from('user_profiles').select('*').eq('user_id', partnerId).single(),
  ]);

  // 両者のウィッシュリスト取得
  const [{ data: myWishlist }, { data: partnerWishlist }] = await Promise.all([
    svc.from('wishlists').select('text, category, intensity').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
    svc.from('wishlists').select('text, category, intensity').eq('user_id', partnerId).order('created_at', { ascending: false }).limit(20),
  ]);

  const myName = myProfile?.display_name || myProfile?.p_name || 'あなた';
  const partnerName = partnerProfile?.display_name || partnerProfile?.p_name || 'パートナー';

  const myContext = buildPersonaContext(myName, myProfile, myWishlist || []);
  const partnerContext = buildPersonaContext(partnerName, partnerProfile, partnerWishlist || []);

  const baseSystem = TAB_SYSTEMS[tab as CoupleTab] ?? TAB_SYSTEMS.consult;
  const valueInject = KokoroValueEngine.forCouple();
  const system = baseSystem + (valueInject ? '\n' + valueInject : '');

  let userContent = '';
  if (myContext) userContent += myContext + '\n\n';
  if (partnerContext) userContent += partnerContext + '\n\n';
  if (budget && budget !== 'free') {
    const budgetLabel = BUDGET_LABELS[budget] || `〜${Number(budget).toLocaleString()}円`;
    userContent += `【予算】${budgetLabel}\n\n`;
  }
  userContent += text;

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Anthropic API error');
    }

    const data = await res.json();
    const result = data.content[0].text as string;

    return NextResponse.json({ result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
