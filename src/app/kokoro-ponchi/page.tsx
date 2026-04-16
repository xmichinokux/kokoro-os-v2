'use client';

import { useState, useEffect, useCallback } from 'react';
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
  const mono = { fontFamily: "'Space Mono', monospace" };
  const accentColor = '#8b5cf6';

  const [inputText, setInputText] = useState('');
  const [slides, setSlides] = useState<Slide[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [strategySaved, setStrategySaved] = useState(false);
  const [ponchiMode, setPonchiMode] = useState(false);
  // スライドごとのピクトグラム（index → 状態）
  const [pictograms, setPictograms] = useState<Record<number, { svg?: string; loading: boolean; error?: string }>>({});

  const canSubmit = inputText.trim().length > 0 && !isLoading;

  // ピクトグラム生成（並列）
  const generatePictograms = useCallback(async (slideList: Slide[]) => {
    const initial: Record<number, { svg?: string; loading: boolean; error?: string }> = {};
    slideList.forEach((_, i) => { initial[i] = { loading: true }; });
    setPictograms(initial);

    await Promise.all(slideList.map(async (s, i) => {
      try {
        const res = await fetch('/api/kokoro-ponchi-pictogram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: s.title, body: s.body, type: s.type }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'ピクトグラム生成に失敗');
        setPictograms(prev => ({ ...prev, [i]: { svg: data.svg as string, loading: false } }));
      } catch (e) {
        setPictograms(prev => ({
          ...prev,
          [i]: { loading: false, error: e instanceof Error ? e.message : 'エラー' },
        }));
      }
    }));
  }, []);

  const handleRun = useCallback(async () => {
    if (!inputText.trim()) return;
    setIsLoading(true);
    setError('');
    setSlides([]);
    setPictograms({});
    setSaved(false);

    try {
      const res = await fetch('/api/kokoro-ponchi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'スライド生成に失敗しました');
      const result = data.data as PonchiResult;
      const newSlides = result.slides ?? [];
      setSlides(newSlides);
      if (ponchiMode && newSlides.length > 0) {
        generatePictograms(newSlides);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  }, [inputText, ponchiMode, generatePictograms]);

  // 後からPonchi モードをONにした場合、既存スライドにピクトグラムを生成
  const handleTogglePonchi = useCallback(() => {
    const next = !ponchiMode;
    setPonchiMode(next);
    if (next && slides.length > 0 && Object.keys(pictograms).length === 0) {
      generatePictograms(slides);
    }
  }, [ponchiMode, slides, pictograms, generatePictograms]);

  const handleSaveToNote = async () => {
    if (slides.length === 0) return;
    const body = slides.map(s => `// ${s.num} ${s.title}\n${s.body}`).join('\n\n');
    await saveToNote(body, 'Slide');
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
          }}>📊</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: accentColor }}>Slide</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>コンセプト翻訳エンジン</span>
          </div>
        </div>
        <div />
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 28px 120px' }}>

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

        {/* Ponchi モード切替 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '10px 14px', background: ponchiMode ? 'rgba(139,92,246,0.06)' : '#f8f9fa', border: `1px solid ${ponchiMode ? accentColor : '#e5e7eb'}`, borderRadius: 4 }}>
          <button
            onClick={handleTogglePonchi}
            title="スライドにピクトグラムを添える"
            style={{
              width: 36, height: 20, borderRadius: 10,
              background: ponchiMode ? accentColor : '#d1d5db',
              border: 'none', cursor: 'pointer',
              position: 'relative', padding: 0, flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute',
              top: 2, left: ponchiMode ? 18 : 2,
              width: 16, height: 16, borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.15s ease',
            }} />
          </button>
          <div>
            <div style={{ ...mono, fontSize: 10, fontWeight: 600, letterSpacing: '.1em', color: ponchiMode ? accentColor : '#6b7280' }}>
              Ponchi モード
            </div>
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, fontFamily: "'Noto Sans JP', sans-serif" }}>
              各スライドにピクトグラムを自動で添える（生成時間+20〜40秒）
            </div>
          </div>
        </div>

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
              gridTemplateColumns: '1fr',
              gap: 12, marginTop: 24,
            }}>
              {slides.map((s, i) => {
                const isKey = s.type === 'key';
                const pict = pictograms[i];
                const showPict = ponchiMode && (pict?.loading || pict?.svg || pict?.error);
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
                      display: showPict ? 'flex' : 'block',
                      gap: 16, alignItems: 'flex-start',
                    }}
                  >
                    {showPict && (
                      <div style={{
                        flexShrink: 0,
                        width: 100, height: 100,
                        background: isKey ? 'rgba(255,255,255,0.05)' : '#fff',
                        border: `1px solid ${isKey ? 'rgba(255,255,255,0.1)' : '#e5e7eb'}`,
                        borderRadius: 6,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden',
                      }}>
                        {pict?.loading && (
                          <div style={{ ...mono, fontSize: 8, color: '#9ca3af' }}>...</div>
                        )}
                        {pict?.svg && (
                          <div
                            style={{ width: '100%', height: '100%', padding: 6, boxSizing: 'border-box' }}
                            dangerouslySetInnerHTML={{ __html: pict.svg }}
                          />
                        )}
                        {pict?.error && (
                          <div style={{ ...mono, fontSize: 7, color: '#ef4444', textAlign: 'center', padding: 4 }}>
                            ×
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
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
