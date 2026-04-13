'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { InsightResult } from '@/types/insight';
import { saveToNote } from '@/lib/saveToNote';
import PersonaLoading from '@/components/PersonaLoading';

/* ─── 定数 ─── */
const DOT_COLORS = ['#7c3aed','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16'];
const CANVAS_H = 420;

type Plot = {
  title: string;
  score: number;
  technicalScore: number;
  soulScore: number;
  trueScore: number;
  rawness: number;
  rawnessDesc: string;
  pathos: number;
  pathosDesc: string;
  pathosFlip: boolean;
  wildPropulsion: number;
  frictionLevel: number;
  dirt: number;
  techniqueVerdict: string;
  devotionalMimicry: boolean;
  devotionalDesc: string;
  type: string;
  typeDesc: string;
  desc: string;
  wildness: number;
  systemScore: number;
  color: string;
  isFake: boolean;
  fakeReason: string;
  cfMode: boolean;
  axes: Record<string, number>;
  reconstruction: string;
  perReview: Array<{ quote: string; signal: string; isNegative?: boolean }>;
  prescription: string;
  oneWord: string;
};

type ReviewItem = { id: number; text: string; isNegative: boolean };

/* ─── スコアカラー ─── */
function scoreColor(s: number): string {
  if (s >= 4.5) return '#ef4444';
  if (s >= 3.5) return '#f97316';
  if (s >= 2.5) return '#ec4899';
  if (s >= 1.5) return '#7c3aed';
  return '#9ca3af';
}

