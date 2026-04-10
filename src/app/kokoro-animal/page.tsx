'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { saveImageNote, createImageNoteId } from '@/lib/kokoro-note/imageNoteStorage';
import type { AnimalTalkNoteEntry } from '@/types/noteImage';
import PersonaLoading from '@/components/PersonaLoading';

export default function KokoroAnimal() {
  const [preview, setPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mainText, setMainText] = useState('');
  const [question, setQuestion] = useState('');
  const [instinctWhisper, setInstinctWhisper] = useState('');
  const [error, setError] = useState('');
  const [scores, setScores] = useState<Record<string,number> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [autoStarted, setAutoStarted] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const analyzeWithData = useCallback(async (base64: string, type: string) => {
    setIsLoading(true);
    setError('');
    setMainText('');
    setQuestion('');
    setInstinctWhisper('');
    setScores(null);
    try {
      const res = await fetch('/api/kokoro-animal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType: type }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMainText(data.mainText);
      setQuestion(data.question);
      setInstinctWhisper(data.instinctWhisper || '');
      setScores(data.scores || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '不明なエラー');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem('animalTalkImage');
    if (stored && !autoStarted) {
      sessionStorage.removeItem('animalTalkImage');
      setAutoStarted(true);
      try {
        const { base64, mediaType: type } = JSON.parse(stored);
        if (base64 && type) {
          setImageBase64(base64);
          setMediaType(type);
          setPreview(`data:${type};base64,${base64}`);
          analyzeWithData(base64, type);
        }
      } catch { /* ignore */ }
    }
  }, [autoStarted, analyzeWithData]);

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
    setMainText('');
    setQuestion('');
    setMediaType('image/jpeg');

    const compressed = await compressImage(file);
    setPreview(compressed);
    setImageBase64(compressed.split(',')[1]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const analyze = () => {
    if (!imageBase64 || isLoading) return;
    analyzeWithData(imageBase64, mediaType);
  };

  const reset = () => {
    setPreview(null);
    setImageBase64('');
    setMediaType('');
    setMainText('');
    setQuestion('');
    setInstinctWhisper('');
    setError('');
    setScores(null);
  };

  const handleSaveToNote = () => {
    if (!mainText || noteSaved) return;
    const now = new Date().toISOString();
    const entry: AnimalTalkNoteEntry = {
      id: createImageNoteId(),
      sourceType: 'animal-talk',
      createdAt: now,
      updatedAt: now,
      imageUrl: preview || '',
      autoTitle: mainText.slice(0, 24) + (mainText.length > 24 ? '…' : ''),
      result: {
        emotionText: mainText,
        resonanceMap: {
          pathos: scores?.pathos ?? 0,
          contradiction: scores?.contradiction ?? 0,
          rawness: scores?.rawness ?? 0,
          love: scores?.love ?? 0,
          silence: scores?.silence ?? 0,
          instinct: scores?.instinct ?? 0,
        },
        trueVoice: instinctWhisper,
        question,
      },
    };
    saveImageNote(entry);
    setNoteSaved(true);
  };

  const AXES = [
    { key:'pathos',       label:'Pathos',       sub:'情念' },
    { key:'contradiction',label:'Contradiction', sub:'矛盾' },
    { key:'rawness',      label:'Rawness',       sub:'生感' },
    { key:'love',         label:'Love',          sub:'愛情' },
    { key:'silence',      label:'Silence',       sub:'沈黙' },
    { key:'instinct',     label:'Instinct',      sub:'本能' },
  ];

  const RadarChart = ({ scores }: { scores: Record<string,number> }) => {
    const size = 260;
    const cx = size / 2;
    const cy = size / 2;
    const r = 90;
    const n = AXES.length;

    const angleOf = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;

    const pointOf = (i: number, ratio: number) => {
      const a = angleOf(i);
      return {
        x: cx + r * ratio * Math.cos(a),
        y: cy + r * ratio * Math.sin(a),
      };
    };

    const labelOf = (i: number) => {
      const a = angleOf(i);
      const lr = r + 32;
      return {
        x: cx + lr * Math.cos(a),
        y: cy + lr * Math.sin(a),
      };
    };

    // グリッド（3段階）
    const grids = [0.33, 0.66, 1].map(ratio =>
      AXES.map((_, i) => pointOf(i, ratio))
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
        .join(' ') + 'Z'
    );

    // スコアのポリゴン
    const polygon = AXES.map((ax, i) => {
      const ratio = (scores[ax.key] || 0) / 100;
      const p = pointOf(i, ratio);
      return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(' ') + 'Z';

    // 軸ライン
    const axisLines = AXES.map((_, i) => {
      const p = pointOf(i, 1);
      return `M${cx},${cy} L${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    });

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        style={{ display:'block', margin:'0 auto' }}>

        {/* グリッド */}
        {grids.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#e5e7eb" strokeWidth={1} />
        ))}

        {/* 軸ライン */}
        {axisLines.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#e5e7eb" strokeWidth={1} />
        ))}

        {/* スコアポリゴン */}
        <path d={polygon} fill="rgba(124,58,237,0.15)" stroke="#7c3aed" strokeWidth={2} />

        {/* 頂点ドット */}
        {AXES.map((ax, i) => {
          const ratio = (scores[ax.key] || 0) / 100;
          const p = pointOf(i, ratio);
          return <circle key={i} cx={p.x} cy={p.y} r={4} fill="#7c3aed" />;
        })}

        {/* ラベル */}
        {AXES.map((ax, i) => {
          const lp = labelOf(i);
          return (
            <g key={i}>
              <text x={lp.x} y={lp.y - 4}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={9} fontFamily="'Space Mono', monospace"
                fill="#1a1a1a" letterSpacing="0.05em">
                {ax.label}
              </text>
              <text x={lp.x} y={lp.y + 10}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={8} fontFamily="'Noto Sans JP', sans-serif"
                fill="#9ca3af">
                {ax.sub}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  const formatText = (text: string) =>
    text.split(/(?<=。|．)/).map(s => s.trim()).filter(s => s).map((s, i) => (
      <p key={i} style={{ margin: '0 0 1em 0' }}>{s}</p>
    ));

  return (
    <div style={{ minHeight:'100vh', background:'#fff', color:'#1a1a1a', fontFamily:"'Noto Sans JP', sans-serif", fontWeight:300 }}>

      {/* ヘッダー */}
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', borderBottom:'1px solid #e5e7eb', position:'sticky', top:0, background:'#fff', zIndex:10 }}>
        <div>
          <span style={{ fontFamily:"'Space Mono', monospace", fontSize:13, fontWeight:700 }}>Kokoro</span>
          <span style={{ fontFamily:"'Space Mono', monospace", fontSize:13, fontWeight:700, color:'#7c3aed', marginLeft:4 }}>OS</span>
          <span style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#9ca3af', marginLeft:8, letterSpacing:'0.15em' }}>// Animal Talk</span>
        </div>
        <a href="/kokoro-chat"
          style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#6b7280', textDecoration:'none', border:'1px solid #e5e7eb', borderRadius:2, padding:'6px 12px' }}>
          ← Talk に戻る
        </a>
      </header>

      <div style={{ maxWidth:640, margin:'0 auto', padding:'40px 20px 80px' }}>

        {/* タイトル */}
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🐾</div>
          <div style={{ fontSize:18, fontWeight:400, marginBottom:6 }}>Animal Talk</div>
          <div style={{ fontSize:12, color:'#9ca3af' }}>動物の情念を読む</div>
        </div>

        {/* アップロードエリア */}
        {!preview ? (
          <div>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileRef.current?.click()}
              style={{ border:'2px dashed #e5e7eb', borderRadius:12, padding:'60px 20px', textAlign:'center', cursor:'pointer', transition:'border-color .2s', background:'#f9fafb', marginBottom:16 }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#7c3aed')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
            >
              <div style={{ fontSize:40, marginBottom:12 }}>📷</div>
              <div style={{ fontSize:14, color:'#6b7280', marginBottom:6 }}>動物の画像をドロップ</div>
              <div style={{ fontSize:11, color:'#9ca3af' }}>またはクリックして選択</div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }}
                onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
            </div>
            {imageBase64 && !isLoading && (
              <button onClick={analyze}
                style={{ width:'100%', background:'transparent', border:'1px solid #7c3aed', color:'#7c3aed', borderRadius:4, padding:'13px', fontSize:10, cursor:'pointer', fontFamily:"'Space Mono', monospace", letterSpacing:'0.2em' }}>
                Yoroshiku
              </button>
            )}
          </div>
        ) : (
          <div>
            {/* プレビュー */}
            <div style={{ position:'relative', marginBottom:20 }}>
              <img src={preview} alt="preview"
                style={{ width:'100%', borderRadius:12, display:'block', maxHeight:400, objectFit:'cover' }} />
              <button onClick={reset}
                style={{ position:'absolute', top:10, right:10, background:'rgba(0,0,0,.5)', color:'#fff', border:'none', borderRadius:20, padding:'4px 10px', cursor:'pointer', fontSize:11 }}>
                ✕ 変更
              </button>
            </div>

            {/* 読むボタン */}
            {!mainText && !isLoading && (
              <button onClick={analyze}
                style={{ width:'100%', background:'#1a1a1a', color:'#fff', border:'none', borderRadius:8, padding:'14px', fontSize:14, cursor:'pointer', fontFamily:"'Space Mono', monospace", letterSpacing:'0.1em' }}>
                ▸ 情念を読む
              </button>
            )}

            {/* ローディング */}
            {isLoading && <PersonaLoading />}

            {/* 結果 */}
            {mainText && (
              <div style={{ marginTop:8 }}>
                <div style={{ borderLeft:'2px solid #1a1a1a', paddingLeft:20, marginBottom:24 }}>
                  <div style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.18em', color:'#9ca3af', textTransform:'uppercase', marginBottom:16 }}>// 情念</div>
                  <div style={{ fontSize:16, lineHeight:2.2, color:'#1a1a1a', fontWeight:300 }}>
                    {formatText(mainText)}
                  </div>
                </div>

                {scores && (
                  <div style={{ marginBottom:28, padding:'24px 0' }}>
                    <div style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.18em', color:'#9ca3af', textTransform:'uppercase', marginBottom:20, textAlign:'center' }}>// Resonance Map</div>
                    <RadarChart scores={scores} />
                  </div>
                )}

                {instinctWhisper && (
                  <div style={{ borderLeft:'2px solid #c4b5fd', paddingLeft:20, marginBottom:28 }}>
                    <div style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.18em', color:'#9ca3af', textTransform:'uppercase', marginBottom:12 }}>// 本音</div>
                    <div style={{ fontSize:15, lineHeight:2, color:'#374151', fontWeight:300 }}>
                      {instinctWhisper}
                    </div>
                  </div>
                )}

                {question && (
                  <div style={{ borderLeft:'2px solid #7c3aed', paddingLeft:20, marginBottom:28 }}>
                    <div style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.18em', color:'#7c3aed', textTransform:'uppercase', marginBottom:12 }}>// 問い</div>
                    <div style={{ fontSize:15, color:'#7c3aed', fontStyle:'italic', lineHeight:1.8 }}>
                      「{question}」
                    </div>
                  </div>
                )}

                {/* アクション */}
                <div style={{ display:'flex', gap:10, marginTop:8 }}>
                  <button
                    onClick={handleSaveToNote}
                    disabled={noteSaved}
                    style={{
                      fontFamily:"'Space Mono', monospace", fontSize:10,
                      color: noteSaved ? '#34d399' : '#7c3aed',
                      background:'transparent',
                      border: `1px solid ${noteSaved ? 'rgba(52,211,153,0.4)' : 'rgba(124,58,237,0.3)'}`,
                      borderRadius:6, padding:'8px 18px', cursor: noteSaved ? 'default' : 'pointer',
                      letterSpacing:'0.1em',
                    }}
                  >
                    {noteSaved ? 'Note ✓' : 'Note +'}
                  </button>
                  <button onClick={reset}
                    style={{
                      fontFamily:"'Space Mono', monospace", fontSize:10,
                      color:'#6b7280', background:'transparent',
                      border:'1px solid #e5e7eb', borderRadius:6,
                      padding:'8px 18px', cursor:'pointer', letterSpacing:'0.1em',
                    }}
                  >
                    Reset ×
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div style={{ marginTop:16, color:'#ef4444', fontSize:12, textAlign:'center' }}>{error}</div>
        )}
      </div>

    </div>
  );
}
