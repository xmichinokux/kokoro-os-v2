'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTalk, type TalkMessage } from './TalkContext';

const PERSONA_NAMES: Record<string, string> = {
  gnome: 'ノーム', norm: 'ノーム', shin: 'シン', canon: 'カノン',
  dig: 'ディグ', digg: 'ディグ', emi: 'エミ', watari: 'ワタリ',
};

const PERSONA_COLORS: Record<string, string> = {
  gnome: '#d97706', norm: '#d97706', shin: '#2563eb', canon: '#7c3aed',
  dig: '#059669', digg: '#059669', emi: '#db2777', watari: '#ea580c',
};

const mono = { fontFamily: "'Space Mono', monospace" };

// アプリルーティングバナーの定義
const ROUTE_BANNERS: { key: keyof TalkMessage; label: string; emoji: string; href: string; sessionKey?: string }[] = [
  { key: 'showZen', label: 'Zen', emoji: '🧘', href: '/kokoro-zen', sessionKey: 'zenFromTalk' },
  { key: 'showPlan', label: 'Plan', emoji: '📋', href: '/kokoro-plan', sessionKey: 'planFromTalk' },
  { key: 'showWriter', label: 'Writer', emoji: '✍️', href: '/kokoro-writer', sessionKey: 'writerFromTalk' },
  { key: 'showNote', label: 'Note', emoji: '📓', href: '/kokoro-note' },
  { key: 'showRecipe', label: 'Recipe', emoji: '🍳', href: '/kokoro-recipe' },
  { key: 'showInsight', label: 'Insight', emoji: '🔍', href: '/kokoro-insight' },
  { key: 'showBuddy', label: 'Buddy', emoji: '🎧', href: '/kokoro-buddy', sessionKey: 'buddyFromTalk' },
  { key: 'showCouple', label: 'Couple', emoji: '❤️', href: '/kokoro-couple' },
  { key: 'showPhilosophy', label: 'Philo', emoji: '🧠', href: '/kokoro-philo' },
  { key: 'showBoard', label: 'Board', emoji: '👥', href: '/kokoro-board' },
  { key: 'showKami', label: 'Kami', emoji: '📄', href: '/kokoro-kami' },
  { key: 'showPonchi', label: 'Ponchi', emoji: '🎨', href: '/kokoro-ponchi' },
  { key: 'showBrowser', label: 'Browser', emoji: '📚', href: '/kokoro-browser' },
  { key: 'showAnimal', label: 'Animal', emoji: '🐾', href: '/kokoro-animal' },
  { key: 'showFashion', label: 'Fashion', emoji: '👔', href: '/kokoro-fashion' },
  { key: 'showGatekeeper', label: 'Gatekeeper', emoji: '🔒', href: '/kokoro-gatekeeper' },
  { key: 'showBuilder', label: 'Builder', emoji: '🔨', href: '/kokoro-builder' },
  { key: 'showStrategy', label: 'Strategy', emoji: '⚡', href: '/kokoro-strategy' },
  { key: 'showWorld', label: 'World', emoji: '🌍', href: '/kokoro-world' },
];

export default function TalkPopup() {
  const { messages, popupOpen, setPopupOpen, isLoading } = useTalk();
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (popupOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, popupOpen]);

  if (!popupOpen) return null;

  const handleRoute = (msg: TalkMessage, banner: typeof ROUTE_BANNERS[0]) => {
    if (banner.sessionKey && msg.routingUserText) {
      try {
        sessionStorage.setItem(banner.sessionKey, JSON.stringify({
          userInput: msg.routingUserText,
          historyShort: msg.routingHistoryShort,
          historyLong: msg.routingHistoryLong,
        }));
      } catch { /* ignore */ }
    }
    setPopupOpen(false);
    router.push(banner.href);
  };

  return (
    <div style={{
      position: 'fixed', bottom: 90, left: 0, right: 0,
      maxHeight: 'calc(100vh - 150px)',
      background: '#fff',
      borderTop: '1px solid #e5e7eb',
      boxShadow: '0 -4px 24px rgba(0,0,0,0.08)',
      zIndex: 90,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', borderBottom: '1px solid #f3f4f6',
        background: '#fafafa', flexShrink: 0,
      }}>
        <span style={{ ...mono, fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>Talk</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { setPopupOpen(false); router.push('/kokoro-chat'); }}
            style={{ ...mono, fontSize: 8, color: '#6b7280', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 2, padding: '3px 8px', cursor: 'pointer' }}
          >
            Full
          </button>
          <button
            onClick={() => setPopupOpen(false)}
            style={{ ...mono, fontSize: 10, color: '#9ca3af', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
          >
            ×
          </button>
        </div>
      </div>

      {/* メッセージ一覧 */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12, color: '#9ca3af' }}>
            何か話しかけてみてください
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            {msg.role === 'user' ? (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{
                  background: '#7c3aed', color: '#fff', padding: '8px 12px',
                  borderRadius: '12px 12px 2px 12px', fontSize: 13, maxWidth: '80%',
                  lineHeight: 1.6, wordBreak: 'break-word',
                }}>
                  {msg.content}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  {msg.personaId && (
                    <span style={{
                      ...mono, fontSize: 8,
                      color: PERSONA_COLORS[msg.personaId] || '#6b7280',
                      flexShrink: 0, marginTop: 4,
                    }}>
                      {PERSONA_NAMES[msg.personaId] || msg.personaId}
                    </span>
                  )}
                  <div style={{
                    background: '#f3f4f6', color: '#1a1a1a', padding: '8px 12px',
                    borderRadius: '12px 12px 12px 2px', fontSize: 13, maxWidth: '80%',
                    lineHeight: 1.6, wordBreak: 'break-word',
                  }}>
                    {msg.content}
                  </div>
                </div>
                {/* ルーティングバナー */}
                {(() => {
                  const banners = ROUTE_BANNERS.filter(b => msg[b.key]);
                  if (banners.length === 0) return null;
                  return (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6, marginLeft: 40 }}>
                      {banners.map(b => (
                        <button
                          key={b.key}
                          onClick={() => handleRoute(msg, b)}
                          style={{
                            ...mono, fontSize: 9, color: '#7c3aed',
                            background: '#ede9fe', border: '1px solid #c4b5fd',
                            borderRadius: 12, padding: '3px 10px', cursor: 'pointer',
                          }}
                        >
                          {b.emoji} {b.label}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div style={{ display: 'flex', gap: 4, padding: '8px 0' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#c4b5fd', animation: 'pulse 1s infinite' }} />
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#c4b5fd', animation: 'pulse 1s infinite 0.2s' }} />
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#c4b5fd', animation: 'pulse 1s infinite 0.4s' }} />
          </div>
        )}
      </div>
    </div>
  );
}