/* ─── メインコンポーネント ─── */
export default function KokoroInsightPage() {
  const router = useRouter();
  const mono = { fontFamily: "'Space Mono', monospace" } as const;

  /* 入力 */
  const [workTitle, setWorkTitle] = useState('');
  const [cfMode, setCfMode] = useState(false);
  const [reviews, setReviews] = useState<ReviewItem[]>([
    { id: 1, text: '', isNegative: false },
  ]);
  const [nextId, setNextId] = useState(3);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* 状態 */
  const [isLoading, setIsLoading] = useState(false);
  const [loadStep, setLoadStep] = useState(0);
  const [error, setError] = useState('');
  const [plots, setPlots] = useState<Plot[]>([]);
  const [currentResult, setCurrentResult] = useState<Plot | null>(null);
  const [compareText, setCompareText] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);

  /* ─── Note に保存 ─── */
  const handleSaveToNote = async () => {
    if (!currentResult) return;
    const parts: string[] = [];
    parts.push(`[${currentResult.title}]`);
    parts.push(`スコア: ${currentResult.trueScore.toFixed(1)}`);
    parts.push(`タイプ: ${currentResult.type} — ${currentResult.typeDesc}`);
    if (currentResult.desc) parts.push(currentResult.desc);
    parts.push('');
    parts.push(`// Technical: ${currentResult.technicalScore}`);
    parts.push(`// Soul: ${currentResult.soulScore}`);
    parts.push(`// Rawness: ${currentResult.rawness}${currentResult.rawnessDesc ? ` (${currentResult.rawnessDesc})` : ''}`);
    parts.push(`// Pathos: ${currentResult.pathos.toFixed(2)}${currentResult.pathosDesc ? ` (${currentResult.pathosDesc})` : ''}`);
    if (currentResult.techniqueVerdict) parts.push(`// ${currentResult.techniqueVerdict}`);
    parts.push('');
    parts.push('// 影響の読み直し');
    parts.push(currentResult.reconstruction);
    if (currentResult.perReview.length > 0) {
      parts.push('');
      parts.push('// レビューごとの読解サイン');
      currentResult.perReview.forEach(p => {
        parts.push(`「${p.quote}」 → ${p.signal}`);
      });
    }
    parts.push('');
    parts.push('// 5君からの一言');
    parts.push(currentResult.prescription);
    if (currentResult.isFake && currentResult.fakeReason) {
      parts.push('');
      parts.push('⚠ 過大評価バグ');
      parts.push(currentResult.fakeReason);
    }
    if (compareText) {
      parts.push('');
      parts.push('// 作品間の断絶');
      parts.push(compareText);
    }

    if (await saveToNote(parts.join('\n'), 'Insight')) {
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    }
  };

  /* Canvas */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);

  const canSubmit = reviews.some(r => r.text.trim()) || !!imageBase64;

  /* ─── 画像処理 ─── */
  const compressImage = (file: File): Promise<string> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const MAX = 1200;
          let w = img.width, h = img.height;
          if (w > MAX || h > MAX) {
            if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
            else       { w = Math.round(w * MAX / h); h = MAX; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });

  const handleImageFile = async (file: File) => {
    const base64 = await compressImage(file);
    setImageBase64(base64);
    setImagePreview('data:image/jpeg;base64,' + base64);
  };

  /* ─── Canvas描画 ─── */
  const drawGraph = useCallback((currentPlots: Plot[], animPlot?: Plot, animProgress = 1) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth || 680;
    const H = CANVAS_H;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const cx = W / 2, cy = H / 2, pad = 52;

    /* 背景 */
    ctx.fillStyle = '#f8f9fa'; ctx.fillRect(0, 0, W, H);

    /* 象限色 */
    const quads: [number, number, number, number, string][] = [
      [cx, 0, W - cx, cy, 'rgba(124,58,237,0.05)'],
      [0, 0, cx, cy, 'rgba(239,68,68,0.04)'],
      [cx, cy, W - cx, H - cy, 'rgba(59,130,246,0.04)'],
      [0, cy, cx, H - cy, 'rgba(156,163,175,0.04)'],
    ];
    quads.forEach(([x, y, w, h, c]) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    });

    /* グリッド */
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
    [-50, 50].forEach(v => {
      const gx = cx + (v / 100) * (cx - pad);
      ctx.beginPath(); ctx.moveTo(gx, pad); ctx.lineTo(gx, H - pad); ctx.stroke();
      const gy = cy - (v / 100) * (cy - pad);
      ctx.beginPath(); ctx.moveTo(pad, gy); ctx.lineTo(W - pad, gy); ctx.stroke();
    });

    /* 軸 */
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pad, cy); ctx.lineTo(W - pad, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, pad); ctx.lineTo(cx, H - pad); ctx.stroke();

    /* 軸ラベル */
    ctx.font = '700 8px "Space Mono",monospace'; ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.textAlign = 'center';
    ctx.fillText('野生度 ▲', cx, pad - 10);
    ctx.fillText('▼ 予定調和', cx, H - pad + 16);
    ctx.textAlign = 'right';
    ctx.fillText('◀ ノイズ・意味不明', pad - 4, cy - 8);
    ctx.textAlign = 'left';
    ctx.fillText('制度・理解度 ▶', W - pad + 4, cy - 8);

    /* 象限ラベル */
    ctx.font = '700 9px "Space Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(124,58,237,0.5)'; ctx.fillText('超越・暗黒', cx + (W - cx) / 2, pad + 20);
    ctx.fillStyle = 'rgba(239,68,68,0.5)';  ctx.fillText('混沌・狂気', cx / 2, pad + 20);
    ctx.fillStyle = 'rgba(59,130,246,0.5)'; ctx.fillText('制度・名盤', cx + (W - cx) / 2, H - pad - 10);
    ctx.fillStyle = 'rgba(107,114,128,0.6)'; ctx.fillText('空回り・無風', cx / 2, H - pad - 10);

    /* プロット */
    currentPlots.forEach(plot => {
      const prog = (plot === animPlot && animProgress !== undefined) ? animProgress : 1;
      renderDot(ctx, plot, { cx, cy, pad }, prog);
    });
  }, []);

  function renderDot(
    ctx: CanvasRenderingContext2D,
    plot: Plot,
    m: { cx: number; cy: number; pad: number },
    progress = 1
  ) {
    const { cx, cy, pad } = m;
    const tx = cx + (plot.systemScore / 100) * (cx - pad);
    const ty = cy - (plot.wildness / 100) * (cy - pad);
    const ease = 1 - Math.pow(1 - progress, 3);
    const px = cx + (tx - cx) * ease;
    const py = cy + (ty - cy) * ease;
    const rawnessMult = 0.6 + (plot.rawness / 10) * 0.8;
    const r = (6 + plot.trueScore * 1.6) * rawnessMult;

    if (plot.isFake) {
      ctx.save();
      ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.setLineDash([3, 4]);
      ctx.arc(px, py, r + 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#ef4444'; ctx.globalAlpha = 0.6; ctx.lineWidth = 2;
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.restore();
    } else if (plot.pathosFlip) {
      ctx.save();
      ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 24;
      ctx.beginPath(); ctx.arc(px, py, r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#f59e0b'; ctx.globalAlpha = 0.7; ctx.lineWidth = 2.5;
      ctx.stroke(); ctx.globalAlpha = 1;
      ctx.restore();
    } else if (plot.score >= 4 || plot.pathos >= 0.7) {
      ctx.save();
      ctx.shadowColor = plot.color; ctx.shadowBlur = 18;
    }

    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = plot.color; ctx.globalAlpha = 0.88; ctx.fill(); ctx.globalAlpha = 1;
    if (!plot.isFake && !plot.pathosFlip && (plot.score >= 4 || plot.pathos >= 0.7)) ctx.restore();

    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.strokeStyle = plot.isFake ? '#ef4444' : '#fff';
    ctx.lineWidth = plot.isFake ? 2.5 : 2;
    ctx.stroke();

    if (progress >= 0.95) {
      ctx.font = '700 8px "Space Mono",monospace';
      ctx.fillStyle = '#1a1a1a'; ctx.textAlign = 'center';
      const label = plot.title.length > 14 ? plot.title.slice(0, 14) + '…' : plot.title;
      ctx.fillText(label, px, py - r - 6);
    }
  }

  function animateDot(newPlots: Plot[], newPlot: Plot) {
    const start = performance.now();
    const dur = 650;
    if (animRef.current) cancelAnimationFrame(animRef.current);
    function step(now: number) {
      const t = Math.min((now - start) / dur, 1);
      drawGraph(newPlots, newPlot, t);
      if (t < 1) animRef.current = requestAnimationFrame(step);
    }
    animRef.current = requestAnimationFrame(step);
  }

  /* Canvas リサイズ対応 */
  useEffect(() => {
    const handleResize = () => drawGraph(plots);
    window.addEventListener('resize', handleResize);
    drawGraph(plots);
    return () => window.removeEventListener('resize', handleResize);
  }, [plots, drawGraph]);

  /* ─── 判定実行 ─── */
  const handleSubmit = async () => {
    if (!canSubmit || isLoading) return;
    setIsLoading(true);
    setError('');
    setLoadStep(0);

    const stepTimer = setInterval(() => {
      setLoadStep(prev => (prev + 1) % 3);
    }, 1000);

    try {
      const validReviews = reviews
        .filter(r => r.text.trim())
        .map(r => ({
          id: String(r.id),
          text: r.text,
          isNegative: r.isNegative,
        }));

      const body: Record<string, unknown> = {
        workTitle: workTitle || `作品${plots.length + 1}`,
        contextFilterEnabled: cfMode,
        reviews: validReviews,
      };
      if (imageBase64) body.imageBase64 = imageBase64;

      const res = await fetch('/api/kokoro-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('判定に失敗しました');
      const r: InsightResult = await res.json();

      const baseScore = parseFloat(String(r.score)) || 0;
      const rawness = Math.max(0, Math.min(10, r.axes.rawness ?? 0));
      const pathos = Math.max(0, Math.min(1, r.axes.pathos ?? 0));
      const rawnessMult = 0.5 + (rawness / 10);
      const pathosMult = 0.7 + (pathos * 0.7);
      const trueScore = Math.min(5, Math.round(baseScore * rawnessMult * pathosMult * 10) / 10);

      const isFake = r.isFake === true;
      const color = isFake ? '#ef4444' : DOT_COLORS[plots.length % DOT_COLORS.length];

      const plot: Plot = {
        title: workTitle || `作品${plots.length + 1}`,
        score: baseScore,
        technicalScore: r.technicalScore ?? 0,
        soulScore: r.soulScore ?? 0,
        trueScore,
        rawness,
        rawnessDesc: r.axes ? String(r.axes.rawnessDesc ?? '') : '',
        pathos,
        pathosDesc: r.axes ? String(r.axes.pathosDesc ?? '') : '',
        pathosFlip: r.pathosFlip ?? false,
        wildPropulsion: r.wildPropulsion ?? 0,
        frictionLevel: r.frictionLevel ?? 0,
        dirt: r.dirt ?? 0,
        techniqueVerdict: r.techniqueVerdict ?? '',
        devotionalMimicry: r.devotionalMimicry ?? false,
        devotionalDesc: r.devotionalDesc ?? '',
        type: r.label ?? '—',
        typeDesc: r.typeDesc ?? '',
        desc: r.summary ?? '',
        wildness: Math.max(-100, Math.min(100, r.wildness ?? 0)),
        systemScore: Math.max(-100, Math.min(100, r.systemScore ?? 0)),
        color,
        isFake,
        fakeReason: r.fakeReason ?? '',
        cfMode,
        axes: {
          energy: r.axes?.energy ?? 0,
          distortion: r.axes?.distortion ?? 0,
          resolution: r.axes?.resolution ?? 0,
          contradiction: r.axes?.contradiction ?? 0,
          selfImpact: r.axes?.selfImpact ?? 0,
        },
        reconstruction: r.reread ?? '',
        perReview: (r.misreadSignals ?? []).map(s => ({
          quote: s.quote ?? '',
          signal: s.signal ?? '',
          isNegative: s.isNegative ?? false,
        })),
        prescription: r.fiveComment ?? '',
        oneWord: r.oneWord ?? '',
      };

      const newPlots = [...plots, plot];
      setPlots(newPlots);
      setCurrentResult(plot);
      animateDot(newPlots, plot);

      /* 2作品以上なら比較テキスト生成（非同期・失敗しても無視） */
      if (newPlots.length >= 2) {
        generateCompareText(newPlots, cfMode).then(text => {
          if (text) setCompareText(text);
        });
      }

    } catch (e) {
      setError(e instanceof Error ? e.message : '判定に失敗しました');
    } finally {
      clearInterval(stepTimer);
      setIsLoading(false);
      setLoadStep(0);
    }
  };

  /* ─── 比較テキスト生成 ─── */
  async function generateCompareText(currentPlots: Plot[], cf: boolean): Promise<string> {
    const summary = currentPlots.map(p =>
      `「${p.title}」: 真スコア${p.trueScore} / ${p.type} / 野生度${p.wildness} / 制度${p.systemScore} / Rawness${p.rawness} / Pathos${p.pathos.toFixed(2)}${p.pathosFlip ? ' ⚡FLIP' : ''}${p.isFake ? ' ⚠過大評価' : ''}`
    ).join('\n');
    try {
      const res = await fetch('/api/kokoro-insight-compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary, cfMode: cf }),
      });
      if (!res.ok) return '';
      const data = await res.json();
      return data.text ?? '';
    } catch { return ''; }
  }

  /* ─── リセット ─── */
  const resetCurrent = () => {
    setWorkTitle('');
    setReviews([
      { id: 1, text: '', isNegative: false },
      { id: 2, text: '', isNegative: false },
    ]);
    setNextId(3);
    setImagePreview(null);
    setImageBase64(null);
    setCurrentResult(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetAll = () => {
    setPlots([]);
    setCompareText('');
    setCurrentResult(null);
    drawGraph([]);
    resetCurrent();
  };

  /* ─── レビュー管理 ─── */
  const addReview = () => {
    setReviews(prev => [...prev, { id: nextId, text: '', isNegative: false }]);
    setNextId(prev => prev + 1);
  };

  const removeReview = (id: number) => {
    setReviews(prev => prev.filter(r => r.id !== id));
  };

  /* ─── JSX ─── */
  const LOAD_STEPS = [
    '// 熱量・歪みを検出中...',
    '// 野生度・制度スコアを算出中...',
    '// 4象限座標に配置中...',
  ];

  const AXIS_CONFIG = [
    { key: 'energy',       label: 'Energy // 熱量',         color: '#f59e0b' },
    { key: 'distortion',   label: 'Distortion // 歪み',      color: '#ec4899' },
    { key: 'resolution',   label: 'Resolution // 解像度',    color: '#10b981' },
    { key: 'contradiction',label: 'Contradiction // 矛盾',   color: '#8b5cf6' },
    { key: 'selfImpact',   label: 'Self-Impact // 侵食度',   color: '#f97316' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#1a1a1a', fontFamily: "'Noto Serif JP', serif", fontWeight: 300 }}>

      {/* ヘッダー */}
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', borderBottom:'1px solid #e5e7eb', position:'sticky', top:0, background:'#fff', zIndex:10 }}>
        <div>
          <span style={{ ...mono, fontSize:13, fontWeight:700 }}>Kokoro</span>
          <span style={{ ...mono, fontSize:13, fontWeight:700, color:'#7c3aed', marginLeft:4 }}>OS</span>
          <span style={{ ...mono, fontSize:9, color:'#9ca3af', marginLeft:8, letterSpacing:'0.15em' }}>// Insight</span>
        </div>
        <button onClick={() => router.push('/kokoro-chat')} title="Talk に戻る"
          style={{ ...mono, fontSize:9, color:'#6b7280', background:'transparent', border:'1px solid #e5e7eb', borderRadius:2, padding:'6px 12px', cursor:'pointer' }}>
          ← Talk
        </button>
      </header>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* 説明 */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.9 }}>
            レビューの歪み・崩壊・矛盾から、作品の影響を逆算する。
          </p>
        </div>

        {/* Context Filter */}
        <div style={{
          background: cfMode ? '#fff5f5' : '#f8f9fa',
          border: `1px solid ${cfMode ? '#fecaca' : '#e5e7eb'}`,
          borderLeft: `3px solid ${cfMode ? '#ef4444' : '#9ca3af'}`,
          padding: '14px 18px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...mono, fontSize: 9, letterSpacing: '.14em', color: cfMode ? '#ef4444' : '#6b7280' }}>
              // Context-Filter
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, ...mono, lineHeight: 1.6 }}>
              {cfMode
                ? 'ON：文脈を排して作品を評価するモード'
                : 'OFF：通常判定'}
            </div>
          </div>
          <label style={{ position: 'relative', width: 44, height: 24, flexShrink: 0, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={cfMode}
              onChange={e => setCfMode(e.target.checked)}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{
              position: 'absolute', inset: 0,
              background: cfMode ? '#ef4444' : '#9ca3af',
              borderRadius: 24, transition: '.3s', cursor: 'pointer',
            }}>
              <span style={{
                position: 'absolute', height: 18, width: 18,
                left: cfMode ? 23 : 3, bottom: 3,
                background: '#fff', borderRadius: '50%', transition: '.3s',
              }} />
            </span>
          </label>
        </div>

        {/* 入力欄 */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ ...mono, fontSize: 9, letterSpacing: '.18em', color: '#6b7280', display: 'block', marginBottom: 10 }}>
            // 作品名・対象（任意）
          </label>
          <input
            value={workTitle}
            onChange={e => setWorkTitle(e.target.value)}
            placeholder="例：バンド名・映画タイトル・本・体験など"
            style={{
              width: '100%', background: '#f8f9fa', border: 'none',
              borderBottom: '1px solid #e5e7eb',
              color: '#1a1a1a', fontFamily: "'Noto Serif JP', serif",
              fontSize: 15, fontWeight: 300, padding: '10px 4px', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* 画像アップロード */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ ...mono, fontSize: 9, letterSpacing: '.18em', color: '#6b7280', display: 'block', marginBottom: 10 }}>
            // 画像（ジャケット・フライヤー・ライブ写真など）
            <span style={{ ...mono, fontSize: 8, color: '#7c3aed', border: '1px solid #7c3aed', padding: '2px 6px', borderRadius: 2, marginLeft: 8 }}>任意</span>
          </label>
          {imagePreview ? (
            <div style={{ position: 'relative', marginBottom: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="preview" style={{ width: '100%', maxHeight: 280, objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 3, background: '#f1f3f5' }} />
              <button
                onClick={() => { setImagePreview(null); setImageBase64(null); }}
                style={{ position: 'absolute', top: 6, right: 6, background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: 24, height: 24, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >✕</button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed #e5e7eb', borderRadius: 4, padding: 24,
                textAlign: 'center', cursor: 'pointer', marginBottom: 12,
                background: '#f8f9fa',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => e.target.files?.[0] && handleImageFile(e.target.files[0])}
              />
              <span style={{ ...mono, fontSize: 9, letterSpacing: '.14em', color: '#6b7280', display: 'block', marginBottom: 8 }}>
                クリックして画像を選択
              </span>
              <span style={{ fontSize: 11, color: '#9ca3af', ...mono }}>
                JPEG / PNG / GIF / WEBP 対応 // レビューなしでも判定可能
              </span>
            </div>
          )}
        </div>

        {/* レビュー入力 */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ ...mono, fontSize: 9, letterSpacing: '.18em', color: '#6b7280', display: 'block', marginBottom: 10 }}>
            // レビュー・感想（任意・画像だけでもOK）
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {reviews.map((r, i) => (
              <div key={r.id} style={{
                position: 'relative', background: '#f8f9fa',
                border: '1px solid #e5e7eb',
                borderLeft: `2px solid ${r.isNegative ? '#ef4444' : '#e5e7eb'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px 0', flexWrap: 'wrap' }}>
                  <span style={{ ...mono, fontSize: 8, color: '#6b7280', letterSpacing: '.1em' }}>// レビュー {i + 1}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', marginLeft: 'auto' }}>
                    <input
                      type="checkbox"
                      checked={r.isNegative}
                      onChange={e => setReviews(prev => prev.map(rv => rv.id === r.id ? { ...rv, isNegative: e.target.checked } : rv))}
                      style={{ cursor: 'pointer', accentColor: '#ef4444' }}
                    />
                    <span style={{ ...mono, fontSize: 8, color: '#ef4444', letterSpacing: '.08em' }}>酷評・否定的レビュー</span>
                  </label>
                </div>
                <textarea
                  value={r.text}
                  onChange={e => setReviews(prev => prev.map(rv => rv.id === r.id ? { ...rv, text: e.target.value } : rv))}
                  placeholder={`レビュー・感想をそのまま貼り付けてください。\n酷評・拒絶レビューも歓迎。「気分が悪くなる」「二度と聴かない」から本来の影響を逆算します。\n言葉が崩壊しているほど良い素材になります。`}
                  rows={4}
                  style={{
                    width: '100%', background: 'transparent', border: 'none',
                    color: '#1a1a1a', fontFamily: "'Noto Serif JP', serif",
                    fontSize: 13, fontWeight: 300, lineHeight: 1.9,
                    padding: '12px 36px 12px 14px', resize: 'none', outline: 'none',
                    boxSizing: 'border-box', minHeight: 72,
                  }}
                />
                {reviews.length > 1 && (
                  <button
                    onClick={() => removeReview(r.id)}
                    style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 12 }}
                  >✕</button>
                )}
              </div>
            ))}
          </div>
          {reviews.length < 5 && (
            <button
              onClick={addReview}
              title="レビューを追加"
              style={{ width: '100%', background: 'transparent', border: '1px dashed #e5e7eb', color: '#6b7280', ...mono, fontSize: 9, letterSpacing: '.12em', padding: 8, cursor: 'pointer', borderRadius: 2 }}
            >
              Row +
            </button>
          )}
        </div>

        {/* 実行ボタン */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isLoading}
          title="インパクトを判定する"
          style={{
            width: '100%', marginBottom: 20,
            background: !canSubmit || isLoading ? '#9ca3af' : '#7c3aed',
            border: 'none', color: '#fff', ...mono,
            fontSize: 10, letterSpacing: '.14em', padding: 14,
            cursor: !canSubmit || isLoading ? 'not-allowed' : 'pointer',
            borderRadius: 3,
          }}
        >
          Yoroshiku
        </button>

        {/* ローディング */}
        {isLoading && <PersonaLoading />}

        {error && (
          <div style={{ ...mono, fontSize: 10, color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: 3, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* 4象限グラフ（常時表示） */}
        {plots.length > 0 && (
          <div style={{ background: '#f8f9fa', border: '1px solid #e5e7eb', padding: '20px 22px', marginBottom: 16 }}>
            <div style={{ ...mono, fontSize: 9, letterSpacing: '.18em', color: '#6b7280', marginBottom: 6 }}>// Impact Map // 4象限グラフ</div>
            <div style={{ fontSize: 10, color: '#6b7280', ...mono, lineHeight: 1.7, marginBottom: 16 }}>
              縦軸：野生度（上=脳の書き換え・侵食 / 下=予定調和・BGM）<br />
              横軸：制度・理解度（右=言語化可能・批評家向け / 左=意味不明・純粋なノイズ）<br />
              点数が高い ≠ 右上。制度に飼われた名盤は右下に沈む。それがKokoroの正義。
            </div>
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', cursor: 'crosshair', border: '1px solid #e5e7eb', borderRadius: 2 }} />
            {/* 象限凡例 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
              {[
                { label: '右上 // 超越・暗黒エリア', desc: '野生 × 理解可能。侵食型・変容型。真の怪物だけがここに来る。' },
                { label: '左上 // 混沌・狂気エリア', desc: '野生 × 意味不明。純粋なノイズ。言語化を拒絶する衝撃型。' },
                { label: '右下 // 制度・名盤エリア', desc: '予定調和 × 言語化可能。批評家が愛する作品。安全な感動。' },
                { label: '左下 // 空回り・無風エリア', desc: '予定調和 × 意味不明。BGMとして機能するが何も残さない。' },
              ].map(({ label, desc }) => (
                <div key={label} style={{ background: '#f1f3f5', border: '1px solid #e5e7eb', padding: '10px 12px', borderRadius: 2 }}>
                  <div style={{ ...mono, fontSize: 8, letterSpacing: '.1em', color: '#7c3aed', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>{desc}</div>
                </div>
              ))}
            </div>
            {/* プロット一覧 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
              {plots.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f1f3f5', border: '1px solid #e5e7eb', padding: '8px 12px', borderRadius: 2 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                  <div style={{ ...mono, fontSize: 10, flex: 1 }}>{p.title}</div>
                  <div style={{ ...mono, fontSize: 9, color: '#6b7280' }}>野生:{p.wildness > 0 ? '+' : ''}{p.wildness} / 制度:{p.systemScore > 0 ? '+' : ''}{p.systemScore}</div>
                  <button
                    onClick={() => { const next = plots.filter((_, j) => j !== i); setPlots(next); drawGraph(next); }}
                    style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 11 }}
                  >✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 結果表示 */}
        {currentResult && (
          <div style={{ animation: 'fadeUp .5s ease-out' }}>
            <style>{`@keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }`}</style>

            {/* スコアヘッダー */}
            <div style={{
              background: '#f8f9fa', border: '1px solid #e5e7eb',
              borderTop: '3px solid #7c3aed',
              padding: '24px 28px', marginBottom: 16,
              display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, alignItems: 'start',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ ...mono, fontWeight: 700, fontSize: 64, lineHeight: 1, color: scoreColor(currentResult.trueScore) }}>
                  {currentResult.trueScore.toFixed(1)}
                </div>
                <div style={{ ...mono, fontSize: 12, color: '#6b7280' }}>/ 5</div>
              </div>
              <div>
                <div style={{ ...mono, fontSize: 9, letterSpacing: '.14em', color: '#6b7280', marginBottom: 8 }}>// {currentResult.title}</div>
                <div style={{ fontSize: 'clamp(18px,3vw,26px)', fontWeight: 300, letterSpacing: '.06em', color: '#111827', marginBottom: 10, lineHeight: 1.4 }}>
                  {currentResult.type}
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.9 }}>
                  {currentResult.typeDesc}　{currentResult.desc}
                </div>
              </div>
            </div>

            {/* 2軸スコア */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                { label: '// Technical // 技術的達成度', sublabel: '構造・完成度・技巧の精度', value: currentResult.technicalScore, color: '#3b82f6' },
                { label: '// Soul // 魂の侵食度', sublabel: 'Pathos・Wild Propulsion・侵食力', value: currentResult.soulScore, color: '#ec4899' },
              ].map(({ label, sublabel, value, color }) => (
                <div key={label} style={{ background: '#f8f9fa', border: '1px solid #e5e7eb', borderLeft: `3px solid ${color}`, padding: '12px 16px' }}>
                  <div style={{ ...mono, fontSize: 8, letterSpacing: '.14em', color, marginBottom: 6 }}>{label}</div>
                  <div style={{ ...mono, fontWeight: 700, fontSize: 28, color }}>{value.toFixed(1)}</div>
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4, ...mono }}>{sublabel}</div>
                </div>
              ))}
            </div>

            {/* 5軸バー */}
            <div style={{ background: '#f8f9fa', border: '1px solid #e5e7eb', padding: '20px 22px', marginBottom: 16 }}>
              <div style={{ ...mono, fontSize: 9, letterSpacing: '.18em', color: '#6b7280', marginBottom: 16 }}>// 5-Axis Analysis</div>
              {AXIS_CONFIG.map(({ key, label, color }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <span style={{ ...mono, fontSize: 9, letterSpacing: '.06em', width: 180, flexShrink: 0, color }}>{label}</span>
                  <div style={{ flex: 1, height: 5, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(currentResult.axes[key] || 0) * 10}%`, background: color, borderRadius: 3, transition: 'width .8s cubic-bezier(.23,1,.32,1)' }} />
                  </div>
                  <span style={{ ...mono, fontSize: 10, width: 24, textAlign: 'right', color }}>{currentResult.axes[key] || 0}</span>
                </div>
              ))}

              {/* Rawness */}
              <div style={{ height: 1, background: '#e5e7eb', margin: '12px 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <span style={{ ...mono, fontSize: 9, width: 180, flexShrink: 0, fontWeight: 700, color: '#1a1a1a' }}>Rawness // 魂の純度</span>
                <div style={{ flex: 1, height: 5, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${currentResult.rawness * 10}%`, background: 'linear-gradient(90deg,#7c3aed,#ef4444)', borderRadius: 3 }} />
                </div>
                <span style={{ ...mono, fontSize: 10, width: 24, textAlign: 'right', fontWeight: 700 }}>{currentResult.rawness}</span>
              </div>
              {currentResult.rawnessDesc && (
                <div style={{ ...mono, fontSize: 11, color: '#6b7280', paddingLeft: 2, lineHeight: 1.6 }}>// {currentResult.rawnessDesc}</div>
              )}

              {/* Pathos */}
              <div style={{ height: 1, background: '#e5e7eb', margin: '12px 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <span style={{ ...mono, fontSize: 9, width: 180, flexShrink: 0, fontWeight: 700, color: '#be185d' }}>Pathos // 情念</span>
                <div style={{ flex: 1, height: 5, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${currentResult.pathos * 100}%`, background: 'linear-gradient(90deg,#7c3aed,#be185d,#f59e0b)', borderRadius: 3, transition: 'width 1s cubic-bezier(.23,1,.32,1)' }} />
                </div>
                <span style={{ ...mono, fontSize: 10, width: 36, textAlign: 'right', fontWeight: 700, color: '#be185d' }}>{currentResult.pathos.toFixed(2)}</span>
              </div>
              {currentResult.pathosDesc && (
                <div style={{ ...mono, fontSize: 11, color: '#6b7280', paddingLeft: 2, lineHeight: 1.6, marginBottom: 8 }}>// {currentResult.pathosDesc}</div>
              )}

              {/* FLIP */}
              {currentResult.pathosFlip && (
                <div style={{ marginTop: 12, background: '#fff7ed', border: '1px solid #fed7aa', borderLeft: '3px solid #f59e0b', padding: '12px 16px' }}>
                  <div style={{ ...mono, fontSize: 9, color: '#d97706', letterSpacing: '.14em', marginBottom: 6 }}>⚡ FLIP // 価値反転発動</div>
                  <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.8, ...mono }}>
                    表面の秩序の奥底で情念が沸騰している。外見に騙されるな。この作品は「整った形式に擬態した激情」である。
                  </div>
                </div>
              )}

              {/* True Score */}
              <div style={{ marginTop: 14, background: '#faf5ff', border: '1px solid #e9d5ff', borderLeft: '3px solid #7c3aed', padding: '12px 16px' }}>
                <div style={{ ...mono, fontSize: 9, color: '#7c3aed', letterSpacing: '.14em', marginBottom: 6 }}>// True Score // インパクト × Rawness × Pathos補正</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ ...mono, fontWeight: 700, fontSize: 36, color: '#7c3aed' }}>{currentResult.trueScore.toFixed(1)}</span>
                  <span style={{ ...mono, fontSize: 11, color: '#6b7280' }}>/ 5</span>
                  <span style={{ ...mono, fontSize: 9, color: '#6b7280', marginLeft: 8 }}>
                    {currentResult.score.toFixed(1)} × R{(0.5 + currentResult.rawness / 10).toFixed(2)} × P{(0.7 + currentResult.pathos * 0.7).toFixed(2)} = {currentResult.trueScore.toFixed(1)}
                  </span>
                </div>
              </div>

              {/* 技巧判定 */}
              {currentResult.techniqueVerdict && (
                <div style={{ marginTop: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', borderLeft: '3px solid #16a34a', padding: '12px 16px' }}>
                  <div style={{ ...mono, fontSize: 9, color: '#16a34a', letterSpacing: '.14em', marginBottom: 10 }}>// Technique Axis // 技巧と野生の相克</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 8 }}>
                    {[
                      { label: 'Wild Propulsion', value: currentResult.wildPropulsion, color: '#15803d' },
                      { label: 'Friction Level', value: currentResult.frictionLevel, color: '#dc2626' },
                      { label: 'Dirt', value: currentResult.dirt, color: '#92400e' },
                    ].map(({ label, value, color }) => (
                      <div key={label}>
                        <div style={{ ...mono, fontSize: 8, color, letterSpacing: '.1em', marginBottom: 4 }}>{label}</div>
                        <div style={{ ...mono, fontWeight: 700, fontSize: 18, color }}>{value.toFixed(2)}</div>
                        <div style={{ height: 3, background: '#dcfce7', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${value * 100}%`, background: color, transition: 'width .8s' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ ...mono, fontSize: 10, color: '#1a1a1a', letterSpacing: '.06em', borderTop: '1px solid #bbf7d0', paddingTop: 8 }}>
                    // {currentResult.techniqueVerdict}
                  </div>
                </div>
              )}

              {/* Devotional Mimicry */}
              {currentResult.devotionalMimicry && currentResult.devotionalDesc && (
                <div style={{ marginTop: 10, background: '#fff7ed', border: '1px solid #fed7aa', borderLeft: '3px solid #f59e0b', padding: '14px 18px' }}>
                  <div style={{ ...mono, fontSize: 9, color: '#d97706', letterSpacing: '.14em', marginBottom: 6 }}>♡ Devotional Mimicry // 圧倒的な同化愛</div>
                  <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.9, ...mono }}>{currentResult.devotionalDesc}</div>
                </div>
              )}
            </div>

            {/* 影響の読み直し */}
            <div style={{ background: '#f8f9fa', border: '1px solid #e5e7eb', borderLeft: '3px solid #7c3aed', padding: '20px 22px', marginBottom: 16 }}>
              <span style={{ ...mono, fontSize: 9, letterSpacing: '.18em', color: '#7c3aed', display: 'block', marginBottom: 12 }}>// 影響の読み直し</span>
              <div style={{ fontSize: 14, color: '#1a1a1a', lineHeight: 2 }}>{currentResult.reconstruction}</div>
            </div>

            {/* レビューごとの読解サイン */}
            {currentResult.perReview.length > 0 && (
              <div style={{ background: '#f8f9fa', border: '1px solid #e5e7eb', padding: '20px 22px', marginBottom: 16 }}>
                <div style={{ ...mono, fontSize: 9, letterSpacing: '.18em', color: '#6b7280', marginBottom: 14 }}>// レビューごとの読解サイン</div>
                {currentResult.perReview.map((p, i) => (
                  <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < currentResult.perReview.length - 1 ? '1px solid #e5e7eb' : 'none' }}>
                    <div style={{
                      fontSize: 12, lineHeight: 1.8, fontStyle: 'italic', marginBottom: 6,
                      borderLeft: `2px solid ${p.isNegative ? '#ef4444' : '#e5e7eb'}`,
                      paddingLeft: 10, color: p.isNegative ? '#ef4444' : '#6b7280',
                    }}>
                      {p.isNegative ? '🔴 ' : ''}「{p.quote}」
                    </div>
                    <div style={{ ...mono, fontSize: 9, letterSpacing: '.08em', color: p.isNegative ? '#ef4444' : '#7c3aed' }}>
                      {p.isNegative ? '⚡ 逆算 // ' : '// '}{p.signal}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 5君からの一言 */}
            <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderLeft: '3px solid #7c3aed', padding: '18px 20px', marginBottom: 16 }}>
              <span style={{ ...mono, fontSize: 9, letterSpacing: '.18em', color: '#7c3aed', display: 'block', marginBottom: 8 }}>// 5君からの一言</span>
              <div style={{ fontSize: 13, color: '#1a1a1a', lineHeight: 1.9 }}>{currentResult.prescription}</div>
            </div>

            {/* 過大評価バグ */}
            {currentResult.isFake && currentResult.fakeReason && (
              <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderLeft: '3px solid #ef4444', padding: '14px 18px', marginBottom: 16 }}>
                <span style={{ ...mono, fontSize: 9, letterSpacing: '.14em', color: '#ef4444', display: 'block', marginBottom: 8 }}>⚠ 過大評価バグ検出 // Overrated Bug Detected</span>
                <div style={{ fontSize: 13, color: '#7f1d1d', lineHeight: 1.9 }}>{currentResult.fakeReason}</div>
              </div>
            )}

            {/* 複数作品比較 */}
            {compareText && (
              <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderLeft: '3px solid #7c3aed', padding: '18px 20px', marginBottom: 16 }}>
                <span style={{ ...mono, fontSize: 9, letterSpacing: '.14em', color: '#7c3aed', display: 'block', marginBottom: 10 }}>// 作品間の断絶 // Comparison Analysis</span>
                <div style={{ fontSize: 13, color: '#1a1a1a', lineHeight: 1.9 }}>{compareText}</div>
              </div>
            )}

            {/* アクションボタン */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={handleSaveToNote}
                disabled={noteSaved}
                title={noteSaved ? 'Noteに保存しました' : 'Noteに保存'}
                style={{
                  ...mono, fontSize: 9, letterSpacing: '.12em',
                  background: 'transparent',
                  border: `1px solid ${noteSaved ? '#10b981' : '#e5e7eb'}`,
                  color: noteSaved ? '#10b981' : '#6b7280',
                  padding: '9px 20px',
                  cursor: noteSaved ? 'default' : 'pointer',
                  borderRadius: 2,
                }}
              >
                {noteSaved ? 'Note ✓' : 'Note +'}
              </button>
              <button onClick={resetCurrent} title="別の作品を判定する" style={{ ...mono, fontSize: 9, letterSpacing: '.12em', background: 'transparent', border: '1px solid #e5e7eb', color: '#6b7280', padding: '9px 20px', cursor: 'pointer', borderRadius: 2 }}>
                Reset ×
              </button>
              <button onClick={resetAll} title="すべてクリア" style={{ ...mono, fontSize: 9, letterSpacing: '.12em', background: 'transparent', border: '1px solid #e5e7eb', color: '#6b7280', padding: '9px 20px', cursor: 'pointer', borderRadius: 2 }}>
                Clear ×
              </button>
              <button onClick={() => router.push('/kokoro-chat')} title="Talkに戻る" style={{ ...mono, fontSize: 9, letterSpacing: '.12em', background: 'transparent', border: '1px solid rgba(124,58,237,.3)', color: '#7c3aed', padding: '9px 20px', cursor: 'pointer', borderRadius: 2 }}>
                ← Talk
              </button>
            </div>
          </div>
        )}

        <footer style={{ marginTop: 60, borderTop: '1px solid #e5e7eb', paddingTop: 16, ...mono, fontSize: 9, color: '#9ca3af', letterSpacing: '.08em' }}>
          Kokoro Insight // Kokoro OS // 千田正憲 // 岩手
        </footer>
      </div>
    </div>
  );
}
