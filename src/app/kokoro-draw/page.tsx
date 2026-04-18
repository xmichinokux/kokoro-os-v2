'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { saveImageNote, createImageNoteId } from '@/lib/kokoro-note/imageNoteStorage';
import type { ManualImageNoteEntry } from '@/types/noteImage';
import PersonaLoading from '@/components/PersonaLoading';

type DrawStyle = 'auto' | 'photo' | 'illustration' | 'art' | 'minimal' | 'dark';

const STYLES: { key: DrawStyle; label: string; emoji: string }[] = [
  { key: 'auto',         label: 'Auto',         emoji: '✨' },
  { key: 'photo',        label: 'Photo',        emoji: '📷' },
  { key: 'illustration', label: 'Illustration', emoji: '🖌️' },
  { key: 'art',          label: 'Art',          emoji: '🎨' },
  { key: 'minimal',      label: 'Minimal',      emoji: '◻️' },
  { key: 'dark',         label: 'Dark',         emoji: '🌑' },
];

export default function KokoroDrawPage() {
  const router = useRouter();
  const mono = { fontFamily: "'Space Mono', monospace" };
  const accentColor = '#7c3aed';

  const [inputText, setInputText] = useState('');
  const [style, setStyle] = useState<DrawStyle>('auto');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [prompt, setPrompt] = useState('');
  const [saved, setSaved] = useState(false);
  const [retryMsg, setRetryMsg] = useState('');
  const [enlarged, setEnlarged] = useState(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_RETRIES = 5;

  const canSubmit = inputText.trim().length > 0 && !isLoading;

  const handleGenerate = useCallback(async (retryCount = 0) => {
    if (!inputText.trim()) return;
    setIsLoading(true);
    setError('');
    setRetryMsg('');
    if (retryCount === 0) {
      setImageUrl('');
      setPrompt('');
      setSaved(false);
      setEnlarged(false);
    }

    try {
      const res = await fetch('/api/kokoro-draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText.trim(), style }),
      });
      const data = await res.json();

      if (data.overloaded || res.status === 529) {
        if (retryCount < MAX_RETRIES) {
          setRetryMsg(`しばらくお待ちください...（${retryCount + 1}/${MAX_RETRIES}）`);
          setIsLoading(false);
          retryTimerRef.current = setTimeout(() => handleGenerate(retryCount + 1), 3000);
          return;
        }
        throw new Error('サーバーが混雑しています。時間をおいて再度お試しください。');
      }

      if (data.error) throw new Error(data.error);

      setImageUrl(data.imageUrl ?? '');
      setPrompt(data.prompt ?? '');
      setRetryMsg('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
      setRetryMsg('');
    } finally {
      setIsLoading(false);
    }
  }, [inputText, style]);

  const handleDownload = async () => {
    if (!imageUrl) return;
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `kokoro-draw-${dateStr}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(imageUrl, '_blank');
    }
  };

  const handleSaveToNote = () => {
    if (!imageUrl || saved) return;
    const now = new Date().toISOString();
    const entry: ManualImageNoteEntry = {
      id: createImageNoteId(),
      sourceType: 'manual' as const,
      createdAt: now,
      imageUrl,
      autoTitle: `Draw: ${inputText.slice(0, 20)}${inputText.length > 20 ? '…' : ''}`,
      result: {
        emotionText: prompt,
      },
    };
    saveImageNote(entry);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setImageUrl('');
    setPrompt('');
    setError('');
    setRetryMsg('');
    setInputText('');
    setSaved(false);
    setEnlarged(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#374151' }}>

      {/* ヘッダー */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid #e5e7eb',
        position: 'sticky', top: 0, background: '#fff', zIndex: 10,
      }}>
        <div>
          <span style={{ ...mono, fontSize: 13, fontWeight: 700 }}>Kokoro</span>
          <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: '#7c3aed', marginLeft: 4 }}>OS</span>
          <span style={{ ...mono, fontSize: 9, color: '#9ca3af', marginLeft: 8, letterSpacing: '0.15em' }}>// Draw</span>
        </div>
        <button onClick={() => router.push('/kokoro-chat')} title="Talk に戻る"
          style={{ ...mono, fontSize: 9, color: '#6b7280', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 2, padding: '6px 12px', cursor: 'pointer' }}>
          ← Talk
        </button>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 28px 100px' }}>

        {/* タイトル */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🎨</div>
          <div style={{ fontSize: 16, fontWeight: 400, marginBottom: 4 }}>Kokoro Draw</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>言葉から画像を生成する</div>
        </div>

        {/* スタイル選択タブ */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', marginBottom: 10 }}>
            // STYLE
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {STYLES.map(s => (
              <button key={s.key} onClick={() => setStyle(s.key)}
                style={{
                  ...mono, fontSize: 9, letterSpacing: '.06em',
                  padding: '7px 12px', borderRadius: 3, cursor: 'pointer',
                  border: `1px solid ${style === s.key ? accentColor : '#d1d5db'}`,
                  color: style === s.key ? accentColor : '#9ca3af',
                  background: style === s.key ? 'rgba(236,72,153,0.06)' : 'transparent',
                  fontWeight: style === s.key ? 600 : 400,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                <span style={{ fontSize: 13 }}>{s.emoji}</span>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* 入力 */}
        <textarea
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder="描きたいものを自由に書いてください（日本語OK）&#10;例：夕焼けの海辺を歩く猫"
          style={{
            width: '100%', minHeight: 100, background: '#f8f9fa',
            border: '1px solid #d1d5db', borderLeft: `2px solid #d1d5db`,
            padding: 16, fontSize: 14, color: '#111827',
            resize: 'vertical', outline: 'none', lineHeight: 1.8,
            fontFamily: "'Noto Serif JP', serif",
            boxSizing: 'border-box', borderRadius: '0 4px 4px 0',
          }}
          onFocus={e => e.currentTarget.style.borderLeftColor = accentColor}
          onBlur={e => e.currentTarget.style.borderLeftColor = '#d1d5db'}
        />

        {/* Yoroshiku ボタン */}
        <button
          onClick={() => handleGenerate()}
          disabled={!canSubmit}
          title="画像を生成"
          style={{
            width: '100%', background: 'transparent',
            border: `1px solid ${canSubmit ? accentColor : '#d1d5db'}`,
            color: canSubmit ? accentColor : '#9ca3af',
            ...mono, fontSize: 10, letterSpacing: '.2em',
            padding: 13, cursor: canSubmit ? 'pointer' : 'not-allowed',
            borderRadius: 2, marginTop: 8,
          }}
        >
          Yoroshiku
        </button>

        {/* ローディング */}
        {isLoading && (
          <div style={{ marginTop: 20 }}>
            <PersonaLoading />
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.8 }}>
                画像を生成しています...（30〜60秒かかる場合があります）
              </div>
            </div>
          </div>
        )}

        {/* リトライ */}
        {retryMsg && (
          <div style={{ marginTop: 16, textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 13, color: accentColor, marginBottom: 8 }}>{retryMsg}</div>
            <div style={{ ...mono, fontSize: 9, color: '#9ca3af', letterSpacing: '0.12em' }}>// auto-retry in 3s</div>
          </div>
        )}

        {/* エラー */}
        {error && (
          <div style={{ marginTop: 12, ...mono, fontSize: 11, color: '#f97316', lineHeight: 1.8 }}>
            // エラー: {error}
          </div>
        )}

        {/* 生成結果 */}
        {imageUrl && (
          <div style={{ marginTop: 24 }}>
            <div style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', marginBottom: 10 }}>
              // GENERATED IMAGE
            </div>

            {/* 画像表示 */}
            <div style={{
              position: 'relative', borderRadius: 8, overflow: 'hidden',
              border: '1px solid #e5e7eb', cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
              onClick={() => setEnlarged(true)}
            >
              <img
                src={imageUrl}
                alt="Generated"
                style={{ width: '100%', display: 'block' }}
              />
              <div style={{
                position: 'absolute', bottom: 8, right: 8,
                ...mono, fontSize: 8, color: '#fff',
                background: 'rgba(0,0,0,0.5)', borderRadius: 4,
                padding: '3px 8px', letterSpacing: '.08em',
              }}>
                click to enlarge
              </div>
            </div>

            {/* プロンプト表示 */}
            {prompt && (
              <div style={{
                marginTop: 12, padding: '10px 14px',
                background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4,
              }}>
                <div style={{ ...mono, fontSize: 7, color: '#9ca3af', letterSpacing: '.14em', marginBottom: 4 }}>
                  // PROMPT
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, wordBreak: 'break-all' }}>
                  {prompt}
                </div>
              </div>
            )}

            {/* アクションボタン */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                onClick={handleDownload}
                title="画像をダウンロード"
                style={{
                  background: 'transparent',
                  border: `1px solid ${accentColor}`,
                  color: accentColor,
                  ...mono, fontSize: 9, letterSpacing: '.12em',
                  padding: '8px 16px', cursor: 'pointer', borderRadius: 2,
                }}
              >
                Download ↓
              </button>
              <button
                onClick={handleSaveToNote}
                disabled={saved}
                title="Noteに保存"
                style={{
                  background: 'transparent',
                  border: `1px solid ${saved ? '#10b981' : '#d1d5db'}`,
                  color: saved ? '#10b981' : '#9ca3af',
                  ...mono, fontSize: 9, letterSpacing: '.12em',
                  padding: '8px 16px', cursor: saved ? 'default' : 'pointer', borderRadius: 2,
                }}
              >
                {saved ? 'Note ✓' : 'Note +'}
              </button>
              <button
                onClick={handleReset}
                title="リセット"
                style={{
                  background: 'transparent',
                  border: '1px solid #d1d5db',
                  color: '#9ca3af',
                  ...mono, fontSize: 9, letterSpacing: '.12em',
                  padding: '8px 16px', cursor: 'pointer', borderRadius: 2,
                }}
              >
                Reset ×
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 拡大オーバーレイ */}
      {enlarged && imageUrl && (
        <div
          onClick={() => setEnlarged(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out', padding: 20,
          }}
        >
          <img
            src={imageUrl}
            alt="Enlarged"
            style={{ maxWidth: '95vw', maxHeight: '95vh', borderRadius: 8 }}
          />
        </div>
      )}
    </div>
  );
}
