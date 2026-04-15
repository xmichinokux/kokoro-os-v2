'use client';

import { useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTalk } from './TalkContext';
import TalkPopup from './TalkPopup';

const mono = { fontFamily: "'Space Mono', monospace" };

const DOCK_APPS = [
  { emoji: '🏠', href: '/', label: 'Home' },
  { emoji: '💬', href: '/kokoro-chat', label: 'Talk' },
  { emoji: '🧘', href: '/kokoro-zen', label: 'Zen' },
  { emoji: '📋', href: '/kokoro-plan', label: 'Plan' },
  { emoji: '✍️', href: '/kokoro-writer', label: 'Writer' },
  { emoji: '📓', href: '/kokoro-note', label: 'Note' },
  { emoji: '🍳', href: '/kokoro-recipe', label: 'Recipe' },
  { emoji: '🔍', href: '/kokoro-insight', label: 'Insight' },
  { emoji: '🎧', href: '/kokoro-buddy', label: 'Buddy' },
  { emoji: '❤️', href: '/kokoro-couple', label: 'Couple' },
  { emoji: '🧠', href: '/kokoro-philo', label: 'Philo' },
  { emoji: '👥', href: '/kokoro-board', label: 'Board' },
  { emoji: '📄', href: '/kokoro-kami', label: 'Kami' },
  { emoji: '🎨', href: '/kokoro-ponchi', label: 'Ponchi' },
  { emoji: '📚', href: '/kokoro-browser', label: 'Browser' },
  { emoji: '🐾', href: '/kokoro-animal', label: 'Animal' },
  { emoji: '👔', href: '/kokoro-fashion', label: 'Fashion' },
  { emoji: '🔒', href: '/kokoro-gatekeeper', label: 'Gate' },
  { emoji: '🔨', href: '/kokoro-builder', label: 'Builder' },
  { emoji: '⚡', href: '/kokoro-strategy', label: 'Strategy' },
  { emoji: '🌍', href: '/kokoro-world', label: 'World' },
  { emoji: '🎛️', href: '/kokoro-tuner', label: 'Tuner' },
  { emoji: '🎮', href: '/kokoro-play', label: 'Play' },
  { emoji: '🩺', href: '/kokoro-diagnosis', label: 'Diag' },
  { emoji: '💌', href: '/kokoro-messages', label: 'Msg' },
  { emoji: '⭐', href: '/kokoro-wishlist', label: 'Wish' },
  { emoji: '👤', href: '/kokoro-profile', label: 'Profile' },
];

export default function TalkDock() {
  const router = useRouter();
  const pathname = usePathname();
  const { input, setInput, sendMessage, isLoading, popupOpen, setPopupOpen, messages } = useTalk();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isOnTalkPage = pathname === '/kokoro-chat';

  // テキストエリアの高さ自動調整
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '20px';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 80) + 'px';
    }
  }, [input]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    // Talk ページ以外で送信したらポップアップを開く
    if (!isOnTalkPage) {
      setPopupOpen(true);
    }
    await sendMessage();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Talk ポップアップ（Talk ページ以外で表示） */}
      {!isOnTalkPage && <TalkPopup />}

      {/* ドックバー */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#fff',
        borderTop: '1px solid #e5e7eb',
        zIndex: 100,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* 入力欄 */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 8,
          padding: '8px 12px',
          background: '#fafafa',
          borderBottom: '1px solid #f3f4f6',
          maxWidth: 600, margin: '0 auto', width: '100%',
          boxSizing: 'border-box',
        }}>
          {/* ポップアップトグル（Talk ページ以外） */}
          {!isOnTalkPage && messages.length > 0 && (
            <button
              onClick={() => setPopupOpen(!popupOpen)}
              title={popupOpen ? 'Talk を閉じる' : 'Talk を開く'}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: popupOpen ? '#7c3aed' : '#f3f4f6',
                color: popupOpen ? '#fff' : '#6b7280',
                border: 'none', cursor: 'pointer', flexShrink: 0,
                fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              💬
            </button>
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="話しかける..."
            rows={1}
            style={{
              flex: 1, resize: 'none', border: '1px solid #e5e7eb', borderRadius: 16,
              padding: '6px 14px', fontSize: 13, color: '#1a1a1a', outline: 'none',
              background: '#fff', lineHeight: 1.5, maxHeight: 80,
              fontFamily: "'Noto Serif JP', serif",
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            style={{
              ...mono, fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
              padding: '6px 14px', borderRadius: 16, border: 'none', cursor: 'pointer',
              background: (!input.trim() || isLoading) ? '#f3f4f6' : '#7c3aed',
              color: (!input.trim() || isLoading) ? '#9ca3af' : '#fff',
              flexShrink: 0, height: 32,
            }}
          >
            {isLoading ? '...' : 'Yoroshiku'}
          </button>
        </div>

        {/* アプリドック */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 2,
          padding: '4px 8px 6px',
          overflowX: 'auto',
        }}>
          {DOCK_APPS.map(app => {
            const isActive = pathname === app.href;
            return (
              <button
                key={app.href}
                onClick={() => {
                  if (app.href === '/kokoro-chat') {
                    setPopupOpen(false);
                  }
                  router.push(app.href);
                }}
                title={app.label}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                  padding: '2px 8px', border: 'none', cursor: 'pointer',
                  background: isActive ? '#ede9fe' : 'transparent',
                  borderRadius: 6,
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontSize: 16 }}>{app.emoji}</span>
                <span style={{
                  ...mono, fontSize: 7, letterSpacing: '0.05em',
                  color: isActive ? '#7c3aed' : '#9ca3af',
                }}>
                  {app.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
