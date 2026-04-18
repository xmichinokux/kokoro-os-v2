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

const APPS: App[] = [
  {
    icon: "💬",
    name: "Kokoro Talk",
    desc: "静かに寄り添い、明るく話す。",
    href: "/kokoro-chat",
    ready: true,
  },
  {
    icon: "🧘",
    name: "Kokoro Zen",
    desc: "自分の内側を、深く掘る。",
    href: "/kokoro-zen",
    ready: true,
  },
  {
    icon: "👔",
    name: "Kokoro Fashion",
    desc: "装いから、内面を読む。",
    href: "/kokoro-fashion",
    ready: true,
  },
  {
    icon: "📋",
    name: "Kokoro Plan",
    desc: "やることと、やらないことを、設計する。",
    href: "/kokoro-plan",
    ready: true,
  },
  {
    icon: "✍️",
    name: "Kokoro Writer",
    desc: "言葉を整える、自分の声で。",
    href: "/kokoro-writer",
    ready: true,
  },
  {
    icon: "🔍",
    name: "Kokoro Insight",
    desc: "レビューから、作品を読み解く。",
    href: "/kokoro-insight",
    ready: true,
  },
  {
    icon: "📓",
    name: "Kokoro Note",
    desc: "気づきを、静かに溜めていく。",
    href: "/kokoro-note",
    ready: true,
  },
  {
    icon: "📚",
    name: "Kokoro Browser",
    desc: "みんなの声を、静かに眺める。",
    href: "/kokoro-browser",
    ready: true,
  },
  {
    icon: "❤️",
    name: "Kokoro Couple",
    desc: "愛する人との距離を、整える。",
    href: "/kokoro-couple",
    ready: true,
  },
  {
    icon: "🎧",
    name: "Kokoro Buddy",
    desc: "思考を、ディグと広げる。",
    href: "/kokoro-buddy",
    ready: true,
  },
  {
    icon: "🧠",
    name: "Kokoro Philo",
    desc: "世界への問いを、照らす。",
    href: "/kokoro-philo",
    ready: true,
  },
  {
    icon: "👥",
    name: "Kokoro Board",
    desc: "会議を、台本に仕立てる。",
    href: "/kokoro-board",
    ready: true,
  },
  {
    icon: "📄",
    name: "Kokoro Kami",
    desc: "言葉から、表を立ち上げる。",
    href: "/kokoro-kami",
    ready: true,
  },
  {
    icon: "📊",
    name: "Kokoro Slide",
    desc: "コンセプトを、六枚で伝える。",
    href: "/kokoro-ponchi",
    ready: true,
  },
  {
    icon: "⚡",
    name: "Kokoro Strategy",
    desc: "散らばった欠片を、企画に束ねる。",
    href: "/kokoro-strategy",
    ready: true,
  },
  {
    icon: "🔒",
    name: "Kokoro Gatekeeper",
    desc: "言葉の奥から、仕様を見出す。",
    href: "/kokoro-gatekeeper",
    ready: true,
  },
  {
    icon: "🔨",
    name: "Kokoro Builder",
    desc: "言葉から、動くものを作る。",
    href: "/kokoro-builder",
    ready: true,
  },
  {
    icon: "📦",
    name: "Kokoro Apps",
    desc: "あなたの作品を、起動する。",
    href: "/kokoro-apps",
    ready: true,
  },
  {
    icon: "🎛️",
    name: "Kokoro Tuner",
    desc: "作ったものの気配を、整える。",
    href: "/kokoro-tuner",
    ready: true,
  },
  {
    icon: "🎨",
    name: "Kokoro Creative",
    desc: "感性を、絵に結晶させる。",
    href: "/kokoro-creative",
    ready: true,
  },
  {
    icon: "🌍",
    name: "Kokoro World",
    desc: "企画を、動く体験に変える。",
    href: "/kokoro-world",
    ready: true,
  },
  {
    icon: "🍳",
    name: "Kokoro Recipe",
    desc: "七日ぶんの食卓を、立てる。",
    href: "/kokoro-recipe",
    ready: true,
  },
  {
    icon: "🐾",
    name: "Kokoro Animal",
    desc: "動物の視線から、本能を聴く。",
    href: "/kokoro-animal",
    ready: true,
  },
  {
    icon: "👤",
    name: "Kokoro Profile",
    desc: "あなたを、静かに覚えておく。",
    href: "/kokoro-profile",
    ready: true,
  },
  {
    icon: "⭐",
    name: "Kokoro Wishlist",
    desc: "欲しいを、静かに貯める。",
    href: "/kokoro-wishlist",
    ready: true,
  },
  {
    icon: "🎮",
    name: "Kokoro Play",
    desc: "スクロールと、駆け引きする。",
    href: "/kokoro-play",
    ready: true,
  },
  {
    icon: "💬",
    name: "Kokoro Messages",
    desc: "AI 越しに、言葉を届ける。",
    href: "/kokoro-messages",
    ready: true,
  },
  {
    icon: "🎵",
    name: "Kokoro Resonance",
    desc: "好きなものの、系譜を辿る。",
    href: "/kokoro-resonance",
    ready: true,
  },
  {
    icon: "🔮",
    name: "Kokoro Oracle",
    desc: "大きな問いを、深く掘る。",
    href: "/kokoro-oracle",
    ready: true,
  },
];

export default function Home() {
  const [hasHonneLogs, setHasHonneLogs] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('kokoroHonneLogs');
      if (raw) {
        const logs = JSON.parse(raw);
        setHasHonneLogs(Array.isArray(logs) && logs.length > 0);
      }
    } catch { /* ignore */ }

    supabase.auth.getSession().then(({ data: { session } }: { data: { session: { user: User } | null } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: { user: User } | null) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

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
      <section className="px-8 pt-16 pb-12 text-center">
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

      {/* App grid */}
      <main className="flex-1 px-8 pb-16">
        <div className="max-w-2xl mx-auto grid grid-cols-2 gap-4">
          {/* 最近の状態カード */}
          {hasHonneLogs && (
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
          {APPS.map((app) => (
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
