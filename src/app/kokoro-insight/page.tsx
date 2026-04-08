'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InsightReviewInput, InsightResult } from '@/types/insight';

const AXIS_LABELS: Record<string, string> = {
  energy:       'Energy',
  distortion:   'Distortion',
  resolution:   'Resolution',
  contradiction:'Contradiction',
  selfImpact:   'Self-Impact',
};

export default function KokoroInsightPage() {
  const router = useRouter();
  const mono = { fontFamily: "'Space Mono', monospace" };

  // 入力state
  const [workTitle, setWorkTitle] = useState('');
  const [contextFilter, setContextFilter] = useState(false);
  const [reviews, setReviews] = useState<InsightReviewInput[]>([
    { id: '1', text: '', isNegative: false },
    { id: '2', text: '', isNegative: false },
  ]);

  // 結果state
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<InsightResult | null>(null);
  const [error, setError] = useState('');

  const addReview = () => {
    if (reviews.length >= 3) return;
    setReviews(prev => [...prev, { id: String(Date.now()), text: '', isNegative: false }]);
  };

  const updateReview = (id: string, field: keyof InsightReviewInput, value: string | boolean) => {
    setReviews(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const canSubmit = reviews.some(r => r.text.trim().length > 0);

  const handleSubmit = async () => {
    if (!canSubmit || isLoading) return;
    setIsLoading(true);
    setError('');
    try {
      const validReviews = reviews.filter(r => r.text.trim().length > 0);
      const res = await fetch('/api/kokoro-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workTitle: workTitle || '（作品名未入力）',
          contextFilterEnabled: contextFilter,
          reviews: validReviews,
        }),
      });
      if (!res.ok) throw new Error('失敗');
      const data: InsightResult = await res.json();
      setResult(data);
    } catch {
      setError('解析に失敗しました。もう一度お試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setWorkTitle('');
    setReviews([
      { id: '1', text: '', isNegative: false },
      { id: '2', text: '', isNegative: false },
    ]);
    setContextFilter(false);
    setError('');
  };

  // スコアバー
  const ScoreBar = ({ value, max = 5, color = '#7c3aed' }: { value: number; max?: number; color?: string }) => (
    <div style={{ height: 6, background: '#1a1a2e', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${(value / max) * 100}%`,
        background: color, borderRadius: 3, transition: 'width 0.8s ease',
      }} />
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e2eaf8' }}>
      {/* ヘッダー */}
      <header style={{
        padding: '16px 24px', borderBottom: '1px solid #1a1a2e',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#080810',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.push('/kokoro-chat')}
            style={{ ...mono, fontSize: 9, color: '#4a4a6a', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ← Talk
          </button>
          <span style={{ ...mono, fontSize: 11, color: '#7c3aed', letterSpacing: '0.15em' }}>
            // Kokoro Insight
          </span>
          <span style={{ ...mono, fontSize: 9, color: '#4a4a6a' }}>— LAB</span>
        </div>
      </header>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 24px' }}>

        {!result ? (
          <>
            {/* キャッチ */}
            <div style={{ marginBottom: 40, textAlign: 'center' }}>
              <div style={{ ...mono, fontSize: 9, color: '#4a4a6a', marginBottom: 12, letterSpacing: '0.2em' }}>
                // IMPACT ANALYSIS ENGINE
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, lineHeight: 1.4 }}>
                レビューの歪みから<br />本当の衝撃を逆算する
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7 }}>
                酷評・拒絶反応も歓迎。「気分が悪くなる」「二度と聴かない」<br />
                から作品の本来の影響を読む。
              </div>
            </div>

            {/* 作品名 */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ ...mono, fontSize: 9, color: '#4a4a6a', marginBottom: 8 }}>// 作品名</div>
              <input
                value={workTitle}
                onChange={e => setWorkTitle(e.target.value)}
                placeholder="例：Heartwork / Carcass"
                style={{
                  width: '100%', padding: '12px 16px',
                  background: '#0f0f1a', border: '1px solid #1a1a2e',
                  borderRadius: 8, color: '#e2eaf8', fontSize: 14,
                  ...mono, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Context Filter */}
            <div style={{
              marginBottom: 28, padding: '12px 16px',
              background: '#0f0f1a', border: '1px solid #1a1a2e',
              borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <input
                type="checkbox"
                id="ctxFilter"
                checked={contextFilter}
                onChange={e => setContextFilter(e.target.checked)}
                style={{ accentColor: '#7c3aed', width: 16, height: 16, cursor: 'pointer' }}
              />
              <label htmlFor="ctxFilter" style={{ cursor: 'pointer', flex: 1 }}>
                <div style={{ ...mono, fontSize: 10, color: '#7c3aed', marginBottom: 2 }}>
                  Context Filter
                </div>
                <div style={{ fontSize: 12, color: '#4a4a6a', lineHeight: 1.5 }}>
                  時代背景・人気・メディア評価を除外し、音・熱・歪み・衝撃のみを読む
                </div>
              </label>
            </div>

            {/* レビュー入力 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ ...mono, fontSize: 9, color: '#4a4a6a', marginBottom: 12 }}>
                // レビュー / 感想（1〜3件）
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {reviews.map((r, i) => (
                  <div key={r.id} style={{
                    padding: '16px', background: '#0f0f1a',
                    border: `1px solid ${r.isNegative ? 'rgba(239,68,68,0.3)' : '#1a1a2e'}`,
                    borderRadius: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ ...mono, fontSize: 9, color: '#4a4a6a' }}>
                        // レビュー {i + 1}
                      </span>
                      <label style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        cursor: 'pointer', marginLeft: 'auto',
                      }}>
                        <input
                          type="checkbox"
                          checked={r.isNegative ?? false}
                          onChange={e => updateReview(r.id, 'isNegative', e.target.checked)}
                          style={{ accentColor: '#ef4444', cursor: 'pointer' }}
                        />
                        <span style={{ ...mono, fontSize: 9, color: r.isNegative ? '#ef4444' : '#4a4a6a' }}>
                          酷評 / 否定的
                        </span>
                      </label>
                    </div>
                    <textarea
                      value={r.text}
                      onChange={e => updateReview(r.id, 'text', e.target.value)}
                      placeholder="レビュー・感想をそのまま貼り付けてください。酷評・拒絶レビューも歓迎。"
                      rows={4}
                      style={{
                        width: '100%', padding: '10px 0',
                        background: 'transparent', border: 'none',
                        borderTop: '1px solid #1a1a2e',
                        color: '#e2eaf8', fontSize: 13, lineHeight: 1.8,
                        resize: 'vertical', outline: 'none',
                        fontFamily: 'Noto Serif JP, serif',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                ))}
              </div>

              {reviews.length < 3 && (
                <button
                  onClick={addReview}
                  style={{
                    marginTop: 8, ...mono, fontSize: 10,
                    color: '#4a4a6a', background: 'none', border: 'none',
                    cursor: 'pointer', letterSpacing: '0.1em',
                  }}
                >
                  + レビューを追加
                </button>
              )}
            </div>

            {/* 実行ボタン */}
            {!isLoading ? (
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{
                  width: '100%', padding: '16px',
                  background: !canSubmit
                    ? '#1a1a2e'
                    : 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                  color: !canSubmit ? '#4a4a6a' : '#ffffff',
                  border: 'none', borderRadius: 8,
                  cursor: !canSubmit ? 'default' : 'pointer',
                  ...mono, fontSize: 12, letterSpacing: '0.15em',
                }}
              >
                インパクトを判定する
              </button>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <div style={{ height: 1, background: '#1a1a2e', position: 'relative', overflow: 'hidden', marginBottom: 16 }}>
                  <div style={{ position: 'absolute', left: '-40%', top: 0, width: '40%', height: '100%', background: '#7c3aed', animation: 'sweep 1.4s ease-in-out infinite' }} />
                </div>
                <div style={{ ...mono, fontSize: 9, color: '#4a4a6a', letterSpacing: '0.15em' }}>
                  // 影響を逆算中...
                </div>
              </div>
            )}

            {error && (
              <div style={{ marginTop: 12, color: '#ef4444', fontSize: 13, ...mono }}>
                {error}
              </div>
            )}
          </>
        ) : (
          /* ─── 結果画面 ─── */
          <div>
            {/* 作品名 */}
            <div style={{ ...mono, fontSize: 9, color: '#4a4a6a', marginBottom: 4 }}>
              // {workTitle || '（無題）'}
            </div>

            {/* 総合スコアカード */}
            <div style={{
              marginBottom: 32, padding: '28px',
              background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(79,70,229,0.1))',
              border: '1px solid rgba(124,58,237,0.3)',
              borderRadius: 16, textAlign: 'center',
            }}>
              <div style={{ fontSize: 56, fontWeight: 800, color: '#e2eaf8', lineHeight: 1 }}>
                {result.score.toFixed(1)}
              </div>
              <div style={{ ...mono, fontSize: 10, color: '#9ca3af', marginTop: 4, marginBottom: 12 }}>/ 5.0</div>
              <div style={{
                display: 'inline-block', padding: '4px 14px',
                background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.4)',
                borderRadius: 20, ...mono, fontSize: 11, color: '#a78bfa', marginBottom: 16,
              }}>
                {result.label}
              </div>
              <div style={{ fontSize: 14, color: '#b0b8d0', lineHeight: 1.8 }}>
                {result.summary}
              </div>
            </div>

            {/* Technical / Soul */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              {[
                { key: 'technical', label: 'Technical', desc: '構造・完成度・技術の精度', color: '#60a5fa' },
                { key: 'soul', label: 'Soul', desc: '情念・野生・衝動・魂の密度', color: '#f472b6' },
              ].map(({ key, label, desc, color }) => (
                <div key={key} style={{
                  padding: '16px', background: '#0f0f1a',
                  border: '1px solid #1a1a2e', borderRadius: 12,
                }}>
                  <div style={{ ...mono, fontSize: 9, color, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#e2eaf8', marginBottom: 6 }}>
                    {result.axes[key as keyof typeof result.axes].toFixed(1)}
                  </div>
                  <ScoreBar value={result.axes[key as keyof typeof result.axes]} color={color} />
                  <div style={{ fontSize: 10, color: '#4a4a6a', marginTop: 6 }}>{desc}</div>
                </div>
              ))}
            </div>

            {/* 5軸分析 */}
            <div style={{
              marginBottom: 24, padding: '20px',
              background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 12,
            }}>
              <div style={{ ...mono, fontSize: 9, color: '#4a4a6a', marginBottom: 16 }}>
                // 5-Axis Analysis
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Object.entries(AXIS_LABELS).map(([key, label]) => (
                  <div key={key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ ...mono, fontSize: 10, color: '#9ca3af' }}>{label}</span>
                      <span style={{ ...mono, fontSize: 10, color: '#7c3aed' }}>
                        {result.axes[key as keyof typeof result.axes].toFixed(1)}
                      </span>
                    </div>
                    <ScoreBar value={result.axes[key as keyof typeof result.axes]} />
                  </div>
                ))}
              </div>
            </div>

            {/* Rawness / Pathos */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              {[
                { key: 'rawness', label: 'Rawness', desc: '魂の純度 / 荒削りさ / 野生の残量', color: '#fb923c' },
                { key: 'pathos', label: 'Pathos', desc: '情念 / 哀感 / 感情の痕跡', color: '#c084fc' },
              ].map(({ key, label, desc, color }) => (
                <div key={key} style={{
                  padding: '16px', background: '#0f0f1a',
                  border: '1px solid #1a1a2e', borderRadius: 12,
                }}>
                  <div style={{ ...mono, fontSize: 9, color, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#e2eaf8', marginBottom: 6 }}>
                    {result.axes[key as keyof typeof result.axes].toFixed(1)}
                  </div>
                  <ScoreBar value={result.axes[key as keyof typeof result.axes]} color={color} />
                  <div style={{ fontSize: 10, color: '#4a4a6a', marginTop: 6 }}>{desc}</div>
                </div>
              ))}
            </div>

            {/* True Score */}
            <div style={{
              marginBottom: 24, padding: '20px',
              background: 'rgba(251,146,60,0.08)',
              border: '1px solid rgba(251,146,60,0.3)',
              borderRadius: 12, textAlign: 'center',
            }}>
              <div style={{ ...mono, fontSize: 9, color: '#fb923c', marginBottom: 4 }}>// True Score</div>
              <div style={{ fontSize: 36, fontWeight: 800, color: '#fb923c' }}>
                {result.axes.trueScore.toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: '#4a4a6a', marginTop: 4 }}>
                Kokoro 補正済みの残響値
              </div>
            </div>

            {/* レビューの読み直し */}
            <div style={{
              marginBottom: 24, padding: '20px',
              background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 12,
            }}>
              <div style={{ ...mono, fontSize: 9, color: '#4a4a6a', marginBottom: 12 }}>
                // 影響の読み直し
              </div>
              <div style={{ fontSize: 14, color: '#b0b8d0', lineHeight: 1.8 }}>
                {result.reread}
              </div>
            </div>

            {/* 誤読サイン */}
            {result.misreadSignals.length > 0 && (
              <div style={{
                marginBottom: 24, padding: '20px',
                background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 12,
              }}>
                <div style={{ ...mono, fontSize: 9, color: '#4a4a6a', marginBottom: 12 }}>
                  // 誤読サイン
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {result.misreadSignals.map((sig, i) => (
                    <div key={i} style={{
                      padding: '12px 14px',
                      background: 'rgba(124,58,237,0.06)',
                      border: '1px solid rgba(124,58,237,0.15)',
                      borderRadius: 8,
                    }}>
                      <div style={{
                        fontSize: 12, color: '#a78bfa',
                        fontStyle: 'italic', marginBottom: 6,
                        borderLeft: '2px solid rgba(124,58,237,0.5)',
                        paddingLeft: 10,
                      }}>
                        「{sig.quote}」
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6 }}>
                        {sig.interpretation}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5君からの一言 */}
            <div style={{
              marginBottom: 24, padding: '20px',
              background: 'rgba(79,70,229,0.08)',
              border: '1px solid rgba(79,70,229,0.3)',
              borderRadius: 12,
            }}>
              <div style={{ ...mono, fontSize: 9, color: '#818cf8', marginBottom: 8 }}>
                // 5君からの一言
              </div>
              <div style={{ fontSize: 14, color: '#c7d2fe', lineHeight: 1.8, fontStyle: 'italic' }}>
                {result.fiveComment}
              </div>
            </div>

            {/* 過大評価バグ検出 */}
            {result.overratedBug && (
              <div style={{
                marginBottom: 24, padding: '16px 20px',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: 12,
              }}>
                <div style={{ ...mono, fontSize: 9, color: '#ef4444', marginBottom: 8 }}>
                  ⚠ 過大評価バグ検出
                </div>
                <div style={{ fontSize: 13, color: '#fca5a5', lineHeight: 1.7 }}>
                  {result.overratedBug}
                </div>
              </div>
            )}

            {/* アクション */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={handleReset}
                style={{
                  flex: 1, minWidth: 140, padding: '12px',
                  background: 'transparent',
                  border: '1px solid #1a1a2e',
                  borderRadius: 8, cursor: 'pointer',
                  ...mono, fontSize: 11, color: '#4a4a6a',
                }}
              >
                別の作品を判定する
              </button>
              <button
                onClick={() => router.push('/kokoro-chat')}
                style={{
                  flex: 1, minWidth: 140, padding: '12px',
                  background: 'rgba(124,58,237,0.1)',
                  border: '1px solid rgba(124,58,237,0.3)',
                  borderRadius: 8, cursor: 'pointer',
                  ...mono, fontSize: 11, color: '#a78bfa',
                }}
              >
                Talkで話す →
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
