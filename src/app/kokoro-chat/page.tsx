"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type Persona = "watari" | "emi";
type Backend = "ollama" | "anthropic";
type AnthropicModel = "haiku" | "sonnet";

type Settings = {
  persona: Persona;
  backend: Backend;
  model: AnthropicModel;
  apiKey: string;
};

const LS_HISTORY_KEY = "kokoro_chat_history_v1";
const LS_SETTINGS_KEY = "kokoro_chat_settings_v1";
const MAX_HISTORY = 20;

const PERSONA_LABELS: Record<Persona, string> = {
  watari: "ワタリ",
  emi: "エミ",
};

const PERSONA_DESCS: Record<Persona, string> = {
  watari: "静かに寄り添う",
  emi: "温かく明るい",
};

function loadHistory(): ChatTurn[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ChatTurn[];
  } catch {
    return [];
  }
}

function saveHistory(history: ChatTurn[]) {
  const trimmed = history.slice(-MAX_HISTORY);
  localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(trimmed));
}

function loadSettings(): Settings {
  if (typeof window === "undefined") {
    return { persona: "watari", backend: "ollama", model: "haiku", apiKey: "" };
  }
  try {
    const raw = localStorage.getItem(LS_SETTINGS_KEY);
    if (!raw) return { persona: "watari", backend: "ollama", model: "haiku", apiKey: "" };
    return { ...{ persona: "watari", backend: "ollama", model: "haiku", apiKey: "" }, ...JSON.parse(raw) };
  } catch {
    return { persona: "watari", backend: "ollama", model: "haiku", apiKey: "" };
  }
}

function saveSettings(settings: Settings) {
  localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(settings));
}

