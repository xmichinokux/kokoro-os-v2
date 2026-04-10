'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { saveToNote } from '@/lib/saveToNote';
import { saveStrategyInput } from '@/lib/strategyInputs';
import PersonaLoading from '@/components/PersonaLoading';

type Slide = {
  num: string;
  type: 'title' | 'problem' | 'solution' | 'value' | 'key' | 'next';
  title: string;
  body: string;
};

type PonchiResult = { slides: Slide[] };

export default function KokoroPonchiPage() {
  const router = useRouter();
  const mono = { fontFamily: "'Space Mono', monospace" };
  const accentColor = '#8b5cf6';

  const [inputText, setInputText] = useState('');
  const [slides, setSlides] = useState<Slide[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [strategySaved, setStrategySaved] = useState(false);

  const canSubmit = inputText.trim().length > 0 && !isLoading;

  const handleRun = useCallback(async () => {
    if (!inputText.trim()) return;
    setIsLoading(true);
    setError('');
    setSlides([]);
    setSaved(false);

    try {
      const res = await fetch('/api/kokoro-ponchi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText.trim() }),
      });
      if (!res.ok) throw new Error('スライド生成に失敗しました');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const result = data.data as PonchiResult;
      setSlides(result.slides ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  }, [inputText]);

  const handleSaveToNote = () => {
    if (slides.length === 0) return;
    const body = slides.map(s => `// ${s.num} ${s.title}\n${s.body}`).join('\n\n');
    saveToNote(body, 'Ponchi');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveToStrategy = () => {
    if (slides.length === 0) return;
    const body = slides.map(s => `// ${s.num} ${s.title}\n${s.body}`).join('\n\n');
    saveStrategyInput('ponchi', body);
    setStrategySaved(true);
    setTimeout(() => setStrategySaved(false), 2000);
  };

  const formatBody = (body: string) =>
    body.split('・').map((part, i) => i === 0 ? part : '・' + part).join('\n');

  useEffect(() => {
    const raw = sessionStorage.getItem('ponchiFromTalk');
    if (!raw) return;
    sessionStorage.removeItem('ponchiFromTalk');
    let userText = '';
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.userText === 'string') userText = parsed.userText;
    } catch {
      userText = raw;
    }
    if (userText) setInputText(userText);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#374151' }}>

      <header style={{
        padding: '14px 28px', borderBottom: '1px solid #e5e7eb',
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 32, height: 32, border: `1px solid rgba(139,92,246,0.3)`,
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(circle at 40% 40%,rgba(139,92,246,0.1) 0%,transparent 70%)',
            fontSize: 16,
          }}>🎨</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: accentColor }}>Ponchi</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>コンセプト翻訳エンジン</span>
          </div>
        </div>
        <button
          onClick={() => router.push('/kokoro-chat')}
          title="Talkに戻る"
          style={{ ...mono, fontSize: 9, letterSpacing: '.12em', color: '#9ca3af', background: 'transparent', border: '1px solid #e5e7eb', padding: '5px 14px', borderRadius: 3, cursor: 'pointer' }}
        >
          ← Talk
        </button>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 28px 100px' }}>

        <p style={{
          fontSize: 13, color: '#9ca3af', lineHeight: 1.9,
          marginBottom: 28, padding: '14px 18px',
          borderLeft: '2px solid #d1d5db', fontStyle: 'italic',
        }}>
          コンセプトや概要を入力すると、プレゼン向けのスライド構成に翻訳します。
        </p>

        <label style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', display: 'block', marginBottom: 10 }}>
          // コンセプト・アイデア・概要
        </label>
        <textarea
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder="例：地域の農家とカフェを繋ぐマッチングアプリのアイデア。農家の廃棄ロスを減らしつつ、カフェが新鮮な食材を仕入れられる仕組みを作りたい。"
          style={{
            width: '100%', background: '#f8f9fa',
            border: '1px solid #d1d5db', borderLeft: '2px solid #d1d5db',
            borderRadius: '0 4px 4px 0',
            padding: 14, fontSize: 14, color: '#111827',
            resize: 'vertical', outline: 'none', minHeight: 80,
            fontFamily: "'Noto Sans JP', sans-serif",
            boxSizing: 'border-box',
          }}
          onFocus={e => e.currentTarget.style.borderLeftColor = accentColor}
          onBlur={e => e.currentTarget.style.borderLeftColor = '#d1d5db'}
        />

        <button
          onClick={handleRun}
          disabled={!canSubmit}
          title="プレゼン化する"
          style={{
            width: '100%', background: 'transparent',
            border: `1px solid ${canSubmit ? accentColor : '#d1d5db'}`,
            color: canSubmit ? accentColor : '#9ca3af',
            ...mono, fontSize: 10, letterSpacing: '.2em',
            padding: 13, cursor: canSubmit ? 'pointer' : 'not-allowed',
            borderRadius: 2, marginTop: 12,
          }}
        >
          {isLoading ? '// 変換中...' : 'Yoroshiku'}
        </button>

        {isLoading && <PersonaLoading />}

        {error && (
          <div style={{ marginTop: 12, ...mono, fontSize: 11, color: '#ef4444', lineHeight: 1.8 }}>
            // エラー: {error}
          </div>
        )}

        {/* スライドグリッド */}
        {slides.length > 0 && (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 12, marginTop: 24,
            }}>
              {slides.map((s, i) => {
                const isKey = s.type === 'key';
                return (
                  <div
                    key={i}
                    style={{
                      background: isKey ? '#111827' : '#f8f9fa',
                      border: '1px solid #e5e7eb',
                      borderTop: isKey ? '3px solid #111827' : `3px solid ${accentColor}`,
                      padding: 20, borderRadius: '0 4px 4px 0',
                      gridColumn: isKey ? '1 / -1' : undefined,
                      animation: `fadeUp 0.4s ease-out ${(i + 1) * 0.05}s both`,
                    }}
                  >
                    <div style={{
                      ...mono, fontSize: 8,
                      color: isKey ? '#9ca3af' : accentColor,
                      letterSpacing: '.14em', marginBottom: 8,
                    }}>
                      // {s.num}
                    </div>
                    <div style={{
                      fontFamily: "'Noto Sans JP', sans-serif",
                      fontSize: isKey ? 20 : 16, fontWeight: 600,
                      color: isKey ? '#fff' : '#111827',
                      marginBottom: 10, lineHeight: 1.3,
                    }}>
                      {s.title}
                    </div>
                    <div style={{
                      fontSize: 13,
                      color: isKey ? '#d1d5db' : '#374151',
                      lineHeight: 1.8, whiteSpace: 'pre-wrap',
                    }}>
                      {formatBody(s.body)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* アクションボタン */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                onClick={handleSaveToNote}
                disabled={saved}
                title={saved ? 'Noteに保存しました' : 'Noteに保存'}
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
              <button
                onClick={handleSaveToStrategy}
                disabled={strategySaved}
                title={strategySaved ? 'Strategyに保存しました' : 'Strategyに送る'}
                style={{
                  background: 'transparent',
                  border: `1px solid ${strategySaved ? '#f59e0b' : '#d1d5db'}`,
                  color: strategySaved ? '#f59e0b' : '#9ca3af',
                  ...mono, fontSize: 8, letterSpacing: '.12em',
                  padding: '8px 16px', cursor: strategySaved ? 'default' : 'pointer',
                  borderRadius: 3,
                }}
              >
                {strategySaved ? 'Strategy ✓' : 'Strategy →'}
              </button>
            </div>
          </>
        )}

        <style>{`
          @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes sweep { 0% { left: -40%; } 100% { left: 140%; } }
          @media (max-width: 600px) {
            .ponchi-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </div>
  );
}
