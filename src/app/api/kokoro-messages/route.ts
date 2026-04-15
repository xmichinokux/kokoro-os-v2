import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 30;

// ── AI: 定型挨拶を生成 ──
async function generateGreeting(
  senderProfile: string,
  recipientProfile: string,
  apiKey: string,
): Promise<string> {
  const system = `あなたはKokoro OS「にゃんパスシティー」のAIメッセンジャーです。
2人のプロフィールを読み、送り手から受け手への最初の挨拶を1つだけ生成してください。

【ルール】
・丁寧で温かく、相手に敬意を持った文面
・共通点や相手の活動への関心に触れる
・2〜3文、80文字以内
・個人情報（本名・住所等）は含めない
・挨拶文のみを返す（JSON不要）`;

  const userMsg = `【送り手】\n${senderProfile}\n\n【受け手】\n${recipientProfile}`;

  let res: Response | null = null;
  for (let i = 0; i < 4; i++) {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });
    if (res.status !== 529) break;
    await new Promise(r => setTimeout(r, 2000 * Math.pow(1.5, i)));
  }
  if (!res || !res.ok) throw new Error('AI greeting generation failed');
  const data = await res.json();
  return (data.content[0].text as string).trim();
}

// ── AI: メッセージ精査・リライト ──
async function moderateMessage(
  text: string,
  apiKey: string,
): Promise<{ ok: boolean; rewritten: string; reason?: string }> {
  const system = `あなたはKokoro OS「にゃんパスシティー」のメッセージモデレーターです。
ユーザーが送ろうとしているメッセージを精査し、必要なら軽くリライトしてください。

【ルール】
・攻撃的、脅迫的、差別的、性的な内容 → rejected: true
・個人情報（電話番号、住所、LINE ID等）を含む → rejected: true
・過度に馴れ馴れしい表現 → 丁寧に修正
・内容の意図は変えない、表現だけ整える
・問題なければそのまま返す

以下のJSONのみを返してください:
{
  "rejected": true/false,
  "rewritten": "リライト後のメッセージ（rejectedの場合は空文字）",
  "reason": "拒否理由（rejectedの場合のみ）"
}`;

  let res: Response | null = null;
  for (let i = 0; i < 4; i++) {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system,
        messages: [{ role: 'user', content: text }],
      }),
    });
    if (res.status !== 529) break;
    await new Promise(r => setTimeout(r, 2000 * Math.pow(1.5, i)));
  }
  if (!res || !res.ok) throw new Error('AI moderation failed');
  const data = await res.json();
  const raw = (data.content[0].text as string);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { ok: true, rewritten: text };
  const parsed = JSON.parse(match[0]);
  return {
    ok: !parsed.rejected,
    rewritten: parsed.rewritten || text,
    reason: parsed.reason,
  };
}

// ── プロフィール要約を取得 ──
async function getProfileSummary(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from('user_profiles')
    .select('display_name, sensibility_cache, thought, structure')
    .eq('user_id', userId)
    .single();
  if (!data) return '(プロフィール未設定)';
  const parts = [
    data.display_name ? `名前: ${data.display_name}` : '',
    data.sensibility_cache ? `感性: ${(data.sensibility_cache as string).slice(0, 200)}` : '',
    data.thought ? `思考: ${(data.thought as string).slice(0, 100)}` : '',
  ].filter(Boolean);
  return parts.join('\n') || '(プロフィール未設定)';
}

