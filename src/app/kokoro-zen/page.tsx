"use client";

import { useState } from "react";
import Link from "next/link";

type Core = {
  main_story: string;
  emotional_heat: number;
  tensions: string[];
  needs: string[];
  key_question: string;
};

type Personas = {
  norm: string;
  shin: string;
  canon: string;
  digg: string;
};

type ZenResult = {
  core: Core;
  personas: Personas;
  emi: { main: string; question: string };
};

export default function KokoroZen() {
  const [input, setInput] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ZenResult | null>(null);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);

  const STEP_LABELS = [
    "// 状況の輪郭を読み取り中...",
    "// 4つの視点から言語化中...",
    "// 統合・現在地を言語化中...",
  ];

  async function runZen() {
    if (!input.trim()) { setError("相談内容を入力してください"); return; }
    if (!apiKey.startsWith("sk-ant-")) { setError("APIキーを入力してください（sk-ant-...）"); return; }

    setError("");
    setLoading(true);
    setResult(null);
    setStep(0);

    const stepTimer = setInterval(() => {
      setStep((s) => (s + 1) % 3);
    }, 1500);

    try {
      const res = await fetch("/api/kokoro-zen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, apiKey, model: "sonnet" }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "エラーが発生しました");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      clearInterval(stepTimer);
      setLoading(false);
      setStep(0);
    }
  }

  const heatColors = ["", "#60a5fa", "#34d399", "#fbbf24", "#f97316", "#ef4444"];

  return (
    <div className="min-h-screen bg-[#080c0f] text-[#c8d8e0] font-light">
      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* ホームボタン */}
        <Link href="/" className="fixed top-4 right-4 z-50 font-mono text-[9px] tracking-widest text-[#4a5e6a] border border-[#1a2830] px-3 py-1 hover:border-[#2a4050] hover:text-[#8aa0b0] transition-all">
          ⌂ Home
        </Link>

        {/* ヘッダー */}
        <div className="mb-10">
          <span className="font-mono text-[9px] tracking-[.2em] text-[#38bdf8] uppercase block mb-3">
            Kokoro OS // 深掘り
          </span>
          <h1 className="text-3xl font-light tracking-wider text-[#e4f0f8] mb-3">
            Kokoro <em className="not-italic text-[#38bdf8]">Zen</em>
          </h1>
          <p className="text-sm text-[#4a6070] leading-relaxed">
            言語化できない感情を、4つの視点から静かに照らす。<br />
            答えは出さない。ただ、今ここを一緒に眺める。
          </p>
        </div>

        {/* APIキー */}
        <div className="bg-[#0c1418] border border-[#1a2830] border-l-[#38bdf8] border-l-2 p-4 mb-6">
          <label className="font-mono text-[9px] tracking-widest text-[#4a6070] uppercase block mb-2">
            Anthropic API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            className="w-full bg-transparent border-b border-[#1a2830] text-[#4a6070] font-mono text-xs py-1 outline-none focus:border-[#38bdf8] focus:text-[#c8d8e0] transition-all"
          />
        </div>

        {/* 入力 */}
        <div className="mb-6">
          <label className="font-mono text-[9px] tracking-widest text-[#4a6070] uppercase block mb-3">
            // 今、何が引っかかっていますか
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="言語化できなくても構いません。断片でも、矛盾していても。"
            rows={5}
            className="w-full bg-[#0c1418] border border-[#1a2830] text-[#c8d8e0] text-sm leading-relaxed p-4 outline-none focus:border-[#38bdf8] transition-all resize-none"
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") runZen();
            }}
          />
        </div>

        <button
          onClick={runZen}
          disabled={loading}
          className="w-full bg-[#0d2030] border border-[#38bdf8] text-[#38bdf8] font-mono text-[10px] tracking-widest uppercase py-4 hover:bg-[#1a3040] disabled:opacity-40 disabled:cursor-not-allowed transition-all mb-6"
        >
          {loading ? "// 処理中..." : "▸ 深掘りを始める"}
        </button>

        {/* ローディング */}
        {loading && (
          <div className="text-center py-8">
            <div className="font-mono text-[10px] text-[#38bdf8] tracking-widest mb-4">
              {STEP_LABELS[step]}
            </div>
            <div className="w-24 h-px bg-[#1a2830] mx-auto overflow-hidden">
              <div className="h-full bg-[#38bdf8] animate-pulse" />
            </div>
          </div>
        )}

        {/* エラー */}
        {error && (
          <div className="font-mono text-[10px] text-red-400 bg-red-950/30 border border-red-900 p-3 mb-6">
            // {error}
          </div>
        )}

        {/* 結果 */}
        {result && (
          <div className="space-y-4">

            {/* ReasoningCore */}
            <div className="bg-[#0c1418] border border-[#1a2830] p-5">
              <div className="font-mono text-[9px] tracking-widest text-[#38bdf8] uppercase mb-4">
                // Reasoning Core // 状況の輪郭
              </div>
              <div className="space-y-3">
                <div>
                  <span className="font-mono text-[8px] text-[#4a6070] tracking-wider">主な流れ</span>
                  <p className="text-sm text-[#c8d8e0] mt-1 leading-relaxed">{result.core.main_story}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[8px] text-[#4a6070] tracking-wider">感情の熱量</span>
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map((n) => (
                      <div
                        key={n}
                        className="w-4 h-4 rounded-sm transition-all"
                        style={{
                          background: n <= result.core.emotional_heat
                            ? heatColors[result.core.emotional_heat]
                            : "#1a2830"
                        }}
                      />
                    ))}
                  </div>
                </div>
                {result.core.tensions.length > 0 && (
                  <div>
                    <span className="font-mono text-[8px] text-[#4a6070] tracking-wider">葛藤の構造</span>
                    <div className="mt-1 space-y-1">
                      {result.core.tensions.map((t, i) => (
                        <div key={i} className="text-xs text-[#8aa0b0] border-l border-[#1a2830] pl-3">{t}</div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <span className="font-mono text-[8px] text-[#4a6070] tracking-wider">核心の問い</span>
                  <p className="text-sm text-[#38bdf8] italic mt-1">&ldquo;{result.core.key_question}&rdquo;</p>
                </div>
              </div>
            </div>

            {/* 4人格 */}
            <div className="font-mono text-[9px] tracking-widest text-[#38bdf8] uppercase pt-2">
              // 4つの視点
            </div>
            <div className="grid grid-cols-1 gap-3">
              {([
                { key: "norm", name: "ノーム", color: "#fbbf24" },
                { key: "shin", name: "シン", color: "#60a5fa" },
                { key: "canon", name: "カノン", color: "#c084fc" },
                { key: "digg", name: "ディグ", color: "#34d399" },
              ] as const).map(({ key, name, color }) => (
                <div key={key} className="bg-[#0c1418] border border-[#1a2830] p-4" style={{ borderLeftColor: color, borderLeftWidth: 2 }}>
                  <div className="font-mono text-[8px] tracking-wider mb-2" style={{ color }}>
                    {name}
                  </div>
                  <p className="text-sm text-[#c8d8e0] leading-relaxed whitespace-pre-wrap">
                    {result.personas[key]}
                  </p>
                </div>
              ))}
            </div>

            {/* エミ統合 */}
            <div className="bg-[#0c1418] border border-[#1a2830] border-l-[#f9a8d4] border-l-2 p-5">
              <div className="font-mono text-[9px] tracking-widest text-[#f9a8d4] uppercase mb-4">
                // エミ // 統合視点
              </div>
              <p className="text-sm text-[#c8d8e0] leading-relaxed mb-4 whitespace-pre-wrap">
                {result.emi.main}
              </p>
              {result.emi.question && (
                <div className="border-t border-[#1a2830] pt-4">
                  <p className="text-sm text-[#f9a8d4] italic">&ldquo;{result.emi.question}&rdquo;</p>
                </div>
              )}
            </div>

          </div>
        )}

        <footer className="mt-16 border-t border-[#1a2830] pt-4 font-mono text-[9px] text-[#2a3840] tracking-wider">
          Kokoro Zen // Kokoro OS // 千田正憲 // 岩手
        </footer>
      </div>
    </div>
  );
}
