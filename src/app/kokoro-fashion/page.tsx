'use client';

import { useState, useEffect, useCallback } from 'react';
import { getProfile, updateInferred } from '@/lib/profile';
import type { KokoroProfile } from '@/lib/profile';
import { saveImageNote, createImageNoteId } from '@/lib/kokoro-note/imageNoteStorage';
import type { FashionNoteEntry } from '@/types/noteImage';

type FashionResult = {
  styleName: string;
  keywords: string[];
  summary: string;
  scores: { styleMatch: number; realityFit: number };
  details: {
    goodPoints: string;
    mismatches: string;
    impression: string;
    ageVision: string;
  };
  inferredUpdate: {
    fashion_axes?: Record<string, number>;
    taste_clusters?: string[];
    emotional_pattern?: string;
  };
};

export default function KokoroFashion() {
  const [preview, setPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<FashionResult | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const runAnalysis = useCallback(async (opts: {
    profile?: KokoroProfile;
    imageBase64?: string | null;
    imageMediaType?: string | null;
  }) => {
    setIsLoading(true);
    setError('');
    setResult(null);
    setDetailsOpen(false);

    try {
      const res = await fetch('/api/fashion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: opts.imageBase64 || undefined,
          imageMediaType: opts.imageMediaType || undefined,
          profile: opts.profile || getProfile(),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setResult(data);

      if (data.inferredUpdate) {
        if (data.inferredUpdate.fashion_axes) {
          updateInferred('fashion_axes', data.inferredUpdate.fashion_axes);
        }
        if (data.inferredUpdate.taste_clusters) {
          updateInferred('taste_clusters', data.inferredUpdate.taste_clusters);
        }
        if (data.inferredUpdate.emotional_pattern) {
          updateInferred('emotional_pattern', data.inferredUpdate.emotional_pattern);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '不明なエラー');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (started) return;
    setStarted(true);

    const currentProfile = getProfile();
    let intentProfile = currentProfile;
    let imgBase64: string | null = null;
    let imgType: string | null = null;

    const raw = sessionStorage.getItem('fashionIntent');
    if (raw) {
      sessionStorage.removeItem('fashionIntent');
      try {
        const intent = JSON.parse(raw);
        if (intent.profile) intentProfile = intent.profile;
        if (intent.imageBase64 && intent.imageMediaType) {
          imgBase64 = intent.imageBase64;
          imgType = intent.imageMediaType;
          setPreview(`data:${intent.imageMediaType};base64,${intent.imageBase64}`);
        }
      } catch { /* ignore */ }
    }

    // 自動診断開始
    runAnalysis({
      profile: intentProfile,
      imageBase64: imgBase64,
      imageMediaType: imgType,
    });
  }, [started, runAnalysis]);

  const handleSaveToNote = () => {
    if (!result || noteSaved) return;
    const now = new Date().toISOString();
    const entry: FashionNoteEntry = {
      id: createImageNoteId(),
      sourceType: 'fashion',
      createdAt: now,
      updatedAt: now,
      imageUrl: preview || '',
      autoTitle: result.styleName || result.summary.slice(0, 24),
      result: {
        styleName: result.styleName,
        tags: result.keywords,
        summary: result.summary,
        scores: result.scores,
        strengths: result.details.goodPoints,
        gapAndSuggestion: result.details.mismatches,
        impression: result.details.impression,
        ageContext: result.details.ageVision,
      },
    };
    saveImageNote(entry);
    setNoteSaved(true);
  };

  const ScoreBar = ({ label, value }: { label: string; value: number }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: '0.12em', color: '#6b7280', textTransform: 'uppercase' as const }}>{label}</span>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: '#7c3aed', fontWeight: 700 }}>{value}</span>
      </div>
      <div style={{ height: 4, background: '#f3f4f6', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, background: '#7c3aed', borderRadius: 2, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#1a1a1a', fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 300 }}>

      {/* header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
        <div>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700 }}>Kokoro</span>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: '#7c3aed', marginLeft: 4 }}>OS</span>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: '#9ca3af', marginLeft: 8, letterSpacing: '0.15em' }}>// Fashion</span>
        </div>
        <a href="/kokoro-chat"
          style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: '#6b7280', textDecoration: 'none', border: '1px solid #e5e7eb', borderRadius: 2, padding: '6px 12px' }}>
          ← Talk に戻る
        </a>
      </header>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px 80px' }}>

        {/* title */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>👔</div>
          <div style={{ fontSize: 18, fontWeight: 400, marginBottom: 6 }}>Fashion</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>内面が装いにどう出ているかを読む</div>
        </div>

        {/* loading */}
        {isLoading && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ height: 1, background: '#e5e7eb', position: 'relative', overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ position: 'absolute', left: '-40%', top: 0, width: '40%', height: '100%', background: '#7c3aed', animation: 'sweep 1.4s ease-in-out infinite' }} />
            </div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: '#9ca3af', letterSpacing: '0.15em' }}>// 装いを読み取り中...</div>
          </div>
        )}

        {/* result */}
        {result && (
          <div>
            {/* image preview in result */}
            {preview && (
              <div style={{ marginBottom: 24 }}>
                <img src={preview} alt="diagnosed"
                  style={{ width: '100%', borderRadius: 12, display: 'block', maxHeight: 300, objectFit: 'cover' }} />
              </div>
            )}

            {/* style name */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: '0.18em', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 12 }}>// Style Name</div>
              <div style={{ fontSize: 20, fontWeight: 400, color: '#1a1a1a', lineHeight: 1.6 }}>
                {result.styleName}
              </div>
            </div>

            {/* keywords */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 24 }}>
              {result.keywords.map((kw, i) => (
                <span key={i} style={{ fontSize: 11, padding: '4px 12px', border: '1px solid #e5e7eb', borderRadius: 20, color: '#6b7280', background: '#f9fafb' }}>
                  {kw}
                </span>
              ))}
            </div>

            {/* summary */}
            <div style={{ borderLeft: '2px solid #7c3aed', paddingLeft: 20, marginBottom: 28 }}>
              <div style={{ fontSize: 15, lineHeight: 2, color: '#374151' }}>
                {result.summary}
              </div>
            </div>

            {/* scores */}
            <div style={{ marginBottom: 28, padding: '20px', background: '#f9fafb', borderRadius: 12 }}>
              <ScoreBar label="Style Match" value={result.scores.styleMatch} />
              <ScoreBar label="Reality Fit" value={result.scores.realityFit} />
            </div>

            {/* details toggle */}
            <button onClick={() => setDetailsOpen(v => !v)}
              style={{ width: '100%', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 2, color: '#6b7280', fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '13px 20px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>{detailsOpen ? '▲ 閉じる' : '▼ 詳しく見る'}</span>
              <span style={{ fontSize: 8, color: '#9ca3af' }}>// Details</span>
            </button>

            {/* details content */}
            {detailsOpen && (
              <div style={{ marginTop: 16 }}>
                {[
                  { label: '良い点', text: result.details.goodPoints, color: '#059669' },
                  { label: 'ズレ / 提案', text: result.details.mismatches, color: '#d97706' },
                  { label: '印象', text: result.details.impression, color: '#2563eb' },
                  { label: '年齢・文脈', text: result.details.ageVision, color: '#7c3aed' },
                ].map((section, i) => (
                  <div key={i} style={{ borderLeft: `2px solid ${section.color}`, paddingLeft: 20, marginBottom: 20 }}>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: '0.18em', color: section.color, textTransform: 'uppercase', marginBottom: 10 }}>// {section.label}</div>
                    <div style={{ fontSize: 14, lineHeight: 2, color: '#374151' }}>
                      {section.text}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* footer */}
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {noteSaved ? (
                <div style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 10,
                  color: '#34d399',
                  letterSpacing: '0.1em',
                  textAlign: 'center',
                  padding: '10px 0',
                }}>
                  ✓ noteに保存しました
                </div>
              ) : (
                <button
                  onClick={handleSaveToNote}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    color: '#6b7280',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: '12px',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: "'Space Mono', monospace",
                    letterSpacing: '0.1em',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.target as HTMLButtonElement).style.borderColor = '#7c3aed';
                    (e.target as HTMLButtonElement).style.color = '#7c3aed';
                  }}
                  onMouseLeave={e => {
                    (e.target as HTMLButtonElement).style.borderColor = '#e5e7eb';
                    (e.target as HTMLButtonElement).style.color = '#6b7280';
                  }}
                >
                  noteに残す
                </button>
              )}
              <a href="/kokoro-chat"
                style={{ display: 'block', width: '100%', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '12px', fontSize: 12, cursor: 'pointer', fontFamily: "'Space Mono', monospace", letterSpacing: '0.1em', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>
                Talk に戻る →
              </a>
            </div>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 16, color: '#ef4444', fontSize: 12, textAlign: 'center' }}>{error}</div>
        )}
      </div>

      <style>{`
        @keyframes sweep { 0%{left:-40%} 100%{left:140%} }
      `}</style>
    </div>
  );
}
