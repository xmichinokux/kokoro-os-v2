'use client';

import Link from "next/link";
import { useEffect, useState } from "react";

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
];

export default function Home() {
  const [hasHonneLogs, setHasHonneLogs] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('kokoroHonneLogs');
      if (raw) {
        const logs = JSON.parse(raw);
        setHasHonneLogs(Array.isArray(logs) && logs.length > 0);
      }
    } catch { /* ignore */ }
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
        <span className="text-xs" style={{ color: "#9ca3af" }}>
          v0.1 beta
        </span>
      </header>

      {/* Hero */}
      <section className="px-8 pt-16 pb-12 text-center">
        <h1
          className="text-2xl font-bold tracking-tight mb-3"
          style={{
            color: "#1a1a1a",
            fontFamily: "var(--font-noto-serif-jp), serif",
          }}
        >
          心と生活のためのAI OS
        </h1>
        <p className="text-sm" style={{ color: "#6b7280" }}>
          好みではなく、変化を学習する。
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
