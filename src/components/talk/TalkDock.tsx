'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTalk } from './TalkContext';
import TalkPopup from './TalkPopup';

const mono = { fontFamily: "'Space Mono', monospace" };

type App = { emoji: string; href: string; label: string };

type Category = {
  id: string;
  emoji: string;
  label: string;
  apps: App[];
};

// Home is special (no sub-apps)
const HOME: App = { emoji: '🏠', href: '/', label: 'Home' };

const CATEGORIES: Category[] = [
  {
    id: 'self',
    emoji: '🧘',
    label: 'こころ',
    apps: [
      { emoji: '💬', href: '/kokoro-chat', label: 'Talk' },
      { emoji: '🧘', href: '/kokoro-zen', label: 'Zen' },
      { emoji: '🧠', href: '/kokoro-philo', label: 'Philo' },
      { emoji: '🐾', href: '/kokoro-animal', label: 'Animal' },
      { emoji: '👔', href: '/kokoro-fashion', label: 'Fashion' },
      { emoji: '🩺', href: '/kokoro-diagnosis', label: 'Diag' },
      { emoji: '📓', href: '/kokoro-note', label: 'Note' },
      { emoji: '👤', href: '/kokoro-profile', label: 'Profile' },
    ],
  },
  {
    id: 'life',
    emoji: '🏡',
    label: 'くらし',
    apps: [
      { emoji: '📋', href: '/kokoro-plan', label: 'Plan' },
      { emoji: '🍳', href: '/kokoro-recipe', label: 'Recipe' },
      { emoji: '⭐', href: '/kokoro-wishlist', label: 'Wish' },
      { emoji: '❤️', href: '/kokoro-couple', label: 'Couple' },
      { emoji: '💌', href: '/kokoro-messages', label: 'Msg' },
    ],
  },
  {
    id: 'create',
    emoji: '🎨',
    label: 'つくる',
    apps: [
      { emoji: '✍️', href: '/kokoro-writer', label: 'Writer' },
      { emoji: '📄', href: '/kokoro-kami', label: 'Kami' },
      { emoji: '📊', href: '/kokoro-ponchi', label: 'Slide' },
      { emoji: '🎨', href: '/kokoro-creative', label: 'Creative' },
      { emoji: '🔒', href: '/kokoro-gatekeeper', label: 'Gate' },
      { emoji: '⚡', href: '/kokoro-strategy', label: 'Strategy' },
      { emoji: '🔨', href: '/kokoro-builder', label: 'Builder' },
      { emoji: '🌍', href: '/kokoro-world', label: 'World' },
      { emoji: '🎛️', href: '/kokoro-tuner', label: 'Tuner' },
      { emoji: '📦', href: '/kokoro-apps', label: 'Apps' },
    ],
  },
  {
    id: 'explore',
    emoji: '🔮',
    label: 'さがす',
    apps: [
      { emoji: '🔮', href: '/kokoro-oracle', label: 'Oracle' },
      { emoji: '🎵', href: '/kokoro-resonance', label: 'Resonance' },
      { emoji: '🔍', href: '/kokoro-insight', label: 'Insight' },
      { emoji: '🎧', href: '/kokoro-buddy', label: 'Buddy' },
      { emoji: '👥', href: '/kokoro-board', label: 'Board' },
      { emoji: '📚', href: '/kokoro-browser', label: 'Browser' },
      { emoji: '🎮', href: '/kokoro-play', label: 'Play' },
    ],
  },
];

function findCategoryIdByPath(pathname: string): string | null {
  for (const cat of CATEGORIES) {
    if (cat.apps.some(app => app.href === pathname)) return cat.id;
  }
  return null;
}

export default function TalkDock() {
  const router = useRouter();
  const pathname = usePathname();
  const { input, setInput, sendMessage, isLoading, popupOpen, setPopupOpen, messages } = useTalk();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isOnTalkPage = pathname === '/kokoro-chat';
  const isOnHome = pathname === '/';

  // URL から現在のカテゴリを自動判定
  const currentCategoryId = useMemo(() => findCategoryIdByPath(pathname), [pathname]);

  // ユーザーが閲覧中のカテゴリ（手動切替可能、URL 変更時は自動同期）
  const [browsingCategoryId, setBrowsingCategoryId] = useState<string | null>(currentCategoryId);

  useEffect(() => {
    setBrowsingCategoryId(currentCategoryId);
  }, [currentCategoryId]);

  const displayCategory = CATEGORIES.find(c => c.id === browsingCategoryId);

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

  const navigateTo = (href: string) => {
    if (href === '/kokoro-chat') {
      setPopupOpen(false);
    }
    router.push(href);
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

        {/* 上段: 大カテゴリ */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 4,
          padding: '4px 8px 2px',
          borderBottom: displayCategory ? '1px solid #f3f4f6' : 'none',
        }}>
          {/* Home button */}
          <button
            onClick={() => navigateTo(HOME.href)}
            title={HOME.label}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              padding: '3px 10px', border: 'none', cursor: 'pointer',
              background: isOnHome ? '#ede9fe' : 'transparent',
              borderRadius: 6,
              transition: 'background 0.15s',
            }}
          >
            <span style={{ fontSize: 15 }}>{HOME.emoji}</span>
            <span style={{
              ...mono, fontSize: 7, letterSpacing: '0.05em',
              color: isOnHome ? '#7c3aed' : '#9ca3af',
            }}>
              {HOME.label}
            </span>
          </button>

          {/* カテゴリボタン */}
          {CATEGORIES.map(cat => {
            const isActive = browsingCategoryId === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setBrowsingCategoryId(cat.id)}
                title={cat.label}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                  padding: '3px 10px', border: 'none', cursor: 'pointer',
                  background: isActive ? '#ede9fe' : 'transparent',
                  borderRadius: 6,
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontSize: 15 }}>{cat.emoji}</span>
                <span style={{
                  ...mono, fontSize: 8, letterSpacing: '0.05em',
                  color: isActive ? '#7c3aed' : '#9ca3af',
                  fontWeight: isActive ? 600 : 400,
                }}>
                  {cat.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* 下段: 選択中カテゴリのアプリ（カテゴリ未選択時は非表示） */}
        {displayCategory && (
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 2,
            padding: '3px 8px 5px',
            overflowX: 'auto',
          }}>
            {displayCategory.apps.map(app => {
              const isActive = pathname === app.href;
              return (
                <button
                  key={app.href}
                  onClick={() => navigateTo(app.href)}
                  title={app.label}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                    padding: '2px 8px', border: 'none', cursor: 'pointer',
                    background: isActive ? '#ede9fe' : 'transparent',
                    borderRadius: 6,
                    transition: 'background 0.15s',
                    flexShrink: 0,
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
        )}
      </div>
    </>
  );
}
