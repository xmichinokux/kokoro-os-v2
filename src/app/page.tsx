'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

type App = {
  icon: string;
  name: string;
  desc: string;
  href: string;
  ready: boolean;
};

type Category = {
  id: string;
  emoji: string;
  label: string;
  tagline: string;
  apps: App[];
};

const CATEGORIES: Category[] = [
  {
    id: 'self',
    emoji: '🧘',
    label: 'こころ',
    tagline: '自分と向き合う時間',
    apps: [
      { icon: '💬', name: 'Talk', desc: '静かに寄り添い、明るく話す。', href: '/kokoro-chat', ready: true },
      { icon: '🧘', name: 'Zen', desc: '自分の内側を、深く掘る。', href: '/kokoro-zen', ready: true },
      { icon: '🧠', name: 'Philo', desc: '世界への問いを、照らす。', href: '/kokoro-philo', ready: true },
      { icon: '🐾', name: 'Animal', desc: '動物の視線から、本能を聴く。', href: '/kokoro-animal', ready: true },
      { icon: '👔', name: 'Fashion', desc: '装いから、内面を読む。', href: '/kokoro-fashion', ready: true },
      { icon: '📓', name: 'Note', desc: '気づきを、静かに溜めていく。', href: '/kokoro-note', ready: true },
      { icon: '👤', name: 'Profile', desc: 'あなたを、静かに覚えておく。', href: '/kokoro-profile', ready: true },
    ],
  },
  {
    id: 'life',
    emoji: '🏡',
    label: 'くらし',
    tagline: '日々を整える',
    apps: [
      { icon: '📋', name: 'Plan', desc: 'やることと、やらないことを、設計する。', href: '/kokoro-plan', ready: true },
      { icon: '🍳', name: 'Recipe', desc: '七日ぶんの食卓を、立てる。', href: '/kokoro-recipe', ready: true },
      { icon: '⭐', name: 'Wishlist', desc: '欲しいを、静かに貯める。', href: '/kokoro-wishlist', ready: true },
      { icon: '❤️', name: 'Couple', desc: '愛する人との距離を、整える。', href: '/kokoro-couple', ready: true },
      { icon: '💬', name: 'Messages', desc: 'AI 越しに、言葉を届ける。', href: '/kokoro-messages', ready: true },
    ],
  },
  {
    id: 'create',
    emoji: '🎨',
    label: 'つくる',
    tagline: '言葉を、形に',
    apps: [
      { icon: '✍️', name: 'Writer', desc: '言葉を整える、自分の声で。', href: '/kokoro-writer', ready: true },
      { icon: '📄', name: 'Kami', desc: '言葉から、表を立ち上げる。', href: '/kokoro-kami', ready: true },
      { icon: '📊', name: 'Slide', desc: 'コンセプトを、六枚で伝える。', href: '/kokoro-ponchi', ready: true },
      { icon: '🎨', name: 'Creative', desc: '感性を、絵に結晶させる。', href: '/kokoro-creative', ready: true },
      { icon: '🔒', name: 'Gatekeeper', desc: '言葉の奥から、仕様を見出す。', href: '/kokoro-gatekeeper', ready: true },
      { icon: '⚡', name: 'Strategy', desc: '散らばった欠片を、企画に束ねる。', href: '/kokoro-strategy', ready: true },
      { icon: '🔨', name: 'Builder', desc: '言葉から、動くものを作る。', href: '/kokoro-builder', ready: true },
      { icon: '🌍', name: 'World', desc: '企画を、動く体験に変える。', href: '/kokoro-world', ready: true },
      { icon: '🎛️', name: 'Tuner', desc: '作ったものの気配を、整える。', href: '/kokoro-tuner', ready: true },
      { icon: '📦', name: 'Apps', desc: 'あなたの作品を、起動する。', href: '/kokoro-apps', ready: true },
    ],
  },
  {
    id: 'explore',
    emoji: '🔮',
    label: 'さがす',
    tagline: '発見と遊びの場',
    apps: [
      { icon: '🔮', name: 'Oracle', desc: '大きな問いを、深く掘る。', href: '/kokoro-oracle', ready: true },
      { icon: '🎵', name: 'Resonance', desc: '好きなものの、系譜を辿る。', href: '/kokoro-resonance', ready: true },
      { icon: '🔍', name: 'Insight', desc: 'レビューから、作品を読み解く。', href: '/kokoro-insight', ready: true },
      { icon: '🎧', name: 'Buddy', desc: '思考を、ディグと広げる。', href: '/kokoro-buddy', ready: true },
      { icon: '👥', name: 'Board', desc: '会議を、台本に仕立てる。', href: '/kokoro-board', ready: true },
      { icon: '📚', name: 'Browser', desc: 'みんなの声を、静かに眺める。', href: '/kokoro-browser', ready: true },
      { icon: '🎮', name: 'Play', desc: 'スクロールと、駆け引きする。', href: '/kokoro-play', ready: true },
    ],
  },
];

