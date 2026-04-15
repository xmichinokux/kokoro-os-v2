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

type Mode = 'coord' | 'check' | 'brand' | 'next' | 'deep';

const DEEP_CACHE_KEY = 'kokoro_fashion_deep_cache';

type DeepBrand = {
  name: string;
  reason: string;
  price?: string;
  url?: string;
  shop?: string;
};
type DeepResult = {
  summary: string;
  brands: DeepBrand[];
  avoid: string;
  sources: { title: string; uri: string }[];
  generatedAt: string;
};

type CheckResult = {
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

type CoordResult = { main: string; point: string; leap: string };
type BrandResult = { brands: { name: string; desc: string; price?: string }[]; avoid: string };
type NextResult = { item: string; reason: string; leap: string; how: string };

export default function KokoroFashion() {
  const [mode, setMode] = useState<Mode>('coord');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [kokoroProfile, setKokoroProfile] = useState<KokoroUserProfile | null>(null);

  // Coord
  const [coordWeather, setCoordWeather] = useState('晴れ');
  const [coordPlan, setCoordPlan] = useState('普段通り・特になし');
  const [coordMood, setCoordMood] = useState('普通');
  const [coordWardrobe, setCoordWardrobe] = useState('');
  const [coordResult, setCoordResult] = useState<CoordResult | null>(null);
  const [coordNoteSaved, setCoordNoteSaved] = useState(false);

  // Check
  const [checkOutfit, setCheckOutfit] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMediaType, setImageMediaType] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [checkNoteSaved, setCheckNoteSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Brand
  const [brandBudget, setBrandBudget] = useState('ミドル（5千〜2万円）');
  const [brandAccess, setBrandAccess] = useState('通販・オンライン中心');
  const [brandResult, setBrandResult] = useState<BrandResult | null>(null);
  const [brandNoteSaved, setBrandNoteSaved] = useState(false);

  // Next
  const [nextWardrobe, setNextWardrobe] = useState('');
  const [nextResult, setNextResult] = useState<NextResult | null>(null);
  const [nextNoteSaved, setNextNoteSaved] = useState(false);

  // Deep
  const [deepBudget, setDeepBudget] = useState('ミドル（5千〜2万円）');
  const [deepAccess, setDeepAccess] = useState('通販・オンライン中心');
  const [deepArea, setDeepArea] = useState('');
  const [deepResult, setDeepResult] = useState<DeepResult | null>(null);
  const [deepNoteSaved, setDeepNoteSaved] = useState(false);

  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (started) return;
    setStarted(true);
    getKokoroProfile().then(p => { if (p) setKokoroProfile(p); });

    // Deep キャッシュ読み込み
    try {
      const raw = localStorage.getItem(DEEP_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached?.result) {
          setDeepResult(cached.result);
          if (cached.budget) setDeepBudget(cached.budget);
          if (cached.access) setDeepAccess(cached.access);
          if (cached.area) setDeepArea(cached.area);
        }
      }
    } catch { /* ignore */ }

    // Talk 連携：画像引き継ぎ
    const raw = sessionStorage.getItem('fashionIntent');
    if (raw) {
      sessionStorage.removeItem('fashionIntent');
      try {
        const intent = JSON.parse(raw);
        if (intent.imageBase64 && intent.imageMediaType) {
          setImageBase64(intent.imageBase64);
          setImageMediaType(intent.imageMediaType);
          setPreview(`data:${intent.imageMediaType};base64,${intent.imageBase64}`);
          setMode('check');
        }
      } catch { /* ignore */ }
    }
  }, [started]);

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
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const removeImage = () => {
    setPreview(null);
    setImageBase64(null);
    setImageMediaType(null);
  };

  const callFashionAPI = useCallback(async <T,>(payload: Record<string, unknown>): Promise<T> => {
    const profile: KokoroProfile = await getProfile();
    const kp = await getKokoroProfile();
    const res = await fetch('/api/fashion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, profile, kokoroProfile: kp }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data as T;
  }, []);

  const runCoord = async () => {
    setError('');
    setCoordResult(null);
    setCoordNoteSaved(false);
    setIsLoading(true);
    try {
      const r = await callFashionAPI<CoordResult>({
        mode: 'coord',
        weather: coordWeather,
        plan: coordPlan,
        mood: coordMood,
        wardrobe: coordWardrobe,
      });
      setCoordResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : '不明なエラー');
    } finally {
      setIsLoading(false);
    }
  };

  const runCheck = async () => {
    if (!checkOutfit.trim() && !imageBase64) {
      setError('画像かテキストを入力してください');
      return;
    }
    setError('');
    setCheckResult(null);
    setDetailsOpen(false);
    setCheckNoteSaved(false);
    setIsLoading(true);
    try {
      const r = await callFashionAPI<CheckResult>({
        mode: 'check',
        imageBase64: imageBase64 || undefined,
        imageMediaType: imageMediaType || undefined,
        textInput: checkOutfit || undefined,
      });
      setCheckResult(r);
      if (r.inferredUpdate) {
        if (r.inferredUpdate.fashion_axes) updateInferred('fashion_axes', r.inferredUpdate.fashion_axes);
        if (r.inferredUpdate.taste_clusters) updateInferred('taste_clusters', r.inferredUpdate.taste_clusters);
        if (r.inferredUpdate.emotional_pattern) updateInferred('emotional_pattern', r.inferredUpdate.emotional_pattern);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '不明なエラー');
    } finally {
      setIsLoading(false);
    }
  };

  const runBrand = async () => {
    setError('');
    setBrandResult(null);
    setBrandNoteSaved(false);
    setIsLoading(true);
    try {
      const r = await callFashionAPI<BrandResult>({
        mode: 'brand',
        budget: brandBudget,
        access: brandAccess,
      });
      setBrandResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : '不明なエラー');
    } finally {
      setIsLoading(false);
    }
  };

  const runNext = async () => {
    setError('');
    setNextResult(null);
    setNextNoteSaved(false);
    setIsLoading(true);
    try {
      const r = await callFashionAPI<NextResult>({
        mode: 'next',
        wardrobe: nextWardrobe,
      });
      setNextResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : '不明なエラー');
    } finally {
      setIsLoading(false);
    }
  };

  const runDeep = async () => {
    setError('');
    setIsLoading(true);
    setDeepNoteSaved(false);
    try {
      const profile: KokoroProfile = await getProfile();
      const kp = await getKokoroProfile();
      const res = await fetch('/api/fashion-deep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile, kokoroProfile: kp,
          budget: deepBudget, access: deepAccess, area: deepArea,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDeepResult(data);
      try {
        localStorage.setItem(DEEP_CACHE_KEY, JSON.stringify({
          result: data, budget: deepBudget, access: deepAccess, area: deepArea,
        }));
      } catch { /* ignore */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : '不明なエラー');
    } finally {
      setIsLoading(false);
    }
  };

  const clearDeepCache = () => {
    try { localStorage.removeItem(DEEP_CACHE_KEY); } catch { /* ignore */ }
    setDeepResult(null);
    setDeepNoteSaved(false);
  };

  const saveCoord = async () => {
    if (!coordResult || coordNoteSaved) return;
    const text = [
      `[今日のコーデ] ${coordWeather} / ${coordPlan} / ${coordMood}`,
      '',
      coordResult.main,
      '',
      `[ポイント]\n${coordResult.point}`,
      '',
      `[スタイルとの接続]\n${coordResult.leap}`,
    ].join('\n');
    await saveToNote(text, 'Fashion');
    setCoordNoteSaved(true);
  };

  const saveCheck = async () => {
    if (!checkResult || checkNoteSaved) return;
    const text = [
      `[スタイル名] ${checkResult.styleName}`,
      checkResult.keywords.length ? `[キーワード] ${checkResult.keywords.join(', ')}` : '',
      '', checkResult.summary, '',
      `[スコア] Style Match: ${checkResult.scores.styleMatch} / Reality Fit: ${checkResult.scores.realityFit}`,
      '',
      `[良い点]\n${checkResult.details.goodPoints}`,
      '',
      `[ズレ / 提案]\n${checkResult.details.mismatches}`,
      '',
      `[印象]\n${checkResult.details.impression}`,
      '',
      `[年齢・文脈]\n${checkResult.details.ageVision}`,
    ].filter(Boolean).join('\n');
    await saveToNote(text, 'Fashion');
    setCheckNoteSaved(true);
  };

  const saveBrand = async () => {
    if (!brandResult || brandNoteSaved) return;
    const text = [
      `[ブランド提案] 予算: ${brandBudget} / 入手: ${brandAccess}`,
      '',
      ...brandResult.brands.map(b => `・${b.name}${b.price ? ` (${b.price})` : ''}\n  ${b.desc}`),
      '',
      `[避けるべき方向性]\n${brandResult.avoid}`,
    ].join('\n');
    await saveToNote(text, 'Fashion');
    setBrandNoteSaved(true);
  };

  const saveDeep = async () => {
    if (!deepResult || deepNoteSaved) return;
    const text = [
      `[おすすめDeep] 予算: ${deepBudget} / 入手: ${deepAccess}${deepArea ? ` / エリア: ${deepArea}` : ''}`,
      '',
      deepResult.summary,
      '',
      ...deepResult.brands.map(b =>
        `・${b.name}${b.price ? ` (${b.price})` : ''}\n  ${b.reason}${b.url ? `\n  ${b.url}` : ''}${b.shop ? `\n  取扱: ${b.shop}` : ''}`
      ),
      '',
      `[避けるべき方向性]\n${deepResult.avoid}`,
    ].join('\n');
    await saveToNote(text, 'Fashion');
    setDeepNoteSaved(true);
  };

  const formatRelative = (iso: string): string => {
    try {
      const diff = Date.now() - new Date(iso).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'たった今';
      if (mins < 60) return `${mins}分前`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}時間前`;
      const days = Math.floor(hours / 24);
      return `${days}日前`;
    } catch { return ''; }
  };

  const saveNext = async () => {
    if (!nextResult || nextNoteSaved) return;
    const text = [
      `[次に買うべき一点] ${nextResult.item}`,
      '',
      nextResult.reason,
      '',
      `[飛躍]\n${nextResult.leap}`,
      '',
      `[選び方]\n${nextResult.how}`,
    ].join('\n');
    await saveToNote(text, 'Fashion');
    setNextNoteSaved(true);
  };

  // ---------- styles ----------
  const labelStyle = {
    fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: '0.18em',
    color: '#9ca3af', textTransform: 'uppercase' as const, display: 'block', marginBottom: 10,
  };
  const textareaStyle = {
    width: '100%', background: '#f8f9fa',
    border: '1px solid #d1d5db', borderLeft: '2px solid #d1d5db',
    borderRadius: '0 4px 4px 0',
    padding: 14, fontSize: 14, color: '#111827',
    resize: 'vertical' as const, outline: 'none', minHeight: 70,
    fontFamily: "'Noto Sans JP', sans-serif",
    boxSizing: 'border-box' as const,
  };
  const selectStyle = {
    width: '100%', background: '#f8f9fa', border: '1px solid #d1d5db',
    borderRadius: 4, padding: '10px 12px', fontSize: 13, color: '#111827',
    outline: 'none', cursor: 'pointer',
    fontFamily: "'Noto Sans JP', sans-serif",
  };
  const runBtn = (enabled: boolean) => ({
    width: '100%', background: 'transparent',
    border: `1px solid ${enabled ? '#7c3aed' : '#d1d5db'}`,
    color: enabled ? '#7c3aed' : '#9ca3af',
    fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: '0.2em',
    padding: 13, cursor: enabled ? 'pointer' : 'not-allowed',
    borderRadius: 2, marginTop: 8,
  });
  const tabStyle = (active: boolean) => ({
    fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: '0.1em',
    padding: '10px 14px', cursor: 'pointer',
    color: active ? '#7c3aed' : '#6b7280',
    border: 'none', background: 'transparent',
    borderBottom: `2px solid ${active ? '#7c3aed' : 'transparent'}`,
    textTransform: 'uppercase' as const,
    flex: 1,
  });
  const resultCardStyle = {
    background: '#f9fafb', border: '1px solid #e5e7eb',
    padding: 24, borderRadius: 4, marginTop: 20,
  };
  const resultSectionStyle = {
    marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #e5e7eb',
  };
  const resultLabelStyle = {
    fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: '0.18em',
    color: '#7c3aed', textTransform: 'uppercase' as const, display: 'block', marginBottom: 10,
  };
  const resultBodyStyle = { fontSize: 14, color: '#374151', lineHeight: 2 };
  const noteBtnStyle = (saved: boolean) => ({
    fontFamily: "'Space Mono', monospace", fontSize: 10,
    color: saved ? '#34d399' : '#7c3aed',
    background: 'transparent',
    border: `1px solid ${saved ? 'rgba(52,211,153,0.4)' : 'rgba(124,58,237,0.3)'}`,
    borderRadius: 6, padding: '8px 18px',
    cursor: saved ? 'default' : 'pointer',
    letterSpacing: '0.1em', marginTop: 12,
  });

  const ScoreBar = ({ label, value }: { label: string; value: number }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: '0.12em', color: '#6b7280', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: '#7c3aed', fontWeight: 700 }}>{value}</span>
      </div>
      <div style={{ height: 4, background: '#f3f4f6', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, background: '#7c3aed', borderRadius: 2, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#1a1a1a', fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 300 }}>

      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
        <div>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700 }}>Kokoro</span>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: '#7c3aed', marginLeft: 4 }}>OS</span>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: '#9ca3af', marginLeft: 8, letterSpacing: '0.15em' }}>// Fashion</span>
        </div>
        <div />
      </header>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px 120px' }}>

        {hasProfileData(kokoroProfile) && (
          <div style={{
            marginBottom: 24, padding: '10px 16px',
            background: 'rgba(99,102,241,0.06)',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, flexWrap: 'wrap',
          }}>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: '#6366f1', letterSpacing: '0.12em' }}>
              // プロフィールを使用中
            </span>
            <a href="/kokoro-profile" style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: '#9ca3af', textDecoration: 'none', letterSpacing: '0.1em' }}>
              編集 →
            </a>
          </div>
        )}

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>👔</div>
          <div style={{ fontSize: 18, fontWeight: 400, marginBottom: 6 }}>Fashion</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>スタイルの処方</div>
        </div>

        {/* タブ */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 28, borderBottom: '1px solid #e5e7eb' }}>
          <button style={tabStyle(mode === 'coord')} onClick={() => setMode('coord')}>今日のコーデ</button>
          <button style={tabStyle(mode === 'check')} onClick={() => setMode('check')}>チェック</button>
          <button style={tabStyle(mode === 'brand')} onClick={() => setMode('brand')}>ブランド</button>
          <button style={tabStyle(mode === 'next')} onClick={() => setMode('next')}>次の一点</button>
          <button style={tabStyle(mode === 'deep')} onClick={() => setMode('deep')}>
            おすすめDeep
            <span style={{ marginLeft: 4, fontSize: 7, color: '#f472b6', letterSpacing: '0.05em' }}>★</span>
          </button>
        </div>

        {/* ① 今日のコーデ */}
        {mode === 'coord' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>// 今日の天気</label>
              <select style={selectStyle} value={coordWeather} onChange={e => setCoordWeather(e.target.value)}>
                <option>晴れ</option><option>曇り</option><option>雨</option><option>雪</option>
                <option>暑い</option><option>寒い</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>// 今日の予定</label>
                <select style={selectStyle} value={coordPlan} onChange={e => setCoordPlan(e.target.value)}>
                  <option>普段通り・特になし</option><option>仕事・オフィス</option>
                  <option>カジュアルな外出</option><option>友人と会う</option>
                  <option>デート</option><option>家にいる</option><option>特別な場所</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>// 今の気分</label>
                <select style={selectStyle} value={coordMood} onChange={e => setCoordMood(e.target.value)}>
                  <option>普通</option><option>テンションが上がっている</option>
                  <option>落ち着いていたい</option><option>目立ちたくない</option>
                  <option>攻めたい</option><option>疲れている</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>// 手持ちの服・ワードローブ（任意）</label>
              <textarea style={textareaStyle} rows={3}
                value={coordWardrobe} onChange={e => setCoordWardrobe(e.target.value)}
                placeholder="例：黒のオーバーサイズT、グレーのスラックス、白スニーカー" />
            </div>
            <button style={runBtn(!isLoading)} onClick={runCoord} disabled={isLoading}>
              Yoroshiku
            </button>

            {isLoading && <PersonaLoading />}
            {coordResult && (
              <div style={resultCardStyle}>
                <div style={resultSectionStyle}>
                  <span style={resultLabelStyle}>// 今日のコーデ</span>
                  <div style={resultBodyStyle}>{coordResult.main}</div>
                </div>
                <div style={resultSectionStyle}>
                  <span style={resultLabelStyle}>// ポイント</span>
                  <div style={resultBodyStyle}>{coordResult.point}</div>
                </div>
                <div style={{ ...resultSectionStyle, marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>
                  <span style={resultLabelStyle}>// スタイルとのズレ / 意図</span>
                  <div style={resultBodyStyle}>{coordResult.leap}</div>
                </div>
                <button onClick={saveCoord} disabled={coordNoteSaved} style={noteBtnStyle(coordNoteSaved)}>
                  {coordNoteSaved ? 'Note ✓' : 'Note +'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ② チェック */}
        {mode === 'check' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>// 今日の服装（テキスト or 画像）</label>
              <textarea style={textareaStyle} rows={3}
                value={checkOutfit} onChange={e => setCheckOutfit(e.target.value)}
                placeholder="例：黒のオーバーサイズパーカー、ダメージデニム、白のコンバース" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>// 画像（任意）</label>
              {!preview ? (
                <div
                  onDrop={handleDrop} onDragOver={handleDragOver}
                  onClick={() => fileRef.current?.click()}
                  style={{ border: '2px dashed #e5e7eb', borderRadius: 12, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', background: '#f9fafb' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#7c3aed')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
                >
                  <div style={{ fontSize: 24, marginBottom: 8 }}>👔</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>画像をドロップ / クリックして選択</div>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <img src={preview} alt="preview" style={{ width: '100%', borderRadius: 12, display: 'block', maxHeight: 280, objectFit: 'cover' }} />
                  <button onClick={removeImage} style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,.5)', color: '#fff', border: 'none', borderRadius: 20, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}>✕ 変更</button>
                </div>
              )}
            </div>
            <button style={runBtn(!isLoading && (!!checkOutfit.trim() || !!imageBase64))}
              onClick={runCheck} disabled={isLoading || (!checkOutfit.trim() && !imageBase64)}>
              Yoroshiku
            </button>

            {isLoading && <PersonaLoading />}
            {checkResult && (
              <div style={resultCardStyle}>
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                  <span style={resultLabelStyle}>// Style Name</span>
                  <div style={{ fontSize: 18, fontWeight: 400, color: '#1a1a1a', lineHeight: 1.6, marginTop: 8 }}>
                    {checkResult.styleName}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
                  {checkResult.keywords.map((kw, i) => (
                    <span key={i} style={{ fontSize: 10, padding: '3px 10px', border: '1px solid #e5e7eb', borderRadius: 20, color: '#6b7280', background: '#fff' }}>{kw}</span>
                  ))}
                </div>
                <div style={{ borderLeft: '2px solid #7c3aed', paddingLeft: 16, marginBottom: 20 }}>
                  <div style={{ fontSize: 14, lineHeight: 2, color: '#374151' }}>{checkResult.summary}</div>
                </div>
                <div style={{ marginBottom: 20, padding: 16, background: '#fff', borderRadius: 8 }}>
                  <ScoreBar label="Style Match" value={checkResult.scores.styleMatch} />
                  <ScoreBar label="Reality Fit" value={checkResult.scores.realityFit} />
                </div>
                <button onClick={() => setDetailsOpen(v => !v)} style={{ width: '100%', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 2, color: '#6b7280', fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: '0.14em', padding: '11px 18px', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{detailsOpen ? '▲' : 'Details ▼'}</span>
                  <span style={{ fontSize: 8, color: '#9ca3af' }}>// Details</span>
                </button>
                {detailsOpen && (
                  <div style={{ marginTop: 14 }}>
                    {[
                      { label: '良い点', text: checkResult.details.goodPoints, color: '#059669' },
                      { label: 'ズレ / 提案', text: checkResult.details.mismatches, color: '#d97706' },
                      { label: '印象', text: checkResult.details.impression, color: '#2563eb' },
                      { label: '年齢・文脈', text: checkResult.details.ageVision, color: '#7c3aed' },
                    ].map((s, i) => (
                      <div key={i} style={{ borderLeft: `2px solid ${s.color}`, paddingLeft: 16, marginBottom: 16 }}>
                        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: '0.18em', color: s.color, textTransform: 'uppercase', marginBottom: 8 }}>// {s.label}</div>
                        <div style={{ fontSize: 13, lineHeight: 1.9, color: '#374151' }}>{s.text}</div>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={saveCheck} disabled={checkNoteSaved} style={noteBtnStyle(checkNoteSaved)}>
                  {checkNoteSaved ? 'Note ✓' : 'Note +'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ③ ブランド */}
        {mode === 'brand' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>// 予算感</label>
                <select style={selectStyle} value={brandBudget} onChange={e => setBrandBudget(e.target.value)}>
                  <option>プチプラ（〜5千円）</option>
                  <option>ミドル（5千〜2万円）</option>
                  <option>ハイ（2万〜5万円）</option>
                  <option>ラグジュアリー（5万円〜）</option>
                  <option>問わない</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>// 入手しやすさ</label>
                <select style={selectStyle} value={brandAccess} onChange={e => setBrandAccess(e.target.value)}>
                  <option>通販・オンライン中心</option>
                  <option>全国展開の店舗</option>
                  <option>都市部の路面店もOK</option>
                  <option>問わない</option>
                </select>
              </div>
            </div>
            <button style={runBtn(!isLoading)} onClick={runBrand} disabled={isLoading}>
              Yoroshiku
            </button>

            {isLoading && <PersonaLoading />}
            {brandResult && (
              <div style={resultCardStyle}>
                <div style={resultSectionStyle}>
                  <span style={resultLabelStyle}>// このスタイルに合うブランド</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
                    {brandResult.brands.map((b, i) => (
                      <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderLeft: '2px solid #7c3aed', padding: 14, borderRadius: '0 4px 4px 0' }}>
                        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: '#1a1a1a', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>{b.name}</div>
                        <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.8 }}>{b.desc}</div>
                        {b.price && <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: '#7c3aed', letterSpacing: '0.08em', marginTop: 6 }}>// {b.price}</div>}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ ...resultSectionStyle, marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>
                  <span style={resultLabelStyle}>// 避けるべき方向性</span>
                  <div style={resultBodyStyle}>{brandResult.avoid}</div>
                </div>
                <button onClick={saveBrand} disabled={brandNoteSaved} style={noteBtnStyle(brandNoteSaved)}>
                  {brandNoteSaved ? 'Note ✓' : 'Note +'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ④ 次の一点 */}
        {mode === 'next' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>// 今のワードローブ（任意）</label>
              <textarea style={{ ...textareaStyle, minHeight: 100 }} rows={4}
                value={nextWardrobe} onChange={e => setNextWardrobe(e.target.value)}
                placeholder="例：黒T複数、ダメージデニム、スニーカー（白・黒）、コンバース" />
            </div>
            <button style={runBtn(!isLoading)} onClick={runNext} disabled={isLoading}>
              Yoroshiku
            </button>

            {isLoading && <PersonaLoading />}
            {nextResult && (
              <div style={resultCardStyle}>
                <div style={{ background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.2)', borderLeft: '3px solid #7c3aed', padding: 18, borderRadius: '0 4px 4px 0', marginBottom: 18 }}>
                  <div style={{ fontSize: 18, color: '#1a1a1a', fontWeight: 400, lineHeight: 1.5, marginBottom: 10 }}>{nextResult.item}</div>
                  <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.9, marginBottom: 10 }}>{nextResult.reason}</div>
                  {nextResult.leap && (
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: '#f472b6', letterSpacing: '0.08em' }}>// {nextResult.leap}</div>
                  )}
                </div>
                <div style={{ ...resultSectionStyle, marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>
                  <span style={resultLabelStyle}>// 選び方・注意点</span>
                  <div style={resultBodyStyle}>{nextResult.how}</div>
                </div>
                <button onClick={saveNext} disabled={nextNoteSaved} style={noteBtnStyle(nextNoteSaved)}>
                  {nextNoteSaved ? 'Note ✓' : 'Note +'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ⑤ おすすめDeep (Gemini + Google検索) */}
        {mode === 'deep' && (
          <div>
            <div style={{
              marginBottom: 20, padding: '12px 16px',
              background: 'rgba(244,114,182,0.06)',
              border: '1px solid rgba(244,114,182,0.2)',
              borderLeft: '3px solid #f472b6',
              borderRadius: '0 4px 4px 0',
            }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: '0.14em', color: '#f472b6', marginBottom: 6 }}>
                // POWERED BY GEMINI + GOOGLE SEARCH
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.7 }}>
                インターネットを検索して、実在するブランド・ショップを提案します。結果は端末に保存され、次回開いた時も残ります。
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>// 予算感</label>
                <select style={selectStyle} value={deepBudget} onChange={e => setDeepBudget(e.target.value)}>
                  <option>プチプラ（〜5千円）</option>
                  <option>ミドル（5千〜2万円）</option>
                  <option>ハイ（2万〜5万円）</option>
                  <option>ラグジュアリー（5万円〜）</option>
                  <option>問わない</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>// 入手しやすさ</label>
                <select style={selectStyle} value={deepAccess} onChange={e => setDeepAccess(e.target.value)}>
                  <option>通販・オンライン中心</option>
                  <option>全国展開の店舗</option>
                  <option>都市部の路面店もOK</option>
                  <option>問わない</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>// エリア（任意・都市部の路面店を探す場合）</label>
              <input
                type="text"
                value={deepArea}
                onChange={e => setDeepArea(e.target.value)}
                placeholder="例：東京（渋谷・原宿）、京都、名古屋..."
                style={{
                  width: '100%', background: '#f8f9fa', border: '1px solid #d1d5db',
                  borderRadius: 4, padding: '10px 12px', fontSize: 13, color: '#111827',
                  outline: 'none', fontFamily: "'Noto Sans JP', sans-serif", boxSizing: 'border-box',
                }}
              />
            </div>

            {!deepResult && (
              <button style={runBtn(!isLoading)} onClick={runDeep} disabled={isLoading}>
                Yoroshiku
              </button>
            )}

            {isLoading && (
              <div style={{ marginTop: 16 }}>
                <PersonaLoading />
                <div style={{ textAlign: 'center', marginTop: 10, fontFamily: "'Space Mono', monospace", fontSize: 9, color: '#9ca3af', letterSpacing: '0.12em' }}>
                  // Googleを検索しています...
                </div>
              </div>
            )}

            {deepResult && (
              <div style={resultCardStyle}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #e5e7eb',
                  gap: 8, flexWrap: 'wrap',
                }}>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: '#9ca3af', letterSpacing: '0.1em' }}>
                    // キャッシュ保存中 · {formatRelative(deepResult.generatedAt)}に生成
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={runDeep} disabled={isLoading}
                      style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: '#7c3aed', background: 'transparent', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', letterSpacing: '0.08em' }}>
                      ↻ 再取得
                    </button>
                    <button onClick={clearDeepCache}
                      style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: '#9ca3af', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', letterSpacing: '0.08em' }}>
                      ✕ 削除
                    </button>
                  </div>
                </div>

                {deepResult.summary && (
                  <div style={{ borderLeft: '2px solid #f472b6', paddingLeft: 16, marginBottom: 20 }}>
                    <div style={{ fontSize: 14, lineHeight: 2, color: '#374151' }}>{deepResult.summary}</div>
                  </div>
                )}

                <div style={resultSectionStyle}>
                  <span style={{ ...resultLabelStyle, color: '#f472b6' }}>// 検索で見つかったブランド</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
                    {deepResult.brands.map((b, i) => (
                      <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderLeft: '2px solid #f472b6', padding: 14, borderRadius: '0 4px 4px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: '#1a1a1a', fontWeight: 700, letterSpacing: '0.05em' }}>{b.name}</div>
                          {b.price && <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: '#f472b6', letterSpacing: '0.08em' }}>{b.price}</div>}
                        </div>
                        <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.8, marginBottom: 6 }}>{b.reason}</div>
                        {b.shop && (
                          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>取扱: {b.shop}</div>
                        )}
                        {b.url && (
                          <a href={b.url} target="_blank" rel="noopener noreferrer"
                            style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: '#7c3aed', textDecoration: 'none', letterSpacing: '0.05em', wordBreak: 'break-all' }}>
                            → {b.url.replace(/^https?:\/\//, '').slice(0, 50)}{b.url.length > 57 ? '...' : ''}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {deepResult.avoid && (
                  <div style={resultSectionStyle}>
                    <span style={resultLabelStyle}>// 避けるべき方向性</span>
                    <div style={resultBodyStyle}>{deepResult.avoid}</div>
                  </div>
                )}

                {deepResult.sources && deepResult.sources.length > 0 && (
                  <div style={{ ...resultSectionStyle, marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>
                    <span style={{ ...resultLabelStyle, color: '#9ca3af' }}>// 検索ソース</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                      {deepResult.sources.slice(0, 5).map((s, i) => (
                        <a key={i} href={s.uri} target="_blank" rel="noopener noreferrer"
                          style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: '#6b7280', textDecoration: 'none', letterSpacing: '0.03em' }}>
                          · {s.title.slice(0, 60)}{s.title.length > 60 ? '...' : ''}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <button onClick={saveDeep} disabled={deepNoteSaved} style={noteBtnStyle(deepNoteSaved)}>
                  {deepNoteSaved ? 'Note ✓' : 'Note +'}
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 16, color: '#ef4444', fontSize: 12, textAlign: 'center' }}>{error}</div>
        )}
      </div>
    </div>
  );
}
