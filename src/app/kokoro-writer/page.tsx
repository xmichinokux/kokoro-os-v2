'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { saveToNote } from '@/lib/saveToNote';

type WriterMode = 'lite' | 'core';

/**
 * Core モードのXMLフォーマット出力をパースして、
 * 描画用HTML・コピー/保存用プレーンテキスト・memos/suggestionを取り出す
 */
function parseWriterXml(raw: string): {
  html: string;
  plain: string;
  memos: string;
  suggestion: string;
} {
  const editedMatch = raw.match(/<edited>([\s\S]*?)<\/edited>/);
  const memosMatch = raw.match(/<memos>([\s\S]*?)<\/memos>/);
  const suggestionMatch = raw.match(/<suggestion>([\s\S]*?)<\/suggestion>/);

  let html: string;
  if (editedMatch) {
    html = editedMatch[1].trim();
  } else {
    // XMLタグが無かった場合のフォールバック：そのままwpで包む
    const escaped = raw
      .trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    html = `<p class="wp">${escaped.replace(/\n/g, '<br>')}</p>`;
  }

  // プレーンテキスト化（Note保存・コピー用）
  const plain = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|h2|h3|h4|li|blockquote|ul|ol|hr|div)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    html,
    plain,
    memos: memosMatch ? memosMatch[1].trim() : '',
    suggestion: suggestionMatch ? suggestionMatch[1].trim() : '',
  };
}

