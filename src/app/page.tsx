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
    desc: "相談・雑談。ワタリとエミが静かに寄り添う。",
    href: "/kokoro-chat",
    ready: true,
  },
  {
    icon: "🧘",
    name: "Kokoro Zen",
    desc: "深掘り相談。内面を構造化する。",
    href: "/kokoro-zen",
    ready: true,
  },
  {
    icon: "👔",
    name: "Kokoro Fashion",
    desc: "内面が装いにどう出ているかを読む。",
    href: "/kokoro-fashion",
    ready: true,
  },
  {
    icon: "📋",
    name: "Kokoro Plan",
    desc: "タスク分解。行動を設計する。",
    href: "/kokoro-plan",
    ready: true,
  },
  {
    icon: "✍️",
    name: "Kokoro Writer",
    desc: "文章編集。シンプルなWordの代替。",
    href: "/kokoro-writer",
    ready: true,
  },
  {
    icon: "🔍",
    name: "Kokoro Insight",
    desc: "レビューから作品の影響を逆算する。",
    href: "/kokoro-insight",
    ready: true,
  },
  {
    icon: "📓",
    name: "Kokoro Note",
    desc: "気づき・本音・メモを静かに蓄積する。",
    href: "/kokoro-note",
    ready: true,
  },
  {
    icon: "📚",
    name: "Kokoro Browser",
    desc: "公開Noteをゲーセンノート視点で静かに眺める。",
    href: "/kokoro-browser",
    ready: true,
  },
  {
    icon: "❤️",
    name: "Kokoro Couple",
    desc: "パートナーとの関係をAIが静かにサポートする。",
    href: "/kokoro-couple",
    ready: true,
  },
  {
    icon: "🎧",
    name: "Kokoro Buddy",
    desc: "アイデアの壁打ち相手。ディグが広げ、深める。",
    href: "/kokoro-buddy",
    ready: true,
  },
  {
    icon: "🧠",
    name: "Kokoro Philo",
    desc: "哲学的な問いを多角視点で照らす。",
    href: "/kokoro-philo",
    ready: true,
  },
  {
    icon: "👥",
    name: "Kokoro Board",
    desc: "会議の進行台本をAIが組み立てる。",
    href: "/kokoro-board",
    ready: true,
  },
  {
    icon: "📄",
    name: "Kokoro Kami",
    desc: "自然言語から編集可能な表を生成する。",
    href: "/kokoro-kami",
    ready: true,
  },
  {
    icon: "📊",
    name: "Kokoro Slide",
    desc: "コンセプトを6枚のスライドに翻訳する。",
    href: "/kokoro-ponchi",
    ready: true,
  },
  {
    icon: "⚡",
    name: "Kokoro Strategy",
    desc: "Writer・Kami・Slideの出力を統合して企画書を生成。",
    href: "/kokoro-strategy",
    ready: true,
  },
  {
    icon: "🔒",
    name: "Kokoro Gatekeeper",
    desc: "要求から仕様書を生成します。",
    href: "/kokoro-gatekeeper",
    ready: true,
  },
  {
    icon: "🔨",
    name: "Kokoro Builder",
    desc: "仕様書からコードを自動生成します。",
    href: "/kokoro-builder",
    ready: true,
  },
  {
    icon: "📦",
    name: "Kokoro Apps",
    desc: "生成した mini-app を起動・管理。SDK動作確認。",
    href: "/kokoro-apps",
    ready: true,
  },
  {
    icon: "🎛️",
    name: "Kokoro Tuner",
    desc: "生成したHTMLのパラメータを視覚的に調整。",
    href: "/kokoro-tuner",
    ready: true,
  },
  {
    icon: "🎨",
    name: "Kokoro Creative",
    desc: "感性マップからビジュアルアートを自動生成。",
    href: "/kokoro-creative",
    ready: true,
  },
  {
    icon: "🌍",
    name: "Kokoro World",
    desc: "企画書から動くデモページを自動生成。",
    href: "/kokoro-world",
    ready: true,
  },
  {
    icon: "🍳",
    name: "Kokoro Recipe",
    desc: "7日間の献立を生成する。",
    href: "/kokoro-recipe",
    ready: true,
  },
  {
    icon: "🐾",
    name: "Kokoro Animal",
    desc: "動物写真から本能の声を読む。",
    href: "/kokoro-animal",
    ready: true,
  },
  {
    icon: "👤",
    name: "Kokoro Profile",
    desc: "あなたのデータ層。他アプリが静かに参照する。",
    href: "/kokoro-profile",
    ready: true,
  },
  {
    icon: "⭐",
    name: "Kokoro Wishlist",
    desc: "欲しい・行きたい・やってみたいを静かに貯める。",
    href: "/kokoro-wishlist",
    ready: true,
  },
  {
    icon: "🎮",
    name: "Kokoro Play",
    desc: "スクロール速度と駆け引きするシューティング。",
    href: "/kokoro-play",
    ready: true,
  },
  {
    icon: "💬",
    name: "Kokoro Messages",
    desc: "AIが仲介する安全なメッセージ。にゃんパスシティー。",
    href: "/kokoro-messages",
    ready: true,
  },
  {
    icon: "🎵",
    name: "Kokoro Resonance",
    desc: "キーワードからカルチャーのファミリーツリーを探索。",
    href: "/kokoro-resonance",
    ready: true,
  },
  {
    icon: "🔮",
    name: "Kokoro Oracle",
    desc: "大きな問いから仮説を反復精錬して掘り下げる。",
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
                  今の傾向をまとめる
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