export default function KokoroChatPage() {
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [settings, setSettings] = useState<Settings>({
    persona: "watari",
    backend: "ollama",
    model: "haiku",
    apiKey: "",
  });
  const [personaLocked, setPersonaLocked] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setHistory(loadHistory());
    setSettings(loadSettings());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [history, hydrated]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    localStorage.removeItem(LS_HISTORY_KEY);
    setHistory([]);
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userTurn: ChatTurn = { role: "user", content: text };
    const nextHistory = [...history, userTurn];
    setHistory(nextHistory);
    saveHistory(nextHistory);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/kokoro-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: nextHistory,
          persona: settings.persona,
          backend: settings.backend,
          model: settings.model,
          apiKey: settings.apiKey || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error ?? `エラー（${res.status}）`);
      }

      const assistantTurn: ChatTurn = { role: "assistant", content: data.reply };
      const withReply = [...nextHistory, assistantTurn];
      setHistory(withReply);
      saveHistory(withReply);
    } catch (e) {
      setError(e instanceof Error ? e.message : "予期しないエラーが発生しました。");
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [input, loading, history, settings]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div
      className="flex flex-col h-screen bg-white"
      style={{ fontFamily: "var(--font-space-mono), monospace" }}
    >
      {/* Header */}
      <header
        className="border-b px-4 py-3 flex items-center gap-4 flex-wrap"
        style={{ borderColor: "#e5e7eb" }}
      >
        <span
          className="text-sm font-bold tracking-widest"
          style={{ color: "#7c3aed" }}
        >
          KOKORO CHAT
        </span>

        {/* Persona selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "#6b7280" }}>
            ペルソナ
          </span>
          {(["watari", "emi"] as Persona[]).map((p) => (
            <button
              key={p}
              disabled={personaLocked}
              onClick={() => updateSettings({ persona: p })}
              className="px-3 py-1 rounded text-xs border transition-colors"
              style={{
                background: settings.persona === p ? "#7c3aed" : "#f3f4f6",
                color: settings.persona === p ? "#ffffff" : "#1a1a1a",
                borderColor: settings.persona === p ? "#7c3aed" : "#e5e7eb",
                opacity: personaLocked && settings.persona !== p ? 0.4 : 1,
                cursor: personaLocked ? "not-allowed" : "pointer",
              }}
            >
              {PERSONA_LABELS[p]}
              <span
                className="ml-1 hidden sm:inline"
                style={{ opacity: 0.7, fontSize: "0.65rem" }}
              >
                {PERSONA_DESCS[p]}
              </span>
            </button>
          ))}
          <button
            onClick={() => setPersonaLocked((v) => !v)}
            className="px-2 py-1 rounded text-xs border"
            style={{
              background: personaLocked ? "#ede9fe" : "#f3f4f6",
              color: personaLocked ? "#7c3aed" : "#6b7280",
              borderColor: personaLocked ? "#7c3aed" : "#e5e7eb",
            }}
            title={personaLocked ? "ロック解除" : "ペルソナをロック"}
          >
            {personaLocked ? "🔒" : "🔓"}
          </button>
        </div>

        {/* Backend selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "#6b7280" }}>
            LLM
          </span>
          {(["ollama", "anthropic"] as Backend[]).map((b) => (
            <button
              key={b}
              onClick={() => updateSettings({ backend: b })}
              className="px-3 py-1 rounded text-xs border transition-colors"
              style={{
                background: settings.backend === b ? "#7c3aed" : "#f3f4f6",
                color: settings.backend === b ? "#ffffff" : "#1a1a1a",
                borderColor: settings.backend === b ? "#7c3aed" : "#e5e7eb",
              }}
            >
              {b === "ollama" ? "Ollama" : "Anthropic"}
            </button>
          ))}
        </div>

        {/* Anthropic settings */}
        {settings.backend === "anthropic" && (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={settings.model}
              onChange={(e) =>
                updateSettings({ model: e.target.value as AnthropicModel })
              }
              className="text-xs border rounded px-2 py-1"
              style={{ borderColor: "#e5e7eb", color: "#1a1a1a" }}
            >
              <option value="haiku">Haiku</option>
              <option value="sonnet">Sonnet</option>
            </select>
            <input
              type="password"
              placeholder="Anthropic API Key"
              value={settings.apiKey}
              onChange={(e) => updateSettings({ apiKey: e.target.value })}
              className="text-xs border rounded px-2 py-1 w-48"
              style={{ borderColor: "#e5e7eb", color: "#1a1a1a" }}
            />
          </div>
        )}

        {/* Reset button */}
        {history.length > 0 && (
          <button
            onClick={handleReset}
            className="ml-auto text-xs px-3 py-1 rounded border"
            style={{ borderColor: "#e5e7eb", color: "#6b7280" }}
          >
            会話をリセット
          </button>
        )}
      </header>

      {/* Chat area */}
      <main
        className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-4"
        style={{ fontFamily: "var(--font-noto-serif-jp), serif" }}
      >
        {history.length === 0 && !loading && (
          <div
            className="text-center mt-16 text-sm"
            style={{ color: "#6b7280" }}
          >
            <div className="text-2xl mb-3">
              {settings.persona === "watari" ? "🌿" : "🌸"}
            </div>
            <div>
              {PERSONA_LABELS[settings.persona]}との会話を始めましょう。
            </div>
            <div className="mt-1 text-xs" style={{ color: "#9ca3af" }}>
              {PERSONA_DESCS[settings.persona]}
            </div>
          </div>
        )}

        {history.map((turn, i) => (
          <div
            key={i}
            className={`flex flex-col gap-1 ${
              turn.role === "user" ? "items-end" : "items-start"
            }`}
          >
            {turn.role === "assistant" && (
              <span className="text-xs ml-1" style={{ color: "#6b7280" }}>
                {PERSONA_LABELS[settings.persona]}
              </span>
            )}
            <div
              className="max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
              style={
                turn.role === "user"
                  ? { background: "#7c3aed", color: "#ffffff" }
                  : { background: "#f3f4f6", color: "#1a1a1a" }
              }
            >
              {turn.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex flex-col gap-1 items-start">
            <span className="text-xs ml-1" style={{ color: "#6b7280" }}>
              {PERSONA_LABELS[settings.persona]}
            </span>
            <div
              className="px-4 py-3 rounded-2xl text-sm"
              style={{ background: "#f3f4f6", color: "#9ca3af" }}
            >
              <span className="animate-pulse">考えています…</span>
            </div>
          </div>
        )}

        {error && (
          <div
            className="mx-auto max-w-md px-4 py-3 rounded-xl text-sm border"
            style={{
              background: "#fef2f2",
              borderColor: "#fecaca",
              color: "#dc2626",
            }}
          >
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Input area */}
      <footer
        className="border-t px-4 py-3"
        style={{ borderColor: "#e5e7eb", background: "#f8f9fa" }}
      >
        <div className="flex gap-2 items-end max-w-2xl mx-auto">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力… (Ctrl+Enter で送信)"
            rows={2}
            className="flex-1 resize-none rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2"
            style={{
              borderColor: "#e5e7eb",
              fontFamily: "var(--font-noto-serif-jp), serif",
              lineHeight: "1.6",
              color: "#1a1a1a",
              // @ts-expect-error CSS custom property
              "--tw-ring-color": "#7c3aed",
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={loading || !input.trim()}
            className="px-5 py-3 rounded-xl text-sm font-bold transition-opacity"
            style={{
              background: "#7c3aed",
              color: "#ffffff",
              opacity: loading || !input.trim() ? 0.4 : 1,
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              fontFamily: "var(--font-space-mono), monospace",
            }}
          >
            送信
          </button>
        </div>
        <div
          className="text-center mt-1 text-xs"
          style={{ color: "#9ca3af", fontFamily: "var(--font-space-mono), monospace" }}
        >
          Cmd/Ctrl + Enter
        </div>
      </footer>
    </div>
  );
}
