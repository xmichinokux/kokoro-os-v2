'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { consumeRecipeInput } from '@/lib/kokoro/recipeInput';
import type { KokoroRecipeInput, KokoroRecipeResult, DayRecipe } from '@/types/recipe';

export default function KokoroRecipePage() {
  const router = useRouter();
  const [input, setInput] = useState<KokoroRecipeInput>({ source: 'manual' });
  const [manualText, setManualText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<KokoroRecipeResult | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [error, setError] = useState('');

  const generateRecipe = useCallback(async (inputData?: KokoroRecipeInput) => {
    const payload = inputData ?? {
      ...input,
      weeklyStateText: manualText || undefined,
    };

    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/kokoro-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('生成失敗');
      const data: KokoroRecipeResult = await res.json();
      setResult(data);
      setOpenDay(data.days[0]?.day ?? null);
    } catch {
      setError('レシピの生成に失敗しました。もう一度お試しください。');
    } finally {
      setIsLoading(false);
    }
  }, [input, manualText]);

  // マウント時にlocalStorageから入力を取得
  useEffect(() => {
    const saved = consumeRecipeInput();
    if (saved) {
      setInput(saved);
      if (saved.relatedSummary) {
        generateRecipe(saved);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mono = { fontFamily: "'Space Mono', monospace" };

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf9', color: '#1a1a1a' }}>
      {/* ヘッダー */}
      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#ffffff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.push('/kokoro-chat')}
            style={{ ...mono, fontSize: 9, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ← Talkへ戻る
          </button>
          <span style={{ ...mono, fontSize: 11, color: '#7c3aed', letterSpacing: '0.15em' }}>
            // Kokoro Recipe
          </span>
        </div>
      </header>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>

        {/* source由来ラベル */}
        {input.source !== 'manual' && input.relatedSummary && (
          <div style={{
            marginBottom: 24, padding: '12px 16px',
            background: 'rgba(124,58,237,0.06)',
            border: '1px solid rgba(124,58,237,0.2)',
            borderRadius: 8,
          }}>
            <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginBottom: 4 }}>
              // {input.source === 'talk' ? 'Talk' : input.source === 'zen' ? 'Zen' : 'Note'}由来
            </div>
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
              {input.relatedSummary.slice(0, 80)}{input.relatedSummary.length > 80 ? '…' : ''}
            </div>
          </div>
        )}

        {/* 手動入力 or 生成ボタン */}
        {!result && (
          <>
            {input.source === 'manual' && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginBottom: 8 }}>
                  // 今週の状態を教えてください
                </div>
                <textarea
                  value={manualText}
                  onChange={e => setManualText(e.target.value)}
                  placeholder="例：最近少し停滞してる。何か変えたい気分。"
                  rows={3}
                  style={{
                    width: '100%', padding: '12px 16px',
                    border: '1px solid #e5e7eb', borderRadius: 8,
                    fontSize: 14, lineHeight: 1.7, resize: 'vertical',
                    fontFamily: 'Noto Serif JP, serif', color: '#374151',
                    background: '#ffffff', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {!isLoading && (
              <button
                onClick={() => generateRecipe()}
                style={{
                  width: '100%', padding: '14px',
                  background: '#7c3aed', color: '#ffffff',
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                  ...mono, fontSize: 12, letterSpacing: '0.1em',
                }}
              >
                1週間のRecipeを作る
              </button>
            )}

            {isLoading && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ height: 1, background: '#e5e7eb', position: 'relative', overflow: 'hidden', marginBottom: 16 }}>
                  <div style={{ position: 'absolute', left: '-40%', top: 0, width: '40%', height: '100%', background: '#7c3aed', animation: 'sweep 1.4s ease-in-out infinite' }} />
                </div>
                <div style={{ ...mono, fontSize: 9, color: '#9ca3af', letterSpacing: '0.15em' }}>
                  // 1週間のRecipeを生成中...
                </div>
              </div>
            )}
          </>
        )}

        {error && (
          <div style={{ marginTop: 16, color: '#ef4444', fontSize: 13 }}>{error}</div>
        )}

        {/* 結果表示 */}
        {result && (
          <div style={{ marginTop: 8 }}>
            {/* 週のコンセプト */}
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              {result.sourceLabel && (
                <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginBottom: 6 }}>
                  // {result.sourceLabel}
                </div>
              )}
              <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginBottom: 8 }}>
                // 今週のコンセプト
              </div>
              <div style={{
                fontSize: 20, fontWeight: 700,
                fontFamily: 'Noto Serif JP, serif', color: '#1a1a1a',
              }}>
                {result.weekConcept}
              </div>
            </div>

            {/* 7日分のアコーディオン */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.days.map((day: DayRecipe) => (
                <div key={day.day} style={{
                  border: '1px solid',
                  borderColor: openDay === day.day ? 'rgba(124,58,237,0.4)' : '#e5e7eb',
                  borderRadius: 12, overflow: 'hidden',
                  background: openDay === day.day ? 'rgba(124,58,237,0.03)' : '#ffffff',
                  transition: 'all 0.2s',
                }}>
                  {/* 日付ヘッダー */}
                  <button
                    onClick={() => setOpenDay(openDay === day.day ? null : day.day)}
                    style={{
                      width: '100%', padding: '16px 20px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{
                        ...mono, fontSize: 11, color: '#7c3aed',
                        width: 24, textAlign: 'center',
                      }}>
                        {day.day}
                      </span>
                      <span style={{
                        fontSize: 15, fontWeight: 600,
                        fontFamily: 'Noto Serif JP, serif', color: '#1a1a1a',
                      }}>
                        {day.title}
                      </span>
                    </div>
                    <span style={{ ...mono, fontSize: 10, color: '#9ca3af' }}>
                      {openDay === day.day ? '▲' : '▼'}
                    </span>
                  </button>

                  {/* 展開コンテンツ */}
                  {openDay === day.day && (
                    <div style={{ padding: '0 20px 20px' }}>
                      {/* コンセプト */}
                      <div style={{
                        borderLeft: '2px solid #7c3aed', paddingLeft: 12,
                        marginBottom: 20, color: '#6b7280', fontSize: 13, lineHeight: 1.7,
                      }}>
                        {day.concept}
                      </div>

                      {/* 食材 */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginBottom: 6 }}>
                          // 食材
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {day.ingredients.map((ing, i) => (
                            <span key={i} style={{
                              fontSize: 12, padding: '3px 10px',
                              background: '#f3f4f6', color: '#374151', borderRadius: 20,
                            }}>
                              {ing}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* 手順 */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginBottom: 6 }}>
                          // 手順
                        </div>
                        <ol style={{ paddingLeft: 16, margin: 0 }}>
                          {day.steps.map((step, i) => (
                            <li key={i} style={{
                              fontSize: 13, lineHeight: 1.8, color: '#374151', marginBottom: 4,
                            }}>
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>

                      {/* 飛躍ポイント */}
                      <div style={{
                        marginBottom: 12, padding: '12px 14px',
                        background: 'rgba(124,58,237,0.06)',
                        border: '1px solid rgba(124,58,237,0.15)',
                        borderRadius: 8,
                      }}>
                        <div style={{ ...mono, fontSize: 9, color: '#7c3aed', marginBottom: 4 }}>
                          // 飛躍ポイント
                        </div>
                        <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
                          {day.leap}
                        </div>
                      </div>

                      {/* 次の一手 */}
                      <div style={{
                        padding: '10px 14px',
                        background: '#f9fafb', borderRadius: 8,
                      }}>
                        <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginBottom: 4 }}>
                          // 次の一手
                        </div>
                        <div style={{ fontSize: 13, color: '#6b7280' }}>
                          {day.nextAction}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 再生成 */}
            <div style={{ marginTop: 32, display: 'flex', gap: 12 }}>
              <button
                onClick={() => { setResult(null); setOpenDay(null); }}
                style={{
                  flex: 1, padding: '12px',
                  background: 'transparent',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8, cursor: 'pointer',
                  ...mono, fontSize: 11, color: '#6b7280',
                }}
              >
                もう一度作る
              </button>
              <button
                onClick={() => router.push('/kokoro-chat')}
                style={{
                  flex: 1, padding: '12px',
                  background: 'rgba(124,58,237,0.06)',
                  border: '1px solid rgba(124,58,237,0.3)',
                  borderRadius: 8, cursor: 'pointer',
                  ...mono, fontSize: 11, color: '#7c3aed',
                }}
              >
                Talkで続きを話す →
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes sweep { 0%{left:-40%} 100%{left:140%} }
      `}</style>
    </div>
  );
}