// 「今日のあなたに」キュレーションロジック
// 第5回評議会の 70/20/10 比率（物語/リズム/意外性）に基づく
// 現時点は時間帯ベース（2 アプリ）+ 意外性（1 アプリ）
function pickTodayForYou(): App[] {
  const hour = new Date().getHours();
  const allApps = CATEGORIES.flatMap(c => c.apps);

  // 時間帯に応じた優先アプリ（href のリスト）
  let timeHrefs: string[] = [];
  if (hour >= 5 && hour < 10) {
    // 朝: 内省・準備
    timeHrefs = ['/kokoro-zen', '/kokoro-plan', '/kokoro-note', '/kokoro-animal'];
  } else if (hour >= 10 && hour < 17) {
    // 日中: 創作・構築
    timeHrefs = ['/kokoro-writer', '/kokoro-builder', '/kokoro-kami', '/kokoro-strategy'];
  } else if (hour >= 17 && hour < 22) {
    // 夜: 対話・振り返り
    timeHrefs = ['/kokoro-note', '/kokoro-couple', '/kokoro-chat', '/kokoro-recipe'];
  } else {
    // 深夜: 静かな内省
    timeHrefs = ['/kokoro-zen', '/kokoro-philo', '/kokoro-oracle', '/kokoro-note'];
  }

  // 2つを時間帯から、1つを意外性枠から
  const timeMatches = timeHrefs
    .map(href => allApps.find(a => a.href === href))
    .filter((a): a is App => !!a);
  const primary = timeMatches.slice(0, 2);

  const usedHrefs = new Set(primary.map(a => a.href));
  const candidates = allApps.filter(a => !usedHrefs.has(a.href));
  // 日付ベースで擬似ランダム（同じ日は同じ意外性）
  const daySeed = new Date().getDate() + new Date().getMonth() * 31;
  const surprise = candidates[daySeed % candidates.length];

  return surprise ? [...primary, surprise] : primary;
}

