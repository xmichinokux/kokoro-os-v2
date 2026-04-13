'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const DEFAULT_PROMPT = `以下のキーワードから文章を作ってください。
シューティングゲーム、スクロール速度、駆け引き、スコア、緊張感`;

export default function GeminiTestPage() {
  const router = useRouter();
  const mono = { fontFamily: "'Space Mono', monospace" };

  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [claudeResult, setClaudeResult] = useState('');
  const [geminiResult, setGeminiResult] = useState('');
  const [claudeTime, setClaudeTime] = useState<number | null>(null);
  const [geminiTime, setGeminiTime] = useState<number | null>(null);
  const [claudeLoading, setClaudeLoading] = useState(false);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [claudeError, setClaudeError] = useState('');
  const [geminiError, setGeminiError] = useState('');

  const handleClaude = async () => {
    if (!prompt.trim()) return;
    setClaudeLoading(true);
    setClaudeResult('');
    setClaudeError('');
    setClaudeTime(null);
    const start = Date.now();
    try {
      const res = await fetch('/api/claude-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setClaudeResult(data.text);
      setClaudeTime(Date.now() - start);
    } catch (e) {
      setClaudeError(e instanceof Error ? e.message : 'エラー');
    } finally {
      setClaudeLoading(false);
    }
  };

  const handleGemini = async () => {
    if (!prompt.trim()) return;
    setGeminiLoading(true);
    setGeminiResult('');
    setGeminiError('');
    setGeminiTime(null);
    const start = Date.now();
    try {
      const res = await fetch('/api/gemini-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGeminiResult(data.text);
      setGeminiTime(Date.now() - start);
    } catch (e) {
      setGeminiError(e instanceof Error ? e.message : 'エラー');
    } finally {
      setGeminiLoading(false);
    }
  };

  const handleBoth = () => {
    handleClaude();
    handleGemini();
  };

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#374151' }}>
      {/* ヘッダー */}
      <header style={{
        padding: '14px 28px', borderBottom: '1px solid #e5e7eb',
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 32, height: 32, border: '1px solid rgba(124,58,237,0.3)',
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(circle at 40% 40%,rgba(124,58,237,0.1) 0%,transparent 70%)',
            fontSize: 16,
          }}>🧪</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Gemini API <span style={{ color: '#7c3aed' }}>Test</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>Claude vs Gemini 比較</span>
          </div>
        </div>
        <button
          onClick={() => router.push('/')}
          style={{ ...mono, fontSize: 9, letterSpacing: '.12em', color: '#9ca3af', background: 'transparent', border: '1px solid #e5e7eb', padding: '5px 14px', borderRadius: 3, cursor: 'pointer' }}
        >
          ← Home
        </button>
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '36px 28px 100px' }}>
        {/* プロンプト入力 */}
        <label style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', display: 'block', marginBottom: 10 }}>
          // プロンプト
        </label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          style={{
            width: '100%', background: '#f8f9fa', border: '1px solid #d1d5db',
            borderLeft: '2px solid #7c3aed', borderRadius: '0 4px 4px 0',
            padding: 14, fontSize: 14, color: '#111827',
            resize: 'vertical', outline: 'none', minHeight: 80,
            fontFamily: "'Noto Sans JP', sans-serif", boxSizing: 'border-box',
          }}
        />

        {/* ボタン */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button
            onClick={handleClaude}
            disabled={claudeLoading || !prompt.trim()}
            style={{
              flex: 1, padding: '11px 0', background: '#7c3aed',
              color: '#fff', border: 'none', borderRadius: 3,
              fontSize: 13, cursor: claudeLoading ? 'not-allowed' : 'pointer',
              fontFamily: "'Noto Sans JP', sans-serif", opacity: claudeLoading ? 0.6 : 1,
            }}
          >
            {claudeLoading ? '生成中...' : 'Claude で生成'}
          </button>
          <button
            onClick={handleGemini}
            disabled={geminiLoading || !prompt.trim()}
            style={{
              flex: 1, padding: '11px 0', background: '#1a73e8',
              color: '#fff', border: 'none', borderRadius: 3,
              fontSize: 13, cursor: geminiLoading ? 'not-allowed' : 'pointer',
              fontFamily: "'Noto Sans JP', sans-serif", opacity: geminiLoading ? 0.6 : 1,
            }}
          >
            {geminiLoading ? '生成中...' : 'Gemini で生成'}
          </button>
          <button
            onClick={handleBoth}
            disabled={claudeLoading || geminiLoading || !prompt.trim()}
            style={{
              flex: 1, padding: '11px 0', background: 'transparent',
              color: '#374151', border: '1px solid #d1d5db', borderRadius: 3,
              fontSize: 13, cursor: (claudeLoading || geminiLoading) ? 'not-allowed' : 'pointer',
              fontFamily: "'Noto Sans JP', sans-serif",
            }}
          >
            両方同時に生成
          </button>
        </div>

        {/* 結果表示 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 28 }}>
          {/* Claude */}
          <div style={{
            background: '#f8f9fa', border: '1px solid #e5e7eb',
            borderTop: '3px solid #7c3aed', borderRadius: '0 0 8px 8px',
            padding: 20, minHeight: 200,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ ...mono, fontSize: 10, letterSpacing: '.14em', color: '#7c3aed', fontWeight: 700 }}>
                Claude (Haiku)
              </span>
              {claudeTime !== null && (
                <span style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>
                  {(claudeTime / 1000).toFixed(1)}s
                </span>
              )}
            </div>
            {claudeLoading && (
              <div style={{ ...mono, fontSize: 11, color: '#9ca3af' }}>// 生成中...</div>
            )}
            {claudeError && (
              <div style={{ ...mono, fontSize: 11, color: '#ef4444', lineHeight: 1.6 }}>
                // エラー: {claudeError}
              </div>
            )}
            {claudeResult && (
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
                {claudeResult}
              </div>
            )}
          </div>

          {/* Gemini */}
          <div style={{
            background: '#f8f9fa', border: '1px solid #e5e7eb',
            borderTop: '3px solid #1a73e8', borderRadius: '0 0 8px 8px',
            padding: 20, minHeight: 200,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ ...mono, fontSize: 10, letterSpacing: '.14em', color: '#1a73e8', fontWeight: 700 }}>
                Gemini (2.5 Flash)
              </span>
              {geminiTime !== null && (
                <span style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>
                  {(geminiTime / 1000).toFixed(1)}s
                </span>
              )}
            </div>
            {geminiLoading && (
              <div style={{ ...mono, fontSize: 11, color: '#9ca3af' }}>// 生成中...</div>
            )}
            {geminiError && (
              <div style={{ ...mono, fontSize: 11, color: '#ef4444', lineHeight: 1.6 }}>
                // エラー: {geminiError}
              </div>
            )}
            {geminiResult && (
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
                {geminiResult}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