// ── 受信設定チェック ──
async function canSendTo(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  senderId: string,
  recipientId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  // 受け手の設定を取得
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('message_reception, account_type')
    .eq('user_id', recipientId)
    .single();

  const reception = profile?.message_reception || 'bookmarked';

  if (reception === 'anyone') return { allowed: true };

  // ブックマーク or フォローで判定
  async function hasBookmarkOrFollow(fromUserId: string, toUserId: string): Promise<boolean> {
    // アカウントフォローチェック
    const { data: follow } = await supabase
      .from('account_follows')
      .select('id')
      .eq('follower_id', fromUserId)
      .eq('following_id', toUserId)
      .limit(1);
    if ((follow || []).length > 0) return true;

    // ノートブックマークチェック
    const { data: notes } = await supabase
      .from('notes')
      .select('id')
      .eq('user_id', toUserId)
      .eq('is_public', true)
      .limit(50);
    const noteIds = (notes || []).map(n => n.id);
    if (noteIds.length === 0) return false;

    const { data: bms } = await supabase
      .from('bookmarks')
      .select('id')
      .eq('user_id', fromUserId)
      .in('note_id', noteIds)
      .limit(1);
    return (bms || []).length > 0;
  }

  if (reception === 'bookmarked') {
    const recipientFollowsSender = await hasBookmarkOrFollow(recipientId, senderId);
    if (!recipientFollowsSender) {
      return { allowed: false, reason: 'この方はブックマーク/フォローしている相手からのみメッセージを受け付けています' };
    }
    return { allowed: true };
  }

  if (reception === 'mutual') {
    const recipientFollowsSender = await hasBookmarkOrFollow(recipientId, senderId);
    if (!recipientFollowsSender) {
      return { allowed: false, reason: 'この方は相互フォローの相手からのみメッセージを受け付けています' };
    }
    const senderFollowsRecipient = await hasBookmarkOrFollow(senderId, recipientId);
    if (!senderFollowsRecipient) {
      return { allowed: false, reason: 'この方は相互フォローの相手からのみメッセージを受け付けています' };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: 'メッセージを送信できません' };
}

// ════════════════════════════════════════
// GET: 会話一覧 / 特定会話のメッセージ取得
// ════════════════════════════════════════
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });

    const conversationId = req.nextUrl.searchParams.get('conversationId');

    if (conversationId) {
      // 特定会話のメッセージ一覧
      const { data: conv } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single();
      if (!conv || (conv.user_a !== user.id && conv.user_b !== user.id)) {
        return NextResponse.json({ error: '会話が見つかりません' }, { status: 404 });
      }

      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('rejected', false)
        .order('created_at', { ascending: true });

      // 相手のプロフィール
      const partnerId = conv.user_a === user.id ? conv.user_b : conv.user_a;
      const { data: partner } = await supabase
        .from('user_profiles')
        .select('display_name')
        .eq('user_id', partnerId)
        .single();

      return NextResponse.json({
        conversation: conv,
        messages: msgs || [],
        partner: { id: partnerId, name: partner?.display_name || '匿名' },
      });
    }

    // 会話一覧
    const { data: convs } = await supabase
      .from('conversations')
      .select('*')
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .order('updated_at', { ascending: false });

    if (!convs || convs.length === 0) {
      return NextResponse.json({ conversations: [] });
    }

    // 各会話の相手のプロフィール + 最新メッセージ
    const result = await Promise.all(convs.map(async (c) => {
      const partnerId = c.user_a === user.id ? c.user_b : c.user_a;
      const { data: partner } = await supabase
        .from('user_profiles')
        .select('display_name')
        .eq('user_id', partnerId)
        .single();

      const { data: lastMsg } = await supabase
        .from('messages')
        .select('display_text, sender_id, created_at')
        .eq('conversation_id', c.id)
        .eq('rejected', false)
        .order('created_at', { ascending: false })
        .limit(1);

      return {
        id: c.id,
        partnerId,
        partnerName: partner?.display_name || '匿名',
        status: c.status,
        greetingA: c.greeting_a,
        greetingB: c.greeting_b,
        isInitiator: c.user_a === user.id,
        lastMessage: lastMsg?.[0]?.display_text || null,
        lastMessageAt: lastMsg?.[0]?.created_at || c.updated_at,
        updatedAt: c.updated_at,
      };
    }));

    return NextResponse.json({ conversations: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ════════════════════════════════════════
// POST: 挨拶送信 / 承認 / メッセージ送信
// ════════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 });

    const body = await req.json();
    const action = body.action as string;

    // ── 挨拶を送る（会話開始） ──
    if (action === 'greet') {
      const recipientId = body.recipientId as string;
      if (!recipientId) return NextResponse.json({ error: '相手のIDが必要です' }, { status: 400 });
      if (recipientId === user.id) return NextResponse.json({ error: '自分にはメッセージを送れません' }, { status: 400 });

      // 受信設定チェック
      const check = await canSendTo(supabase, user.id, recipientId);
      if (!check.allowed) {
        return NextResponse.json({ error: check.reason }, { status: 403 });
      }

      // 既存会話チェック
      const { data: existing } = await supabase
        .from('conversations')
        .select('id, status')
        .or(`and(user_a.eq.${user.id},user_b.eq.${recipientId}),and(user_a.eq.${recipientId},user_b.eq.${user.id})`)
        .single();

      if (existing) {
        return NextResponse.json({ error: 'この相手とは既に会話があります', conversationId: existing.id }, { status: 409 });
      }

      // AI挨拶生成
      const senderProfile = await getProfileSummary(supabase, user.id);
      const recipientProfile = await getProfileSummary(supabase, recipientId);
      const greeting = await generateGreeting(senderProfile, recipientProfile, apiKey);

      // 会話作成
      const { data: conv, error } = await supabase
        .from('conversations')
        .insert({
          user_a: user.id,
          user_b: recipientId,
          status: 'pending',
          greeting_a: greeting,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({ conversation: conv, greeting });
    }

    // ── 承認（挨拶を返す） ──
    if (action === 'accept') {
      const conversationId = body.conversationId as string;
      const { data: conv } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .eq('user_b', user.id)
        .eq('status', 'pending')
        .single();

      if (!conv) return NextResponse.json({ error: '承認可能な会話が見つかりません' }, { status: 404 });

      // AI返答挨拶を生成
      const recipientProfile = await getProfileSummary(supabase, user.id);
      const senderProfile = await getProfileSummary(supabase, conv.user_a);
      const greeting = await generateGreeting(recipientProfile, senderProfile, apiKey);

      const { error } = await supabase
        .from('conversations')
        .update({
          status: 'approved',
          greeting_b: greeting,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      if (error) throw new Error(error.message);
      return NextResponse.json({ status: 'approved', greeting });
    }

    // ── 拒否 ──
    if (action === 'reject') {
      const conversationId = body.conversationId as string;
      const { error } = await supabase
        .from('conversations')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .eq('user_b', user.id);

      if (error) throw new Error(error.message);
      return NextResponse.json({ status: 'rejected' });
    }

    // ── メッセージ送信（AI精査付き） ──
    if (action === 'send') {
      const conversationId = body.conversationId as string;
      const text = (body.text as string || '').trim();
      if (!text) return NextResponse.json({ error: 'メッセージが空です' }, { status: 400 });

      // 会話が approved か確認
      const { data: conv } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single();

      if (!conv || (conv.user_a !== user.id && conv.user_b !== user.id)) {
        return NextResponse.json({ error: '会話が見つかりません' }, { status: 404 });
      }
      if (conv.status !== 'approved') {
        return NextResponse.json({ error: 'まだ承認されていません' }, { status: 403 });
      }

      // AI精査
      const modResult = await moderateMessage(text, apiKey);
      if (!modResult.ok) {
        return NextResponse.json({
          error: 'この内容では送れません',
          reason: modResult.reason,
          rejected: true,
        }, { status: 422 });
      }

      // メッセージ保存
      const { data: msg, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          original_text: text,
          display_text: modResult.rewritten,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      // 会話の updated_at を更新
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      return NextResponse.json({ message: msg });
    }

    return NextResponse.json({ error: '不明なアクションです' }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