export default function Home() {
  const [hasHonneLogs, setHasHonneLogs] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string>('self');
  const [todayPicks, setTodayPicks] = useState<App[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('kokoroHonneLogs');
      if (raw) {
        const logs = JSON.parse(raw);
        setHasHonneLogs(Array.isArray(logs) && logs.length > 0);
      }
    } catch { /* ignore */ }

    // 今日のあなたに: クライアント側で時刻を取得してキュレーション
    setTodayPicks(pickTodayForYou());

    supabase.auth.getSession().then(({ data: { session } }: { data: { session: { user: User } | null } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: { user: User } | null) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const activeCategory = CATEGORIES.find(c => c.id === activeCategoryId) ?? CATEGORIES[0];

  return (
    <div
      className="min-h-screen flex flex-col bg-white"
      style={{ fontFamily: "var(--font-space-mono), monospace" }}
    >
      {/* Header */}
      <header
        className="px-8 py-5 flex items-center justify-between border-b"
        style={{ borderColor: "#e5e7eb" }}
      >
        <span
          className="text-lg font-bold tracking-widest"
          style={{ color: "#7c3aed" }}
        >
          KOKORO OS
        </span>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-xs" style={{ color: '#6b7280' }}>
                {user.email?.split('@')[0]}
              </span>
              <button
                onClick={async () => { await supabase.auth.signOut(); setUser(null); }}
                className="text-xs px-2 py-1 rounded"
                style={{ color: '#9ca3af', border: '1px solid #e5e7eb', background: 'transparent', cursor: 'pointer' }}
              >
                ログアウト
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className="text-xs px-3 py-1 rounded"
              style={{ color: '#7c3aed', border: '1px solid #7c3aed', background: 'transparent' }}
            >
              ログイン
            </Link>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="px-8 pt-16 pb-8 text-center">
        <h1
          className="text-xl font-bold tracking-tight mb-3"
          style={{
            color: "#1a1a1a",
            fontFamily: "var(--font-noto-serif-jp), serif",
            lineHeight: 1.6,
          }}
        >
          話しかけるだけで、思考が動き出す。
        </h1>
        <p className="text-xs leading-relaxed" style={{ color: "#6b7280" }}>
          Kokoro OSは、あなたの日常・創作・思考を静かに支えるAI OSです。
        </p>
      </section>

      {/* 今日のあなたに */}
      {todayPicks.length > 0 && (
        <section className="px-8 pb-12">
          <div className="max-w-2xl mx-auto">
            <div
              className="text-center mb-4"
              style={{
                color: '#9ca3af',
                fontFamily: "var(--font-noto-serif-jp), serif",
                fontSize: 12,
                fontStyle: 'italic',
              }}
            >
              — 今日、寄り添うもの —
            </div>
            <div className="grid grid-cols-3 gap-3">
              {todayPicks.map((app, idx) => {
                const isSurprise = idx === 2;
                return (
                  <Link
                    key={app.href}
                    href={app.href}
                    className="border rounded-2xl p-4 flex flex-col gap-2 transition-colors"
                    style={{
                      borderColor: '#e5e7eb',
                      background: '#fff',
                      textDecoration: 'none',
                      animation: isSurprise ? 'todaySurprise 4s ease-in-out infinite' : undefined,
                    }}
                  >
                    <div className="text-xl">{app.icon}</div>
                    <div
                      className="text-xs font-bold"
                      style={{ color: '#1a1a1a' }}
                    >
                      {app.name}
                    </div>
                    <div
                      className="text-[10px] leading-relaxed"
                      style={{
                        color: '#6b7280',
                        fontFamily: "var(--font-noto-serif-jp), serif",
                      }}
                    >
                      {app.desc}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
          <style>{`
            @keyframes todaySurprise {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.85; }
            }
          `}</style>
        </section>
      )}

      {/* Category tabs */}
      <div className="px-8 mb-6">
        <div className="max-w-2xl mx-auto flex flex-wrap justify-center gap-2">
          {CATEGORIES.map(cat => {
            const isActive = activeCategoryId === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-full transition-colors"
                style={{
                  background: isActive ? '#ede9fe' : 'transparent',
                  border: `1px solid ${isActive ? '#7c3aed' : '#e5e7eb'}`,
                  color: isActive ? '#7c3aed' : '#6b7280',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 16 }}>{cat.emoji}</span>
                <span
                  className="text-sm"
                  style={{
                    fontFamily: "var(--font-noto-serif-jp), serif",
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {cat.label}
                </span>
                <span
                  className="text-xs"
                  style={{
                    color: isActive ? '#7c3aed' : '#9ca3af',
                    opacity: 0.7,
                  }}
                >
                  {cat.apps.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* Category tagline */}
        <div className="text-center mt-4">
          <span
            className="text-xs"
            style={{
              color: '#9ca3af',
              fontFamily: "var(--font-noto-serif-jp), serif",
              fontStyle: 'italic',
            }}
          >
            — {activeCategory.tagline} —
          </span>
        </div>
      </div>

      {/* App grid */}
      <main className="flex-1 px-8 pb-16">
        <div className="max-w-2xl mx-auto grid grid-cols-2 gap-4">
          {/* 最近の状態カード（こころカテゴリの時のみ表示） */}
          {hasHonneLogs && activeCategoryId === 'self' && (
            <div
              className="border rounded-2xl p-5 flex flex-col gap-3 col-span-2"
              style={{ borderColor: '#bbf7d0', background: '#f0fdf4' }}
            >
              <div className="text-2xl">📊</div>
              <div>
                <div className="text-sm font-bold mb-1" style={{ color: '#1a1a1a' }}>
                  最近の状態
                </div>
                <div
                  className="text-xs leading-relaxed"
                  style={{ color: '#6b7280', fontFamily: 'var(--font-noto-serif-jp), serif' }}
                >
                  最近のあなたを、静かに読む。
                </div>
              </div>
              <Link
                href="/kokoro-diagnosis"
                className="mt-auto text-xs font-bold px-3 py-2 rounded-lg text-center transition-colors"
                style={{ background: '#dcfce7', color: '#059669' }}
              >
                診断を見る →
              </Link>
            </div>
          )}
          {activeCategory.apps.map((app) => (
            <div
              key={app.href}
              className="border rounded-2xl p-5 flex flex-col gap-3"
              style={{
                borderColor: "#e5e7eb",
                opacity: app.ready ? 1 : 0.45,
                background: "#ffffff",
              }}
            >
              <div className="text-2xl">{app.icon}</div>
              <div>
                <div
                  className="text-sm font-bold mb-1"
                  style={{ color: "#1a1a1a" }}
                >
                  {app.name}
                </div>
                <div
                  className="text-xs leading-relaxed"
                  style={{
                    color: "#6b7280",
                    fontFamily: "var(--font-noto-serif-jp), serif",
                  }}
                >
                  {app.desc}
                </div>
              </div>
              {app.ready ? (
                <Link
                  href={app.href}
                  className="mt-auto text-xs font-bold px-3 py-2 rounded-lg text-center transition-colors"
                  style={{
                    background: "#ede9fe",
                    color: "#7c3aed",
                  }}
                >
                  起動する →
                </Link>
              ) : (
                <span
                  className="mt-auto text-xs px-3 py-2 rounded-lg text-center"
                  style={{
                    background: "#f3f4f6",
                    color: "#9ca3af",
                    cursor: "not-allowed",
                  }}
                >
                  準備中
                </span>
              )}
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer
        className="px-8 py-5 text-center border-t"
        style={{ borderColor: "#e5e7eb" }}
      >
        <span className="text-xs" style={{ color: "#9ca3af" }}>
          Kokoro OS // 千田正憲 // 岩手
        </span>
      </footer>
    </div>
  );
}