export default function KokoroWriterPage() {
  const router = useRouter();
  const mono = { fontFamily: "'Space Mono', monospace" };

  const [mode, setMode] = useState<WriterMode>('lite');
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [outputHtml, setOutputHtml] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const canSubmit = inputText.trim().length > 0 && !isLoading;

  const handleRun = useCallback(async (text?: string) => {
    const t = text ?? inputText;
    if (!t.trim()) return;
    setIsLoading(true);
    setError('');
    setOutputText('');
    setOutputHtml('');
    setSaved(false);

    try {
      const res = await fetch('/api/kokoro-writer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t, mode }),
      });
      if (!res.ok) throw new Error('編集に失敗しました');
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const raw = (data.result ?? '') as string;
      if (mode === 'core') {
        // Core モード: XMLパース → HTML描画 + プレーンテキスト化
        const parsed = parseWriterXml(raw);
        setOutputHtml(parsed.html);
        setOutputText(parsed.plain);
      } else {
        // Lite モード: 既存通りプレーンテキストのまま
        setOutputText(raw);
        setOutputHtml('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  }, [inputText, mode]);

  const handleCopy = async () => {
    if (!outputText) return;
    await navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSaveToNote = () => {
    if (!outputText) return;
    saveToNote(outputText, 'Writer');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // sessionStorage から writerFromTalk を読み取り
  useEffect(() => {
    const raw = sessionStorage.getItem('writerFromTalk');
    if (!raw) return;
    sessionStorage.removeItem('writerFromTalk');
    let userText = '';
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.userText === 'string') userText = parsed.userText;
    } catch {
      userText = raw;
    }
    if (userText) {
      setInputText(userText);
      setTimeout(() => {
        handleRun(userText);
      }, 300);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const accentColor = '#a855f7';

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#374151' }}>

      {/* ヘッダー */}
      <header style={{
        padding: '14px 28px',
        borderBottom: '1px solid #e5e7eb',
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 32, height: 32, border: `1px solid rgba(168,85,247,0.3)`,
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(circle at 40% 40%,rgba(168,85,247,0.1) 0%,transparent 70%)',
            fontSize: 16,
          }}>✍</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: accentColor }}>Writer</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>文章編集OS</span>
          </div>
        </div>
        <button
          onClick={() => router.push('/kokoro-chat')}
          style={{ ...mono, fontSize: 9, letterSpacing: '.12em', color: '#9ca3af', background: 'transparent', border: '1px solid #e5e7eb', padding: '5px 14px', borderRadius: 3, cursor: 'pointer' }}
        >
          ← Talk
        </button>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '56px 28px 100px' }}>

        {/* モード切り替えタブ */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {(['lite', 'core'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                ...mono, fontSize: 9, letterSpacing: '.1em',
                padding: '7px 16px',
                border: `1px solid ${mode === m ? accentColor : '#d1d5db'}`,
                borderRadius: 20, cursor: 'pointer',
                color: mode === m ? accentColor : '#9ca3af',
                background: 'transparent',
                transition: 'all 0.15s',
              }}
            >
              {m === 'lite' ? 'Lite' : 'Core'}
            </button>
          ))}
        </div>

        {/* レイアウト：Liteは2カラム、CoreはHTML描画のため1カラム縦積み */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: mode === 'lite' ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)',
          gap: 16,
        }}>
          {/* 入力カラム */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af' }}>
              // 入力
            </span>
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="編集したい文章を入力してください..."
              style={{
                width: '100%', minHeight: 280, background: '#f8f9fa',
                border: '1px solid #d1d5db', borderLeft: '2px solid #d1d5db',
                padding: 16, fontSize: 14, color: '#111827',
                resize: 'vertical', outline: 'none', lineHeight: 1.8,
                fontFamily: "'Noto Serif JP', serif",
                boxSizing: 'border-box',
              }}
              onFocus={e => e.currentTarget.style.borderLeftColor = accentColor}
              onBlur={e => e.currentTarget.style.borderLeftColor = '#d1d5db'}
            />
          </div>

          {/* 出力カラム */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af' }}>
              // 出力
            </span>
            {mode === 'lite' ? (
              // Liteモード：従来通りのtextarea表示
              <textarea
                value={outputText}
                readOnly
                placeholder="ここに編集結果が表示されます..."
                style={{
                  width: '100%', minHeight: 280, background: '#f1f3f5',
                  border: '1px solid #d1d5db', borderLeft: '2px solid #d1d5db',
                  padding: 16, fontSize: 14, color: '#111827',
                  resize: 'vertical', outline: 'none', lineHeight: 1.8,
                  fontFamily: "'Noto Serif JP', serif",
                  cursor: 'default', boxSizing: 'border-box',
                }}
              />
            ) : (
              // Coreモード：モダン・エディトリアル風HTML描画
              <div
                className="edited-text-zone"
                style={{
                  minHeight: 320,
                  border: '1px solid #e5e7eb',
                  borderLeft: '2px solid #d1d5db',
                  borderRadius: 2,
                }}
              >
                {outputHtml ? (
                  <div
                    className="edited-text"
                    dangerouslySetInnerHTML={{ __html: outputHtml }}
                  />
                ) : (
                  <div style={{
                    ...mono, fontSize: 10, color: '#bbb',
                    textAlign: 'center', padding: '80px 20px',
                    letterSpacing: '.12em',
                  }}>
                    // ここに編集結果が表示されます
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 実行ボタン */}
        <button
          onClick={() => handleRun()}
          disabled={!canSubmit}
          title="編集する"
          style={{
            width: '100%', background: 'transparent',
            border: `1px solid ${canSubmit ? accentColor : '#d1d5db'}`,
            color: canSubmit ? accentColor : '#9ca3af',
            ...mono, fontSize: 10, letterSpacing: '.2em',
            padding: 13, cursor: canSubmit ? 'pointer' : 'not-allowed',
            borderRadius: 2, marginTop: 8,
          }}
        >
          {isLoading ? '// 編集中...' : 'Yoroshiku'}
        </button>

        {/* ローディング */}
        {isLoading && (
          <div style={{ marginTop: 16 }}>
            <div style={{ width: '100%', height: 1, background: '#e5e7eb', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: '-40%', top: 0, width: '40%', height: '100%', background: accentColor, animation: 'sweep 1.4s ease-in-out infinite' }} />
            </div>
            <style>{`@keyframes sweep{0%{left:-40%}100%{left:140%}}`}</style>
          </div>
        )}

        {/* エラー */}
        {error && (
          <div style={{ marginTop: 12, ...mono, fontSize: 11, color: '#ef4444', lineHeight: 1.8 }}>
            // エラー: {error}
          </div>
        )}

        {/* アクションボタン行 */}
        {outputText && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {/* Note保存 */}
            <button
              onClick={handleSaveToNote}
              disabled={saved}
              title="Noteに保存"
              style={{
                background: 'transparent',
                border: `1px solid ${saved ? '#10b981' : '#d1d5db'}`,
                color: saved ? '#10b981' : '#9ca3af',
                ...mono, fontSize: 8, letterSpacing: '.12em',
                padding: '8px 16px', cursor: saved ? 'default' : 'pointer',
                borderRadius: 3,
              }}
            >
              {saved ? 'Note ✓' : 'Note +'}
            </button>

            {/* コピー */}
            <button
              onClick={handleCopy}
              title="クリップボードにコピー"
              style={{
                background: 'transparent',
                border: `1px solid ${copied ? accentColor : '#d1d5db'}`,
                color: copied ? accentColor : '#9ca3af',
                ...mono, fontSize: 9, letterSpacing: '.12em',
                padding: '8px 16px', cursor: 'pointer',
                borderRadius: 2,
              }}
            >
              {copied ? 'Copy ✓' : 'Copy ↗'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
