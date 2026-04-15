'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import PersonaLoading from '@/components/PersonaLoading';

type BuddyMessage = { role: 'user' | 'assistant'; content: string };
type BuddyMode = 'normal' | 'michi';

const IDEA_CHIPS = [
  { label: '新しいビジネスのアイデア', text: '新しいビジネスのアイデアがあって' },
  { label: 'ゲームの仕組み', text: 'ゲームの仕組みを考えていて' },
  { label: '作品のコンセプト', text: '作品のコンセプトがまとまらなくて' },
  { label: '問題の解決策', text: '問題の解決策を探していて' },
];

export default function KokoroBuddyPage() {
  const router = useRouter();
  const mono = { fontFamily: "'Space Mono', monospace" };
  const accentColor = '#6366f1';

  const [mode, setMode] = useState<BuddyMode>('normal');
  const [hasCache, setHasCache] = useState(false);
  const [messages, setMessages] = useState<BuddyMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // 感性キャッシュの有無を確認
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      try {
        const res = await fetch('/api/drive-cache');
        const data = await res.json();
        setHasCache(!!data.writing || !!data.thought);
      } catch { /* ignore */ }
    })();
  }, []);

  const chatAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (chatAreaRef.current) {
        chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
      }
    }, 50);
  };

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    const newHistory: BuddyMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(newHistory);
    setInputText('');
    setError('');
    setIsLoading(true);
    scrollToBottom();

    // textareaのサイズをリセット
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      const res = await fetch('/api/kokoro-buddy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newHistory, mode }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error || `API エラー (${res.status})`);
      if (data.error) throw new Error(data.error);
      setMessages([...newHistory, { role: 'assistant', content: data.result ?? '' }]);
      scrollToBottom();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [inputText, isLoading, messages, mode]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChipClick = (text: string) => {
    setInputText(text);
    inputRef.current?.focus();
  };

  // sessionStorage から buddyFromTalk を読み取り
  useEffect(() => {
    const raw = sessionStorage.getItem('buddyFromTalk');
    if (!raw) return;
    sessionStorage.removeItem('buddyFromTalk');
    try {
      const parsed = JSON.parse(raw);
      const userText = typeof parsed?.userText === 'string' ? parsed.userText : '';
      if (userText) setInputText(userText);
    } catch {
      // 旧形式（プレーン文字列）フォールバック
      const lines = raw.split('\n').filter(l => l.startsWith('ユーザー:'));
      const last = lines.length > 0 ? lines[lines.length - 1].replace('ユーザー:', '').trim() : raw.trim();
      setInputText(last);
    }
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#374151' }}>

      {/* ヘッダー */}
      <header style={{
        padding: '14px 28px',
        borderBottom: '1px solid #e5e7eb',
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 32, height: 32, border: `1px solid rgba(99,102,241,0.3)`,
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(circle at 40% 40%,rgba(99,102,241,0.1) 0%,transparent 70%)',
            fontSize: 16,
          }}>🎧</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: accentColor }}>Buddy</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>アイデア壁打ちAI</span>
          </div>
        </div>
        <div />
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 28px 120px', display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 60px)' }}>

        {/* モード切替 */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, alignItems: 'center' }}>
          <button
            onClick={() => { setMode('normal'); setMessages([]); setError(''); }}
            style={{
              ...mono, fontSize: 10, letterSpacing: '.1em',
              padding: '8px 20px', borderRadius: 2, cursor: 'pointer',
              border: `1px solid ${mode === 'normal' ? accentColor : '#d1d5db'}`,
              color: mode === 'normal' ? '#fff' : '#9ca3af',
              background: mode === 'normal' ? accentColor : 'transparent',
              fontWeight: mode === 'normal' ? 600 : 400,
              transition: 'all 0.15s',
            }}
          >
            Buddy
          </button>
          <button
            onClick={() => {
              if (!hasCache) return;
              setMode('michi'); setMessages([]); setError('');
            }}
            title={!hasCache ? 'Profileページでドライブをスキャンしてください' : 'Buddy Deep'}
            style={{
              ...mono, fontSize: 10, letterSpacing: '.1em',
              padding: '8px 20px', borderRadius: 2,
              cursor: hasCache ? 'pointer' : 'not-allowed',
              border: `1px solid ${mode === 'michi' ? '#0f9d58' : !hasCache ? '#e5e7eb' : '#d1d5db'}`,
              color: mode === 'michi' ? '#fff' : !hasCache ? '#d1d5db' : '#9ca3af',
              background: mode === 'michi' ? '#0f9d58' : 'transparent',
              fontWeight: mode === 'michi' ? 600 : 400,
              opacity: !hasCache ? 0.6 : 1,
              transition: 'all 0.15s',
            }}
          >
            Buddy Deep
          </button>
          {!hasCache && (
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', marginLeft: 8 }}>
              // <a href="/kokoro-profile" style={{ color: '#0f9d58' }}>Profileページ</a>でドライブをスキャンしてください
            </span>
          )}
        </div>

        {/* ヒントテキスト */}
        {messages.length === 0 && (
          <>
            <p style={{
              fontSize: 13, color: '#9ca3af',
              marginBottom: 20, lineHeight: 1.8,
              fontFamily: "'Noto Serif JP', serif",
            }}>
              {mode === 'michi'
                ? 'あなたのセンスで壁打ちします。アイデアをぶつけてください。'
                : 'アイデアをぶつけてください。どんな断片でも、矛盾していても大丈夫。ディグが一緒に広げます。'}
            </p>

            {/* クイックチップ */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {IDEA_CHIPS.map(chip => (
                <button
                  key={chip.label}
                  onClick={() => handleChipClick(chip.text)}
                  style={{
                    fontSize: 12, padding: '7px 14px',
                    border: '1px solid #d1d5db', borderRadius: 20,
                    color: '#9ca3af', cursor: 'pointer',
                    background: '#f8f9fa',
                    transition: 'all 0.15s',
                    fontFamily: "'Noto Sans JP', sans-serif",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = accentColor;
                    e.currentTarget.style.color = accentColor;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.color = '#9ca3af';
                  }}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* チャットエリア */}
        <div
          ref={chatAreaRef}
          style={{
            flex: 1, overflowY: 'auto', padding: '8px 0', marginBottom: 16,
            minHeight: 200,
          }}
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                gap: msg.role === 'assistant' ? 10 : 0,
                alignItems: 'flex-start',
                marginBottom: 16,
                animation: 'msgIn 0.3s ease-out forwards',
              }}
            >
              {msg.role === 'assistant' && (
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  border: `1px solid ${accentColor}`, background: 'rgba(0,0,0,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, flexShrink: 0, marginTop: 2,
                }}>
                  🎧
                </div>
              )}
              {msg.role === 'user' ? (
                <div style={{
                  background: '#f1f3f5', border: '1px solid #d1d5db',
                  borderRadius: '16px 16px 4px 16px',
                  padding: '12px 16px', maxWidth: '75%',
                  fontSize: 14, lineHeight: 1.7, color: '#111827',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {msg.content}
                </div>
              ) : (
                <div style={{
                  background: '#f8f9fa', border: '1px solid #e5e7eb',
                  borderLeft: `2px solid ${accentColor}`,
                  borderRadius: '4px 16px 16px 4px',
                  padding: '14px 18px',
                  fontSize: 14, lineHeight: 1.85, color: '#374151',
                  maxWidth: '80%',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  fontFamily: "'Noto Serif JP', serif",
                }}>
                  {msg.content}
                </div>
              )}
            </div>
          ))}

          {/* タイピングインジケーター */}
          {isLoading && <PersonaLoading />}
        </div>

        {/* エラー */}
        {error && (
          <div style={{ marginBottom: 12, ...mono, fontSize: 11, color: '#ef4444', lineHeight: 1.8 }}>
            // エラー: {error}
          </div>
        )}

        {/* 入力エリア */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={e => {
              setInputText(e.target.value);
              autoResize(e.currentTarget);
            }}
            onKeyDown={handleKeyDown}
            placeholder="アイデアを投げてみて。"
            rows={1}
            style={{
              flex: 1, background: '#f8f9fa',
              border: '1px solid #d1d5db', borderRadius: 10,
              color: '#111827', fontSize: 14, fontWeight: 300,
              lineHeight: 1.6, padding: '12px 16px',
              resize: 'none', outline: 'none',
              minHeight: 48, maxHeight: 120,
              overflowY: 'auto',
              fontFamily: "'Noto Sans JP', sans-serif",
              transition: 'border-color 0.2s',
              boxSizing: 'border-box',
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'}
            onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isLoading}
            style={{
              width: 44, height: 44, flexShrink: 0,
              background: (!inputText.trim() || isLoading) ? '#d1d5db' : accentColor,
              border: 'none', borderRadius: 10,
              cursor: (!inputText.trim() || isLoading) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, color: '#fff',
              transition: 'all 0.15s',
            }}
          >
            ↑
          </button>
        </div>

        <style>{`
          @keyframes msgIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-5px); } }
        `}</style>
      </div>
    </div>
  );
}
