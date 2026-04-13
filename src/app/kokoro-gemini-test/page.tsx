'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

const DEFAULT_PROMPT = `以下のキーワードから文章を作ってください。
シューティングゲーム、スクロール速度、駆け引き、スコア、緊張感`;

export default function GeminiTestPage() {
  const router = useRouter();
  const mono = { fontFamily: "'Space Mono', monospace" };

  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [claudeResult, setClaudeResult] = useState('');
  const [geminiResult, setGeminiResult] = useState('');
  const [driveResult, setDriveResult] = useState('');
  const [claudeTime, setClaudeTime] = useState<number | null>(null);
  const [geminiTime, setGeminiTime] = useState<number | null>(null);
  const [driveTime, setDriveTime] = useState<number | null>(null);
  const [claudeLoading, setClaudeLoading] = useState(false);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const [claudeError, setClaudeError] = useState('');
  const [geminiError, setGeminiError] = useState('');
  const [driveError, setDriveError] = useState('');
  const [driveFiles, setDriveFiles] = useState<string[]>([]);
  const [driveContextLen, setDriveContextLen] = useState<number | null>(null);
  const [hasGoogleToken, setHasGoogleToken] = useState(false);

  // Googleアクセストークンの有無を確認
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasGoogleToken(!!session?.provider_token);
    });
  }, []);

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

  const handleDrive = async () => {
    if (!prompt.trim()) return;
    setDriveLoading(true);
    setDriveResult('');
    setDriveError('');
    setDriveTime(null);
    setDriveFiles([]);
    setDriveContextLen(null);
    const start = Date.now();
    try {
      // Supabaseセッションからアクセストークン取得
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.provider_token;
      if (!accessToken) {
        throw new Error('Googleアクセストークンがありません。Googleでログインしてください。');
      }

      const res = await fetch('/api/gemini-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), accessToken }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDriveResult(data.text);
      setDriveFiles(data.filesLoaded || []);
      setDriveContextLen(data.contextLength ?? null);
      setDriveTime(Date.now() - start);
    } catch (e) {
      setDriveError(e instanceof Error ? e.message : 'エラー');
    } finally {
      setDriveLoading(false);
    }
  };

  const handleBoth = () => {
    handleClaude();
    handleGemini();
  };

  const anyLoading = claudeLoading || geminiLoading || driveLoading;

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
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>Claude vs Gemini vs Drive 比較</span>
          </div>
        </div>
        <button
          onClick={() => router.push('/')}
          style={{ ...mono, fontSize: 9, letterSpacing: '.12em', color: '#9ca3af', background: 'transparent', border: '1px solid #e5e7eb', padding: '5px 14px', borderRadius: 3, cursor: 'pointer' }}
        >
          ← Home
        </button>
      </header>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 28px 100px' }}>
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
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button
            onClick={handleClaude}
            disabled={anyLoading || !prompt.trim()}
            style={{
              flex: 1, minWidth: 140, padding: '11px 0', background: '#7c3aed',
              color: '#fff', border: 'none', borderRadius: 3,
              fontSize: 13, cursor: anyLoading ? 'not-allowed' : 'pointer',
              fontFamily: "'Noto Sans JP', sans-serif", opacity: anyLoading ? 0.6 : 1,
            }}
          >
            {claudeLoading ? '生成中...' : 'Claude で生成'}
          </button>
          <button
            onClick={handleGemini}
            disabled={anyLoading || !prompt.trim()}
            style={{
              flex: 1, minWidth: 140, padding: '11px 0', background: '#1a73e8',
              color: '#fff', border: 'none', borderRadius: 3,
              fontSize: 13, cursor: anyLoading ? 'not-allowed' : 'pointer',
              fontFamily: "'Noto Sans JP', sans-serif", opacity: anyLoading ? 0.6 : 1,
            }}
          >
            {geminiLoading ? '生成中...' : 'Gemini で生成'}
          </button>
          <button
            onClick={handleDrive}
            disabled={anyLoading || !prompt.trim() || !hasGoogleToken}
            title={!hasGoogleToken ? 'Googleでログインすると使えます' : 'Driveのzineフォルダを参照して生成'}
            style={{
              flex: 1, minWidth: 140, padding: '11px 0',
              background: hasGoogleToken ? '#0f9d58' : '#e5e7eb',
              color: hasGoogleToken ? '#fff' : '#9ca3af',
              border: 'none', borderRadius: 3,
              fontSize: 13, cursor: (anyLoading || !hasGoogleToken) ? 'not-allowed' : 'pointer',
              fontFamily: "'Noto Sans JP', sans-serif",
              opacity: anyLoading ? 0.6 : 1,
            }}
          >
            {driveLoading ? '生成中...' : 'Gemini + Drive'}
          </button>
          <button
            onClick={handleBoth}
            disabled={anyLoading || !prompt.trim()}
            style={{
              flex: 1, minWidth: 140, padding: '11px 0', background: 'transparent',
              color: '#374151', border: '1px solid #d1d5db', borderRadius: 3,
              fontSize: 13, cursor: anyLoading ? 'not-allowed' : 'pointer',
              fontFamily: "'Noto Sans JP', sans-serif",
            }}
          >
            両方同時に生成
          </button>
        </div>

        {!hasGoogleToken && (
          <div style={{
            marginTop: 10, ...mono, fontSize: 9, color: '#9ca3af', lineHeight: 1.6,
          }}>
            // Drive連携にはGoogleログインが必要です →{' '}
            <a href="/auth" style={{ color: '#7c3aed' }}>ログイン</a>
          </div>
        )}

        {/* 結果表示 - 3カラム */}
        <div style={{ display: 'grid', gridTemplateColumns: driveResult || driveLoading || driveError ? '1fr 1fr 1fr' : '1fr 1fr', gap: 16, marginTop: 28 }}>
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
            {claudeLoading && <div style={{ ...mono, fontSize: 11, color: '#9ca3af' }}>// 生成中...</div>}
            {claudeError && <div style={{ ...mono, fontSize: 11, color: '#ef4444', lineHeight: 1.6 }}>// エラー: {claudeError}</div>}
            {claudeResult && <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>{claudeResult}</div>}
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
            {geminiLoading && <div style={{ ...mono, fontSize: 11, color: '#9ca3af' }}>// 生成中...</div>}
            {geminiError && <div style={{ ...mono, fontSize: 11, color: '#ef4444', lineHeight: 1.6 }}>// エラー: {geminiError}</div>}
            {geminiResult && <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>{geminiResult}</div>}
          </div>

          {/* Gemini + Drive */}
          {(driveResult || driveLoading || driveError) && (
            <div style={{
              background: '#f8f9fa', border: '1px solid #e5e7eb',
              borderTop: '3px solid #0f9d58', borderRadius: '0 0 8px 8px',
              padding: 20, minHeight: 200,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ ...mono, fontSize: 10, letterSpacing: '.14em', color: '#0f9d58', fontWeight: 700 }}>
                  Gemini + Drive
                </span>
                {driveTime !== null && (
                  <span style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>
                    {(driveTime / 1000).toFixed(1)}s
                  </span>
                )}
              </div>

              {/* Drive情報バナー */}
              {driveFiles.length > 0 && (
                <div style={{
                  background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 4,
                  padding: '8px 12px', marginBottom: 12, fontSize: 11, color: '#065f46', lineHeight: 1.6,
                }}>
                  📁 zineフォルダの内容を参照しています
                  <div style={{ ...mono, fontSize: 9, color: '#6b7280', marginTop: 4 }}>
                    {driveFiles.map((f, i) => <div key={i}>• {f}</div>)}
                    {driveContextLen !== null && <div style={{ marginTop: 4 }}>// {driveContextLen.toLocaleString()} 文字読み込み</div>}
                  </div>
                </div>
              )}

              {driveLoading && <div style={{ ...mono, fontSize: 11, color: '#9ca3af' }}>// Driveを読み込み中...</div>}
              {driveError && <div style={{ ...mono, fontSize: 11, color: '#ef4444', lineHeight: 1.6 }}>// エラー: {driveError}</div>}
              {driveResult && <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>{driveResult}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
