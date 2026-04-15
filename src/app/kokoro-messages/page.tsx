'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import LoginBanner from '@/components/LoginBanner';
import { getCurrentUserId } from '@/lib/supabase/auth';

/* ── 型定義 ── */
type ConversationSummary = {
  id: string;
  partnerId: string;
  partnerName: string;
  status: 'pending' | 'approved' | 'rejected';
  greetingA: string | null;
  greetingB: string | null;
  isInitiator: boolean;
  lastMessage: string | null;
  lastMessageAt: string;
  updatedAt: string;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  original_text: string;
  display_text: string;
  created_at: string;
};

type ConversationDetail = {
  conversation: {
    id: string;
    user_a: string;
    user_b: string;
    status: string;
    greeting_a: string | null;
    greeting_b: string | null;
  };
  messages: Message[];
  partner: { id: string; name: string };
};

/* ── 定数 ── */
const mono = { fontFamily: "'Space Mono', monospace" };
const serif = { fontFamily: "'Noto Serif JP', serif" };

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 1) return `${Math.max(1, Math.floor(diffMs / 60000))}分前`;
  if (diffH < 24) return `${diffH}時間前`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}日前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/* ══════════════════════════════════════ */
export default function KokoroMessagesPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'chat'>('list');

  // 会話一覧
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // チャット
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [chatData, setChatData] = useState<ConversationDetail | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);

  // テスト用
  const [greetTargetId, setGreetTargetId] = useState('');
  const [greetStatus, setGreetStatus] = useState('');
  const [greetLoading, setGreetLoading] = useState(false);

  // ユーザーID取得
  useEffect(() => {
    getCurrentUserId().then(setUserId);
  }, []);

  // 会話一覧取得
  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/kokoro-messages');
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (userId) fetchConversations();
  }, [userId, fetchConversations]);

  // チャット取得
  const openChat = async (convId: string) => {
    setSelectedConvId(convId);
    setView('chat');
    setChatLoading(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/kokoro-messages?conversationId=${convId}`);
      const data = await res.json();
      setChatData(data);
    } catch { /* ignore */ }
    finally { setChatLoading(false); }
  };

  // メッセージ送信
  const handleSend = async () => {
    if (!inputText.trim() || !selectedConvId || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch('/api/kokoro-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', conversationId: selectedConvId, text: inputText }),
      });
      const data = await res.json();
      if (data.rejected || data.error) {
        setSendError(data.reason || data.error || 'この内容では送れません');
        return;
      }
      setInputText('');
      // メッセージ再取得
      await openChat(selectedConvId);
    } catch {
      setSendError('送信に失敗しました');
    } finally { setSending(false); }
  };

  // 承認
  const handleAccept = async () => {
    if (!selectedConvId || accepting) return;
    setAccepting(true);
    try {
      const res = await fetch('/api/kokoro-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept', conversationId: selectedConvId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await openChat(selectedConvId);
    } catch (e) {
      alert(e instanceof Error ? e.message : '承認に失敗しました');
    } finally { setAccepting(false); }
  };

  // 拒否
  const handleReject = async () => {
    if (!selectedConvId || rejecting) return;
    setRejecting(true);
    try {
      await fetch('/api/kokoro-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', conversationId: selectedConvId }),
      });
      setView('list');
      fetchConversations();
    } catch { /* ignore */ }
    finally { setRejecting(false); }
  };

  // スクロール
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatData]);

  if (!userId) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 20px' }}>
        <LoginBanner />
      </div>
    );
  }

  /* ── 会話一覧 ── */
  if (view === 'list') {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 20px' }}>
        {/* ヘッダー */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <button onClick={() => router.push('/')}
            style={{ ...mono, fontSize: 10, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>
            ← Home
          </button>
          <h1 style={{ ...mono, fontSize: 14, letterSpacing: '0.15em', color: '#1a1a1a', margin: 0 }}>
            MESSAGES
          </h1>
          <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '0.1em' }}>
            // にゃんパスシティー
          </span>
        </div>

        {/* テスト用: 挨拶送信 */}
        <div style={{
          padding: 16, background: '#f9fafb', border: '1px solid #e5e7eb',
          borderRadius: 8, marginBottom: 24,
        }}>
          <div style={{ ...mono, fontSize: 8, color: '#9ca3af', marginBottom: 8, letterSpacing: '0.1em' }}>
            // テスト: 挨拶を送る（相手の User ID を入力）
          </div>
          <div style={{ ...mono, fontSize: 8, color: '#6b7280', marginBottom: 6 }}>
            あなたの User ID: <span style={{ color: '#7c3aed', userSelect: 'all' }}>{userId}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={greetTargetId}
              onChange={e => setGreetTargetId(e.target.value)}
              placeholder="相手の User ID"
              style={{
                flex: 1, ...mono, fontSize: 10, padding: '6px 10px',
                border: '1px solid #e5e7eb', borderRadius: 4, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={async () => {
                if (!greetTargetId.trim()) return;
                setGreetLoading(true);
                setGreetStatus('送信中...');
                try {
                  const res = await fetch('/api/kokoro-messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'greet', recipientId: greetTargetId.trim() }),
                  });
                  const data = await res.json();
                  setGreetStatus(JSON.stringify(data, null, 2));
                  if (!data.error) {
                    fetchConversations();
                  }
                } catch (e) {
                  setGreetStatus(`Error: ${e instanceof Error ? e.message : 'unknown'}`);
                } finally { setGreetLoading(false); }
              }}
              disabled={greetLoading || !greetTargetId.trim()}
              style={{
                ...mono, fontSize: 9, padding: '6px 14px', borderRadius: 4, cursor: 'pointer',
                background: greetLoading ? '#9ca3af' : '#7c3aed', color: '#fff', border: 'none',
              }}
            >
              {greetLoading ? '...' : '挨拶を送る'}
            </button>
          </div>
          {greetStatus && (
            <pre style={{
              ...mono, fontSize: 8, color: '#374151', marginTop: 8,
              padding: 8, background: '#fff', borderRadius: 4, border: '1px solid #e5e7eb',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {greetStatus}
            </pre>
          )}
        </div>

        {loading ? (
          <div style={{ ...mono, fontSize: 10, color: '#9ca3af', textAlign: 'center', padding: 40 }}>
            読み込み中...
          </div>
        ) : conversations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ ...serif, fontSize: 14, color: '#6b7280', lineHeight: 2 }}>
              メッセージはまだありません
            </div>
            <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginTop: 8 }}>
              Browser で気になった商品やノートのクリエイターに挨拶を送ってみましょう
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {conversations.map(c => (
              <button
                key={c.id}
                onClick={() => openChat(c.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 16px', background: '#fff', border: 'none', cursor: 'pointer',
                  borderBottom: '1px solid #f3f4f6', textAlign: 'left', width: '100%',
                }}
              >
                {/* アバター */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: c.status === 'approved' ? '#ede9fe' : c.status === 'pending' ? '#fef3c7' : '#f3f4f6',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  ...mono, fontSize: 12,
                  color: c.status === 'approved' ? '#7c3aed' : c.status === 'pending' ? '#f59e0b' : '#9ca3af',
                }}>
                  {c.partnerName.slice(0, 1)}
                </div>

                {/* 内容 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ ...mono, fontSize: 11, fontWeight: 600, color: '#1a1a1a' }}>
                      {c.partnerName}
                    </span>
                    {c.status === 'pending' && !c.isInitiator && (
                      <span style={{
                        ...mono, fontSize: 7, color: '#fff', background: '#f59e0b',
                        padding: '1px 6px', borderRadius: 8,
                      }}>
                        承認待ち
                      </span>
                    )}
                    {c.status === 'pending' && c.isInitiator && (
                      <span style={{
                        ...mono, fontSize: 7, color: '#9ca3af',
                        padding: '1px 6px', borderRadius: 8, border: '1px solid #e5e7eb',
                      }}>
                        返答待ち
                      </span>
                    )}
                  </div>
                  <div style={{
                    ...serif, fontSize: 12, color: '#6b7280', marginTop: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {c.lastMessage || c.greetingA || ''}
                  </div>
                </div>

                {/* 時刻 */}
                <span style={{ ...mono, fontSize: 8, color: '#9ca3af', flexShrink: 0 }}>
                  {formatTime(c.lastMessageAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── チャット画面 ── */
  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 20px', display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px 0', borderBottom: '1px solid #e5e7eb', flexShrink: 0,
      }}>
        <button onClick={() => { setView('list'); fetchConversations(); }}
          style={{ ...mono, fontSize: 10, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>
          ← 戻る
        </button>
        <span style={{ ...mono, fontSize: 12, fontWeight: 600, color: '#1a1a1a' }}>
          {chatData?.partner?.name || '...'}
        </span>
        {chatData?.conversation?.status === 'approved' && (
          <span style={{ ...mono, fontSize: 7, color: '#16a34a', border: '1px solid #bbf7d0', padding: '1px 6px', borderRadius: 8 }}>
            承認済み
          </span>
        )}
      </div>

      {chatLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ ...mono, fontSize: 10, color: '#9ca3af' }}>読み込み中...</span>
        </div>
      ) : chatData ? (
        <>
          {/* メッセージエリア */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 0' }}>
            {/* 挨拶（常に表示） */}
            {chatData.conversation.greeting_a && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ ...mono, fontSize: 7, color: '#9ca3af', marginBottom: 4, letterSpacing: '0.1em' }}>
                  // AI が用意した挨拶
                </div>
                <div style={{
                  ...serif, fontSize: 13, lineHeight: 1.8, color: '#374151',
                  padding: '10px 14px', background: '#f3f4f6', borderRadius: '4px 12px 12px 12px',
                  maxWidth: '80%',
                }}>
                  {chatData.conversation.greeting_a}
                </div>
              </div>
            )}

            {chatData.conversation.greeting_b && (
              <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <div style={{ ...mono, fontSize: 7, color: '#9ca3af', marginBottom: 4, letterSpacing: '0.1em' }}>
                  // 返答の挨拶
                </div>
                <div style={{
                  ...serif, fontSize: 13, lineHeight: 1.8, color: '#fff',
                  padding: '10px 14px', background: '#7c3aed', borderRadius: '12px 4px 12px 12px',
                  maxWidth: '80%',
                }}>
                  {chatData.conversation.greeting_b}
                </div>
              </div>
            )}

            {/* 承認前のアクション */}
            {chatData.conversation.status === 'pending' && chatData.conversation.user_b === userId && (
              <div style={{
                padding: '16px', background: '#fffbeb', border: '1px solid #fde68a',
                borderRadius: 8, marginBottom: 16, textAlign: 'center',
              }}>
                <div style={{ ...serif, fontSize: 13, color: '#92400e', marginBottom: 12 }}>
                  この挨拶を承認しますか？
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button
                    onClick={handleAccept}
                    disabled={accepting}
                    style={{
                      ...mono, fontSize: 10, padding: '8px 20px', borderRadius: 4, cursor: 'pointer',
                      background: accepting ? '#9ca3af' : '#7c3aed', color: '#fff', border: 'none',
                    }}
                  >
                    {accepting ? '承認中...' : '承認する'}
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={rejecting}
                    style={{
                      ...mono, fontSize: 10, padding: '8px 20px', borderRadius: 4, cursor: 'pointer',
                      background: 'transparent', color: '#9ca3af', border: '1px solid #e5e7eb',
                    }}
                  >
                    拒否
                  </button>
                </div>
              </div>
            )}

            {chatData.conversation.status === 'pending' && chatData.conversation.user_a === userId && (
              <div style={{
                padding: '12px', background: '#f9fafb', border: '1px solid #e5e7eb',
                borderRadius: 8, marginBottom: 16, textAlign: 'center',
                ...mono, fontSize: 10, color: '#6b7280',
              }}>
                相手の承認を待っています...
              </div>
            )}

            {/* メッセージ一覧 */}
            {chatData.messages.map(msg => {
              const isMe = msg.sender_id === userId;
              return (
                <div key={msg.id} style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: isMe ? 'flex-end' : 'flex-start',
                  marginBottom: 12,
                }}>
                  <div style={{
                    ...serif, fontSize: 13, lineHeight: 1.8,
                    color: isMe ? '#fff' : '#374151',
                    padding: '10px 14px',
                    background: isMe ? '#7c3aed' : '#f3f4f6',
                    borderRadius: isMe ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                    maxWidth: '80%',
                  }}>
                    {msg.display_text}
                  </div>
                  <span style={{ ...mono, fontSize: 7, color: '#9ca3af', marginTop: 2 }}>
                    {formatTime(msg.created_at)}
                  </span>
                </div>
              );
            })}
            <div ref={msgEndRef} />
          </div>

          {/* 入力エリア（承認後のみ） */}
          {chatData.conversation.status === 'approved' && (
            <div style={{
              padding: '12px 0', borderTop: '1px solid #e5e7eb', flexShrink: 0,
            }}>
              {sendError && (
                <div style={{
                  ...mono, fontSize: 10, color: '#dc2626', padding: '6px 10px',
                  background: '#fef2f2', borderRadius: 4, marginBottom: 8,
                }}>
                  {sendError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <textarea
                  value={inputText}
                  onChange={e => { setInputText(e.target.value); setSendError(null); }}
                  onKeyDown={e => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="メッセージを入力..."
                  rows={2}
                  style={{
                    flex: 1, ...serif, fontSize: 13, padding: '10px 12px',
                    border: '1px solid #e5e7eb', borderRadius: 8, outline: 'none',
                    resize: 'none', boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !inputText.trim()}
                  style={{
                    ...mono, fontSize: 10, padding: '0 16px', borderRadius: 8,
                    background: sending || !inputText.trim() ? '#e5e7eb' : '#7c3aed',
                    color: sending || !inputText.trim() ? '#9ca3af' : '#fff',
                    border: 'none', cursor: sending ? 'not-allowed' : 'pointer',
                    alignSelf: 'flex-end', height: 40,
                  }}
                >
                  {sending ? '...' : '送信'}
                </button>
              </div>
              <div style={{ ...mono, fontSize: 7, color: '#9ca3af', marginTop: 4 }}>
                メッセージは AI が内容を確認し、必要に応じて表現を整えます。Ctrl+Enter で送信
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
