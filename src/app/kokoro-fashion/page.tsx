'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { getProfile, updateInferred } from '@/lib/profile';
import type { KokoroProfile } from '@/lib/profile';
import { saveToNote } from '@/lib/saveToNote';
import PersonaLoading from '@/components/PersonaLoading';
import {
  getProfile as getKokoroProfile,
  hasProfileData,
  type KokoroUserProfile,
} from '@/lib/getProfile';

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
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMediaType, setImageMediaType] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<FashionResult | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [kokoroProfile, setKokoroProfile] = useState<KokoroUserProfile | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX = 1024;
          let w = img.width;
          let h = img.height;
          if (w > MAX || h > MAX) {
            if (w > h) { h = (h / w) * MAX; w = MAX; }
            else { w = (w / h) * MAX; h = MAX; }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('画像ファイルを選択してください');
      return;
    }
    setError('');
    const compressed = await compressImage(file);
    setPreview(compressed);
    setImageBase64(compressed.split(',')[1]);
    setImageMediaType('image/jpeg');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeImage = () => {
    setPreview(null);
    setImageBase64(null);
    setImageMediaType(null);
  };

  const runAnalysis = useCallback(async (opts: {
    profile?: KokoroProfile;
    imageBase64?: string | null;
    imageMediaType?: string | null;
    text?: string;
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
          textInput: opts.text || undefined,
          profile: opts.profile || await getProfile(),
          kokoroProfile: await getKokoroProfile(),
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

    // Kokoro Profile を読み込んでバナー表示用にstateへ
    getKokoroProfile().then(p => { if (p) setKokoroProfile(p); });

    // sessionStorage からの引き継ぎ（Talk連携）
    const raw = sessionStorage.getItem('fashionIntent');
    if (raw) {
      sessionStorage.removeItem('fashionIntent');
      try {
        const intent = JSON.parse(raw);
        if (intent.imageBase64 && intent.imageMediaType) {
          setImageBase64(intent.imageBase64);
          setImageMediaType(intent.imageMediaType);
          setPreview(`data:${intent.imageMediaType};base64,${intent.imageBase64}`);
        }
      } catch { /* ignore */ }
    }
  }, [started]);

  const handleSaveToNote = async () => {
    if (!result || noteSaved) return;
    const text = [
      `[スタイル名] ${result.styleName}`,
      result.keywords.length ? `[キーワード] ${result.keywords.join(', ')}` : '',
      '',
      result.summary,
      '',
      `[スコア] Style Match: ${result.scores.styleMatch} / Reality Fit: ${result.scores.realityFit}`,
      '',
      `[良い点]\n${result.details.goodPoints}`,
      '',
      `[ズレ / 提案]\n${result.details.mismatches}`,
      '',
      `[印象]\n${result.details.impression}`,
      '',
      `[年齢・文脈]\n${result.details.ageVision}`,
    ].filter(Boolean).join('\n');
    await saveToNote(text, 'Fashion');
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
        <div />
      </header>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px 120px' }}>

        {/* プロフィール使用中バナー */}
        {hasProfileData(kokoroProfile) && (
          <div style={{
            marginBottom: 24,
            padding: '10px 16px',
            background: 'rgba(99,102,241,0.06)',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}>
            <span style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 10,
              color: '#6366f1',
              letterSpacing: '0.12em',
            }}>
              // プロフィールを使用中
            </span>
            <a
              href="/kokoro-profile"
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 9,
                color: '#9ca3af',
                textDecoration: 'none',
                letterSpacing: '0.1em',
              }}
            >
              編集 →
            </a>
          </div>
        )}

        {/* title */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>👔</div>
          <div style={{ fontSize: 18, fontWeight: 400, marginBottom: 6 }}>Fashion</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>内面が装いにどう出ているかを読む</div>
        </div>

        {/* 入力エリア */}
        {!result && !isLoading && (
          <div>
            {/* テキスト入力 */}
            <label style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, letterSpacing: '0.18em', color: '#9ca3af', display: 'block', marginBottom: 10 }}>
              // 服装・スタイルについて
            </label>
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="例：最近カジュアルなモノトーンが多い。もう少し色を取り入れたいけど、何が合うかわからない。"
              style={{
                width: '100%', background: '#f8f9fa',
                border: '1px solid #d1d5db', borderLeft: '2px solid #d1d5db',
                borderRadius: '0 4px 4px 0',
                padding: 14, fontSize: 14, color: '#111827',
                resize: 'vertical', outline: 'none', minHeight: 80,
                fontFamily: "'Noto Sans JP', sans-serif",
                boxSizing: 'border-box',
              }}
              onFocus={e => e.currentTarget.style.borderLeftColor = '#7c3aed'}
              onBlur={e => e.currentTarget.style.borderLeftColor = '#d1d5db'}
            />

            {/* 画像アップロード */}
            <div style={{ marginTop: 16 }}>
              <label style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, letterSpacing: '0.18em', color: '#9ca3af', display: 'block', marginBottom: 10 }}>
                // 画像（任意）
              </label>
              {!preview ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: '2px dashed #e5e7eb', borderRadius: 12,
                    padding: '32px 20px', textAlign: 'center', cursor: 'pointer',
                    transition: 'border-color .2s', background: '#f9fafb',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#7c3aed')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
                >
                  <div style={{ fontSize: 28, marginBottom: 8 }}>👔</div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>服装の画像をドロップ</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>またはクリックして選択</div>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <img src={preview} alt="preview"
                    style={{ width: '100%', borderRadius: 12, display: 'block', maxHeight: 300, objectFit: 'cover' }} />
                  <button onClick={removeImage}
                    style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,.5)', color: '#fff', border: 'none', borderRadius: 20, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}>
                    ✕ 変更
                  </button>
                </div>
              )}
            </div>

            {/* Yoroshiku ボタン */}
            <button
              onClick={() => runAnalysis({ imageBase64, imageMediaType, text: inputText })}
              disabled={!inputText.trim() && !imageBase64}
              title="診断する"
              style={{
                width: '100%', background: 'transparent',
                border: `1px solid ${(inputText.trim() || imageBase64) ? '#7c3aed' : '#d1d5db'}`,
                color: (inputText.trim() || imageBase64) ? '#7c3aed' : '#9ca3af',
                fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: '0.2em',
                padding: 13, cursor: (inputText.trim() || imageBase64) ? 'pointer' : 'not-allowed',
                borderRadius: 2, marginTop: 16,
              }}
            >
              Yoroshiku
            </button>
          </div>
        )}

        {/* loading */}
        {isLoading && <PersonaLoading />}

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
              title={detailsOpen ? '閉じる' : '詳しく見る'}
              style={{ width: '100%', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 2, color: '#6b7280', fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '13px 20px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>{detailsOpen ? '▲' : 'Details ▼'}</span>
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
                <a
                  href="/kokoro-browser"
                  title="noteに保存しました"
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: 11,
                    color: '#34d399',
                    border: '1px solid rgba(52,211,153,0.4)',
                    borderRadius: 6,
                    padding: '8px 18px',
                    cursor: 'pointer',
                    letterSpacing: '0.1em',
                    textDecoration: 'none',
                    display: 'block',
                    textAlign: 'center',
                  }}
                >
                  Note ✓
                </a>
              ) : (
                <button
                  onClick={handleSaveToNote}
                  title="noteに残す"
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
                  Note +
                </button>
              )}
              <button
                onClick={() => { setResult(null); setNoteSaved(false); }}
                style={{
                  width: '100%', background: 'transparent', color: '#6b7280',
                  border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px',
                  fontSize: 12, cursor: 'pointer', fontFamily: "'Space Mono', monospace",
                  letterSpacing: '0.1em',
                }}
              >
                もう一度診断する
              </button>
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
