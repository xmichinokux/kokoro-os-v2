'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import PersonaLoading from '@/components/PersonaLoading';
import {
  type EffectChain, type EffectParam,
  STYLE_PRESETS, ALL_EFFECTS,
  applyEffectChain, loadImageToCanvas,
} from '@/lib/imageEffects';

const mono = { fontFamily: "'Space Mono', monospace" } as const;
const accentColor = '#e11d48';

type Mode = 'generate' | 'process' | 'vector';
type VecEditEntry = { instruction: string; svg: string };


const GEN_PRESETS = [
  { label: '幾何学パターン', prompt: '幾何学的な模様を使った抽象アート。三角形、円、線が重なり合う美しいパターン。' },
  { label: 'パーティクル', prompt: '浮遊するパーティクルが接続線で繋がるジェネラティブアート。マウスに反応して動く。' },
  { label: '波形アート', prompt: '複数のサイン波が重なり合って作るオーガニックな波形ビジュアル。色がグラデーションで変化する。' },
  { label: 'フラクタル', prompt: '再帰的な樹形のフラクタルアート。風に揺れるようなアニメーション付き。' },
  { label: 'ノイズアート', prompt: 'パーリンノイズを使った有機的なフローフィールド。粒子が流れに沿って動く。' },
  { label: 'モザイク', prompt: '色彩豊かなボロノイ図法ベースのモザイクアート。クリックで再生成できる。' },
];

export default function KokoroCreativePage() {
  const router = useRouter();

  // === 共通 ===
  const [mode, setMode] = useState<Mode>('generate');
  const [hasAestheticMap, setHasAestheticMap] = useState(false);
  const [error, setError] = useState('');

  // === Generate モード ===
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const testIframeRef = useRef<HTMLIFrameElement>(null);
  const [spec, setSpec] = useState('');
  const [genPhase, setGenPhase] = useState<'input' | 'generating' | 'done'>('input');
  const [generatedCode, setGeneratedCode] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [validationLog, setValidationLog] = useState<string[]>([]);
  const [designDoc, setDesignDoc] = useState('');

  // === Process モード ===
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [procPhase, setProcPhase] = useState<'upload' | 'editing'>('upload');
  const [imageLoaded, setImageLoaded] = useState(false);
  const [effectChain, setEffectChain] = useState<EffectChain>([]);
  const [styleInput, setStyleInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // === 自律調整 (Phase 3) ===
  const [autoAdjusting, setAutoAdjusting] = useState(false);
  const [adjustLog, setAdjustLog] = useState<{ round: number; evaluation: string; adjustments: string; score: number }[]>([]);
  const [adjustScore, setAdjustScore] = useState<number | null>(null);

  // === Vector モード ===
  const [vecSubject, setVecSubject] = useState('');
  const [vecStyle, setVecStyle] = useState('');
  const [vecPhase, setVecPhase] = useState<'input' | 'generating' | 'done' | 'editing'>('input');
  const [vecSvg, setVecSvg] = useState('');
  const [vecDesignDoc, setVecDesignDoc] = useState('');
  const [vecProgress, setVecProgress] = useState('');
  const [vecLog, setVecLog] = useState<string[]>([]);
  const [vecShowCode, setVecShowCode] = useState(false);

  // === Vector Edit ===
  const vecFileInputRef = useRef<HTMLInputElement>(null);
  const [vecEditInstruction, setVecEditInstruction] = useState('');
  const [vecEditHistory, setVecEditHistory] = useState<VecEditEntry[]>([]);
  const [vecEditLoading, setVecEditLoading] = useState(false);
  const [vecShowHistory, setVecShowHistory] = useState(false);

  // 感性マップ確認
  useEffect(() => {
    fetch('/api/drive-cache')
      .then(r => r.json())
      .then(d => { if (d.writing || d.thought || d.structure) setHasAestheticMap(true); })
      .catch(() => {});
  }, []);

  // API呼び出しヘルパー
  const apiFetch = useCallback(async (url: string, body: Record<string, unknown>, timeoutMs = 120000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('タイムアウト'), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(`サーバーエラー（${res.status}）: ${text.slice(0, 100)}`); }
      if (data.error) throw new Error(data.error);
      return data;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'TimeoutError') throw new Error('タイムアウト');
      if (e instanceof DOMException && e.name === 'AbortError') throw new Error('タイムアウト');
      throw e;
    } finally { clearTimeout(timeoutId); }
  }, []);

  // ========================
  // Generate モード関数
  // ========================
  const injectErrorSnippet = useCallback((html: string): string => {
    const snippet = `<script>
(function(){var errs=[];window.__rtErrs=errs;var origCE=console.error;console.error=function(){var m=Array.prototype.slice.call(arguments).join(' ');errs.push({t:'console.error',m:m});origCE.apply(console,arguments);};window.onerror=function(msg,src,line,col,err){if(src&&(src.indexOf('cdn.jsdelivr')!==-1||src.indexOf('googleapis')!==-1))return;errs.push({t:'onerror',m:String(msg),l:line,c:col,s:err?err.stack:''});};window.addEventListener('unhandledrejection',function(e){errs.push({t:'unhandledrejection',m:String(e.reason),s:e.reason&&e.reason.stack||''});});setTimeout(function(){window.parent.postMessage({type:'KOKORO_RT_ERRORS',errors:errs},'*');},3000);})();
<\/script>`;
    const bodyIdx = html.indexOf('<body>');
    if (bodyIdx >= 0) return html.slice(0, bodyIdx + 6) + '\n' + snippet + '\n' + html.slice(bodyIdx + 6);
    const scriptIdx = html.indexOf('<script');
    if (scriptIdx >= 0) return html.slice(0, scriptIdx) + snippet + '\n' + html.slice(scriptIdx);
    return html;
  }, []);

  const testRuntimeErrors = useCallback((html: string): Promise<string[]> => {
    return new Promise((resolve) => {
      const modifiedHtml = injectErrorSnippet(html);
      const iframe = testIframeRef.current;
      if (!iframe) { resolve([]); return; }
      let resolved = false;
      const handler = (event: MessageEvent) => {
        if (resolved) return;
        if (event.data?.type === 'KOKORO_RT_ERRORS' && event.source === iframe.contentWindow) {
          resolved = true; window.removeEventListener('message', handler);
          const errors: string[] = (event.data.errors || []).map((e: { t: string; m: string; l?: number; c?: number; s?: string }) => {
            if (e.t === 'onerror') return `[Line ${e.l || '?'}] ${e.m}${e.s ? '\n  ' + e.s.split('\n')[0] : ''}`;
            if (e.t === 'console.error') return `[console.error] ${e.m}`;
            return `[${e.t}] ${e.m}`;
          });
          iframe.srcdoc = ''; resolve(errors);
        }
      };
      window.addEventListener('message', handler);
      iframe.srcdoc = modifiedHtml;
      setTimeout(() => { if (!resolved) { resolved = true; window.removeEventListener('message', handler); iframe.srcdoc = ''; resolve([]); } }, 5000);
    });
  }, [injectErrorSnippet]);

  const handleGenerate = useCallback(async () => {
    if (!spec.trim()) return;
    setGenPhase('generating'); setError(''); setGeneratedCode(''); setPreviewUrl(null);
    setShowCode(false); setCopied(false); setValidationLog([]); setDesignDoc('');
    try {
      setProgressMessage('ビジュアル設計中...');
      const designData = await apiFetch('/api/creative-generate', { spec: spec.trim(), step: 'design' });
      const instruction = designData.instruction as string;
      setDesignDoc(instruction);
      if (designData.hasAestheticMap) setHasAestheticMap(true);

      setProgressMessage('コードを生成中...');
      const codeData = await apiFetch('/api/creative-generate', { spec: spec.trim(), step: 'implement', instruction });
      let currentCode = codeData.code as string;

      const MAX_RT_ROUNDS = 3; const logs: string[] = [];
      for (let rtRound = 0; rtRound < MAX_RT_ROUNDS; rtRound++) {
        setProgressMessage(`ランタイムテスト中... (${rtRound + 1}/${MAX_RT_ROUNDS})`);
        logs.push(`▶ ランタイムテスト ${rtRound + 1}/${MAX_RT_ROUNDS}...`); setValidationLog([...logs]);
        const runtimeErrors = await testRuntimeErrors(currentCode);
        if (runtimeErrors.length === 0) { logs.push(`✓ エラーなし${rtRound > 0 ? `（修正${rtRound}回）` : ''}`); setValidationLog([...logs]); break; }
        if (rtRound === MAX_RT_ROUNDS - 1) { logs.push(`△ ${runtimeErrors.length}件残存`); setValidationLog([...logs]); break; }
        setProgressMessage('エラー修正中...');
        logs.push(`  → ${runtimeErrors.length}件修正中...`); setValidationLog([...logs]);
        try {
          const fixData = await apiFetch('/api/builder-runtime-fix', { html: currentCode, errors: runtimeErrors.slice(0, 10), designDoc: instruction });
          currentCode = fixData.code as string; logs.push(`  ✓ 修正完了`); setValidationLog([...logs]);
        } catch (fixErr) { logs.push(`  ✗ 修正失敗: ${fixErr instanceof Error ? fixErr.message : 'エラー'}`); setValidationLog([...logs]); break; }
      }
      setGeneratedCode(currentCode); setPreviewUrl(currentCode); setGenPhase('done');
    } catch (e) { setError(e instanceof Error ? e.message : 'エラーが発生しました'); setGenPhase('input'); }
  }, [spec, apiFetch, testRuntimeErrors]);

  // ========================
  // Process モード関数
  // ========================
  const handleImageUpload = useCallback(async (file: File) => {
    try {
      setError('');
      const canvas = await loadImageToCanvas(file, 1200);
      sourceCanvasRef.current = canvas;
      setImgSize({ w: canvas.width, h: canvas.height });
      setImageLoaded(true);
      setProcPhase('editing');
      setEffectChain([]);
      // 初期プレビュー表示
      requestAnimationFrame(() => {
        const preview = previewCanvasRef.current;
        if (preview) {
          preview.width = canvas.width; preview.height = canvas.height;
          const ctx = preview.getContext('2d')!;
          ctx.drawImage(canvas, 0, 0);
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '画像の読み込みに失敗しました');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleImageUpload(file);
  }, [handleImageUpload]);

  // エフェクトチェーン適用（デバウンス付き）
  const applyEffects = useCallback(() => {
    if (!sourceCanvasRef.current || !previewCanvasRef.current) return;
    const result = applyEffectChain(sourceCanvasRef.current, effectChain);
    const preview = previewCanvasRef.current;
    preview.width = result.width; preview.height = result.height;
    const ctx = preview.getContext('2d')!;
    ctx.drawImage(result, 0, 0);
  }, [effectChain]);

  const debouncedApply = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(applyEffects, 100);
  }, [applyEffects]);

  // エフェクト変更時に再適用
  useEffect(() => {
    if (procPhase === 'editing' && imageLoaded) debouncedApply();
  }, [effectChain, procPhase, imageLoaded, debouncedApply]);

  // プリセット適用
  const applyPreset = useCallback((presetKey: string) => {
    const preset = STYLE_PRESETS[presetKey];
    if (preset) setEffectChain([...preset.chain]);
  }, []);

  // AIスタイル提案
  const handleAiSuggest = useCallback(async () => {
    if (!styleInput.trim()) return;
    setAiLoading(true); setError('');
    try {
      const data = await apiFetch('/api/creative-effects', { styleRequest: styleInput.trim() }, 30000);
      if (data.effects && data.effects.length > 0) {
        // ラベルをALL_EFFECTSから取得
        const labeled = data.effects.map((e: EffectParam) => {
          const info = ALL_EFFECTS.find(ae => ae.type === e.type);
          return { ...e, label: info?.label || e.type };
        });
        setEffectChain(labeled);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI提案に失敗しました');
    } finally { setAiLoading(false); }
  }, [styleInput, apiFetch]);

  // エフェクトパラメータ変更
  const updateEffect = useCallback((id: string, updates: Partial<EffectParam>) => {
    setEffectChain(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  }, []);

  // エフェクト削除
  const removeEffect = useCallback((id: string) => {
    setEffectChain(prev => prev.filter(e => e.id !== id));
  }, []);

  // エフェクト追加
  const addEffect = useCallback((type: string) => {
    const info = ALL_EFFECTS.find(e => e.type === type);
    if (!info) return;
    const newEffect: EffectParam = {
      id: `manual_${Date.now()}`,
      type: info.type,
      label: info.label,
      intensity: 50,
      enabled: true,
    };
    setEffectChain(prev => [...prev, newEffect]);
  }, []);

  // === AI自律調整 (Phase 3) ===
  const handleAutoAdjust = useCallback(async () => {
    if (!previewCanvasRef.current || !sourceCanvasRef.current) return;
    setAutoAdjusting(true);
    setError('');
    setAdjustLog([]);
    setAdjustScore(null);

    const MAX_ROUNDS = 3;
    let currentChain = [...effectChain];

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      try {
        // 現在のエフェクト適用結果をキャプチャ
        const resultCanvas = applyEffectChain(sourceCanvasRef.current, currentChain);
        // 画像サイズを縮小（API送信用、最大600px）
        const sendCanvas = document.createElement('canvas');
        const scale = Math.min(1, 600 / Math.max(resultCanvas.width, resultCanvas.height));
        sendCanvas.width = Math.round(resultCanvas.width * scale);
        sendCanvas.height = Math.round(resultCanvas.height * scale);
        const sendCtx = sendCanvas.getContext('2d')!;
        sendCtx.drawImage(resultCanvas, 0, 0, sendCanvas.width, sendCanvas.height);
        const imageBase64 = sendCanvas.toDataURL('image/jpeg', 0.7);

        const currentEffects = currentChain.map(e => ({
          type: e.type, label: e.label, intensity: e.intensity, enabled: e.enabled,
        }));

        const data = await apiFetch('/api/creative-auto-adjust', {
          imageBase64,
          currentEffects,
          round,
          styleHint: styleInput || '',
        }, 30000);

        const logEntry = {
          round,
          evaluation: data.evaluation || '評価なし',
          adjustments: data.adjustments || '調整なし',
          score: data.score ?? 0,
        };
        setAdjustLog(prev => [...prev, logEntry]);
        setAdjustScore(data.score ?? 0);

        // エフェクトを更新
        if (data.effects && data.effects.length > 0) {
          const labeled = data.effects.map((e: EffectParam) => {
            const info = ALL_EFFECTS.find(ae => ae.type === e.type);
            return { ...e, label: info?.label || e.type };
          });
          currentChain = labeled;
          setEffectChain(labeled);
        }

        // done=true or score >= 80 なら終了
        if (data.done || (data.score && data.score >= 80)) {
          break;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '自律調整に失敗しました');
        break;
      }
    }

    setAutoAdjusting(false);
  }, [effectChain, styleInput, apiFetch]);

  // ========================
  // Vector モード関数
  // ========================
  const handleVectorGenerate = useCallback(async () => {
    if (!vecSubject.trim()) return;
    setVecPhase('generating'); setError(''); setVecSvg(''); setVecDesignDoc('');
    setVecLog([]); setVecShowCode(false);
    const logs: string[] = [];

    try {
      // Step 1: Logic Layer（Gemini 構造設計）
      setVecProgress('Logic Layer: 構造設計中...');
      logs.push('▶ Logic Layer: 構造を設計中...'); setVecLog([...logs]);
      const logicData = await apiFetch('/api/creative-vector', {
        subject: vecSubject.trim(), style: vecStyle.trim(), step: 'logic',
      });
      const designDoc = logicData.designDoc as string;
      setVecDesignDoc(designDoc);
      logs.push('✓ 構造設計書を受信'); setVecLog([...logs]);

      // Step 1.5: Feasibility Layer（設計書をレビューして実現可能性判定）
      setVecProgress('実現可能性を判定中...');
      logs.push('▶ 設計書をレビューして実現可能性を判定中...'); setVecLog([...logs]);
      const feasData = await apiFetch('/api/creative-vector', {
        subject: vecSubject.trim(), style: vecStyle.trim(), step: 'feasibility',
        designDoc,
      });
      const feasibility = (feasData.feasibility as 'feasible' | 'risky' | 'infeasible') || 'feasible';
      const feasReason = (feasData.reason as string) || '';

      if (feasibility === 'infeasible') {
        logs.push(`✗ 現状の機能性能では実現できません${feasReason ? `（${feasReason}）` : ''}`); setVecLog([...logs]);
        setError(`現状の機能性能では実現できません${feasReason ? `（${feasReason}）` : ''}。主題やスタイルをよりシンプルに書き換えてください。`);
        setVecPhase('input');
        return;
      }

      if (feasibility === 'risky') {
        const ok = window.confirm(`⚠️ 設計書のレビュー結果、生成が重くタイムアウトする可能性があります${feasReason ? `\n\n理由: ${feasReason}` : ''}\n\nそれでも生成を続けますか？`);
        if (!ok) { setVecPhase('input'); return; }
        logs.push(`△ risky: ${feasReason}（ユーザー確認済み）`); setVecLog([...logs]);
      } else {
        logs.push('✓ 実現可能性OK'); setVecLog([...logs]);
      }

      // Step 2: Styling Layer（Claude Sonnet SVG生成）
      setVecProgress('Styling Layer: SVGコード生成中...');
      logs.push('▶ Styling Layer: SVGコードを生成中...'); setVecLog([...logs]);
      const styleData = await apiFetch('/api/creative-vector', {
        subject: vecSubject.trim(), style: vecStyle.trim(), step: 'styling', designDoc,
      });
      let currentSvg = styleData.svg as string;
      let currentErrors = (styleData.errors as string[]) || [];

      if (currentErrors.length > 0) {
        logs.push(`  △ ${currentErrors.length}件の問題を検出`);
        currentErrors.forEach(e => logs.push(`    - ${e}`));
        setVecLog([...logs]);
      } else {
        logs.push('✓ SVGコードを受信（エラーなし）'); setVecLog([...logs]);
      }

      // Step 2.5+2.6: Critique + Refine ループ（最大2ラウンド）
      const MAX_REFINE_ROUNDS = 2;
      for (let refineRound = 0; refineRound < MAX_REFINE_ROUNDS; refineRound++) {
        setVecProgress(`Critique Layer: 批評中... (${refineRound + 1}/${MAX_REFINE_ROUNDS})`);
        logs.push(`▶ Critique Layer: ラウンド ${refineRound + 1}/${MAX_REFINE_ROUNDS}...`);
        setVecLog([...logs]);

        let severity: 'ok' | 'minor' | 'major' = 'ok';
        let issues: string[] = [];
        try {
          const critiqueData = await apiFetch('/api/creative-vector', {
            subject: vecSubject.trim(), style: vecStyle.trim(), step: 'critique',
            designDoc, svg: currentSvg,
          });
          severity = (critiqueData.severity as 'ok' | 'minor' | 'major') || 'ok';
          issues = (critiqueData.issues as string[]) || [];
        } catch (critErr) {
          logs.push(`  ✗ 批評失敗: ${critErr instanceof Error ? critErr.message : 'エラー'}`);
          setVecLog([...logs]);
          break;
        }

        if (severity === 'ok' || issues.length === 0) {
          logs.push('✓ 批評: 問題なし'); setVecLog([...logs]);
          break;
        }

        logs.push(`  △ ${severity === 'major' ? '重大' : '軽微'}: ${issues.length}件の指摘`);
        issues.forEach(s => logs.push(`    - ${s}`));
        setVecLog([...logs]);

        setVecProgress(`Refine Layer: 精緻化中... (${refineRound + 1}/${MAX_REFINE_ROUNDS})`);
        logs.push(`▶ Refine Layer: 指摘に基づき修正中...`); setVecLog([...logs]);
        try {
          const refineData = await apiFetch('/api/creative-vector', {
            subject: vecSubject.trim(), style: vecStyle.trim(), step: 'refine',
            designDoc, svg: currentSvg, issues,
          });
          currentSvg = refineData.svg as string;
          currentErrors = (refineData.errors as string[]) || [];
          logs.push(`✓ 精緻化完了（ラウンド${refineRound + 1}）`); setVecLog([...logs]);
        } catch (refErr) {
          logs.push(`  ✗ 精緻化失敗: ${refErr instanceof Error ? refErr.message : 'エラー'}`);
          setVecLog([...logs]);
          break;
        }

        // minor かつ最終ラウンドじゃない場合は1回で打ち切り（major のみ2ラウンド許可）
        if (severity === 'minor') break;
      }

      // Step 3: Debug Layer（Haiku デバッグループ、最大5回）
      const MAX_DEBUG_ROUNDS = 5;
      for (let round = 0; round < MAX_DEBUG_ROUNDS; round++) {
        if (currentErrors.length === 0) break;

        setVecProgress(`Debug Layer: 修正中... (${round + 1}/${MAX_DEBUG_ROUNDS})`);
        logs.push(`▶ Debug Layer: ラウンド ${round + 1}/${MAX_DEBUG_ROUNDS}...`); setVecLog([...logs]);

        try {
          const debugData = await apiFetch('/api/creative-vector', {
            subject: vecSubject.trim(), style: vecStyle.trim(), step: 'debug',
            designDoc, svg: currentSvg,
          });

          if (debugData.fixed) {
            currentSvg = debugData.svg as string;
            currentErrors = (debugData.errors as string[]) || [];
            if (currentErrors.length === 0) {
              logs.push(`✓ 修正完了（ラウンド${round + 1}）`); setVecLog([...logs]);
            } else {
              logs.push(`  △ 残り${currentErrors.length}件`);
              currentErrors.forEach(e => logs.push(`    - ${e}`));
              setVecLog([...logs]);
            }
          } else {
            logs.push('✓ 問題なし'); setVecLog([...logs]);
            break;
          }
        } catch (dbgErr) {
          logs.push(`  ✗ デバッグ失敗: ${dbgErr instanceof Error ? dbgErr.message : 'エラー'}`);
          setVecLog([...logs]);
          break;
        }
      }

      setVecSvg(currentSvg);
      setVecPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
      setVecPhase('input');
    }
  }, [vecSubject, vecStyle, apiFetch]);

  // SVGダウンロード
  const handleExportSvg = useCallback(() => {
    if (!vecSvg) return;
    const blob = new Blob([vecSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `kokoro-vector-${new Date().toISOString().slice(0, 10)}.svg`;
    a.click(); URL.revokeObjectURL(url);
  }, [vecSvg]);

  // SVG → PNG変換エクスポート
  const handleExportVecPng = useCallback(() => {
    if (!vecSvg) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1600; canvas.height = 1600;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, 1600, 1600);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `kokoro-vector-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(vecSvg)));
  }, [vecSvg]);

  // Tunerへ渡す（SVGをHTMLとして渡す）
  const handleVecToTuner = useCallback(() => {
    if (!vecSvg) return;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Vector Art</title><style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f8f9fa}svg{max-width:100%;max-height:100vh}</style></head><body>${vecSvg}</body></html>`;
    localStorage.setItem('kokoro_world_input', JSON.stringify({
      strategyHtml: html, strategyText: `${vecSubject} / ${vecStyle}`,
      savedAt: new Date().toISOString(), source: 'creative-vector',
    }));
    router.push('/kokoro-tuner');
  }, [vecSvg, vecSubject, vecStyle, router]);

  const handleVecReset = useCallback(() => {
    setVecPhase('input'); setVecSvg(''); setVecDesignDoc('');
    setVecProgress(''); setVecLog([]); setVecShowCode(false); setError('');
    setVecEditHistory([]); setVecEditInstruction(''); setVecShowHistory(false);
  }, []);

  // === Vector Edit 関数 ===
  const handleVecEdit = useCallback(async () => {
    if (!vecEditInstruction.trim() || !vecSvg) return;
    setVecEditLoading(true); setError('');
    try {
      // 現在の状態を履歴に保存
      setVecEditHistory(prev => [...prev, { instruction: vecEditInstruction.trim(), svg: vecSvg }]);
      const data = await apiFetch('/api/creative-vector-edit', {
        svg: vecSvg, instruction: vecEditInstruction.trim(),
      });
      setVecSvg(data.svg as string);
      setVecEditInstruction('');
    } catch (e) {
      // 失敗時は履歴を戻す
      setVecEditHistory(prev => prev.slice(0, -1));
      setError(e instanceof Error ? e.message : '編集に失敗しました');
    } finally { setVecEditLoading(false); }
  }, [vecSvg, vecEditInstruction, apiFetch]);

  const handleVecEditUndo = useCallback(() => {
    if (vecEditHistory.length === 0) return;
    const last = vecEditHistory[vecEditHistory.length - 1];
    setVecSvg(last.svg);
    setVecEditHistory(prev => prev.slice(0, -1));
  }, [vecEditHistory]);

  const handleVecLoadSvg = useCallback((content: string) => {
    // SVG抽出
    const svgMatch = content.match(/<svg[\s\S]*<\/svg>/);
    let svg = svgMatch ? svgMatch[0].trim() : content.trim();
    if (!svg.includes('<svg')) { setError('有効なSVGが見つかりません'); return; }
    // width/height補完
    if (!svg.match(/\bwidth\s*=/)) svg = svg.replace('<svg', '<svg width="800" height="800"');
    if (!svg.includes('viewBox')) svg = svg.replace('<svg', '<svg viewBox="0 0 800 800"');
    setVecSvg(svg);
    setVecEditHistory([]); setVecEditInstruction(''); setError('');
    setVecPhase('editing');
  }, []);

  const handleVecFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => handleVecLoadSvg(reader.result as string);
      reader.readAsText(file);
    }
  }, [handleVecLoadSvg]);

  const handleVecFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => handleVecLoadSvg(reader.result as string);
      reader.readAsText(file);
    }
  }, [handleVecLoadSvg]);

  const handleVecPaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.includes('<svg')) handleVecLoadSvg(text);
      else setError('クリップボードにSVGが見つかりません');
    } catch { setError('クリップボードの読み取りに失敗しました'); }
  }, [handleVecLoadSvg]);

  // PNGエクスポート
  const handleExportProcPng = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `kokoro-creative-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  }, []);

  // リセット
  const handleGenReset = useCallback(() => {
    setGenPhase('input'); setGeneratedCode(''); setPreviewUrl(null); setError('');
    setShowCode(false); setCopied(false); setDesignDoc(''); setProgressMessage(''); setValidationLog([]);
  }, []);

  const handleProcReset = useCallback(() => {
    setProcPhase('upload'); setImageLoaded(false); setEffectChain([]);
    sourceCanvasRef.current = null; setError(''); setStyleInput('');
    setAdjustLog([]); setAdjustScore(null); setAutoAdjusting(false);
  }, []);

  // ========================
  // レンダリング
  // ========================
  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#374151', fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 300 }}>
      {/* ヘッダー */}
      <header style={{
        padding: '14px 28px', borderBottom: '1px solid #e5e7eb',
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 32, height: 32, border: '1px solid rgba(225,29,72,0.3)',
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(circle at 40% 40%,rgba(225,29,72,0.1) 0%,transparent 70%)',
            fontSize: 16,
          }}>🎨</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: accentColor }}>Creative</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>
              {mode === 'generate' ? '感性からビジュアルを生成する' : mode === 'process' ? '画像にエフェクトを適用する' : vecPhase === 'editing' ? 'SVGを自然言語で編集する' : 'インテントからベクターを生成する'}
            </span>
          </div>
        </div>
        <button onClick={() => router.push('/')} style={{
          ...mono, fontSize: 9, letterSpacing: '0.12em', color: '#9ca3af',
          background: 'transparent', border: '1px solid #e5e7eb', padding: '5px 14px', borderRadius: 3, cursor: 'pointer',
        }}>← Home</button>
      </header>

      <div style={{ maxWidth: mode === 'process' && procPhase === 'editing' ? 1200 : 700, margin: '0 auto', padding: '32px 28px 100px' }}>
        {/* モード切替タブ */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 32, borderBottom: '2px solid #e5e7eb' }}>
          {([['generate', 'Generate'], ['process', 'Process'], ['vector', 'Vector']] as [Mode, string][]).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} style={{
              ...mono, fontSize: 11, letterSpacing: '0.14em', padding: '10px 24px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: mode === m ? accentColor : '#9ca3af',
              borderBottom: mode === m ? `2px solid ${accentColor}` : '2px solid transparent',
              marginBottom: -2, fontWeight: mode === m ? 700 : 400,
              transition: 'all 0.2s',
            }}>{label}</button>
          ))}
        </div>

        {/* 感性マップ表示 */}
        {hasAestheticMap && (
          <div style={{
            ...mono, fontSize: 9, letterSpacing: '0.1em', color: '#059669',
            background: '#f0fdf4', border: '1px solid #bbf7d0',
            padding: '8px 14px', borderRadius: 4, marginBottom: 20,
          }}>
            ✓ 感性マップを検出 — {mode === 'vector' ? 'ベクター生成' : mode === 'generate' ? '生成' : 'AI提案'}に反映されます
          </div>
        )}

        {/* ============================================ */}
        {/* Generate モード */}
        {/* ============================================ */}
        {mode === 'generate' && (
          <>
            {genPhase === 'input' && (
              <div>
                <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: accentColor, textTransform: 'uppercase', marginBottom: 16 }}>
                  // 作りたいビジュアルを伝えてください
                </div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ ...mono, fontSize: 9, letterSpacing: '0.12em', color: '#9ca3af', marginBottom: 10 }}>PRESETS</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {GEN_PRESETS.map(p => (
                      <button key={p.label} onClick={() => setSpec(p.prompt)} style={{
                        fontSize: 11, color: spec === p.prompt ? '#fff' : '#6b7280',
                        background: spec === p.prompt ? accentColor : '#f3f4f6',
                        border: 'none', padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                        fontFamily: "'Noto Sans JP', sans-serif",
                      }}>{p.label}</button>
                    ))}
                  </div>
                </div>
                <textarea value={spec} onChange={e => setSpec(e.target.value)}
                  placeholder="例: 夜空に浮かぶ粒子が音楽のように脈動するジェネラティブアート。"
                  style={{ width: '100%', minHeight: 160, resize: 'vertical', fontFamily: "'Noto Sans JP', sans-serif", fontSize: 13, lineHeight: 1.8, background: '#f8f9fa', border: '1px solid #d1d5db', borderRadius: 6, padding: 16, outline: 'none', color: '#374151' }}
                />
                <button onClick={handleGenerate} disabled={!spec.trim()} style={{
                  ...mono, fontSize: 11, letterSpacing: '0.16em', background: accentColor, border: 'none', color: '#fff',
                  padding: '14px 32px', borderRadius: 4, cursor: spec.trim() ? 'pointer' : 'not-allowed',
                  marginTop: 24, opacity: spec.trim() ? 1 : 0.5, display: 'block', width: '100%',
                }}>Generate</button>
              </div>
            )}

            {genPhase === 'generating' && (
              <div style={{ textAlign: 'center', paddingTop: 60 }}>
                <div style={{ ...mono, fontSize: 11, letterSpacing: '0.16em', color: accentColor }}>// {progressMessage || '生成中...'}</div>
                <PersonaLoading />
                {validationLog.length > 0 && (
                  <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: 14, marginTop: 24, maxHeight: 200, overflowY: 'auto', textAlign: 'left' }}>
                    {validationLog.map((log, i) => (
                      <div key={i} style={{ ...mono, fontSize: 10, lineHeight: 1.8, color: log.startsWith('✓') ? '#4ade80' : log.startsWith('✗') || log.startsWith('△') ? '#f87171' : log.startsWith('▶') ? '#60a5fa' : '#9ca3af' }}>{log}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {genPhase === 'done' && generatedCode && (
              <div>
                <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: '#059669', textTransform: 'uppercase', marginBottom: 16 }}>// 生成完了</div>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'auto', marginBottom: 20, background: '#000', resize: 'vertical', minHeight: 400 }}>
                  <iframe ref={iframeRef} srcDoc={previewUrl || undefined} scrolling="yes" style={{ width: '100%', height: 600, border: 'none', display: 'block' }} sandbox="allow-scripts allow-same-origin allow-downloads" title="Preview" />
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={() => { if (!generatedCode) return; const b = new Blob([generatedCode], { type: 'text/html' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `kokoro-creative-${new Date().toISOString().slice(0,10)}.html`; a.click(); URL.revokeObjectURL(u); }} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: accentColor, border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>Download HTML</button>
                  <button onClick={() => { if (!generatedCode) return; localStorage.setItem('kokoro_world_input', JSON.stringify({ strategyHtml: generatedCode, strategyText: spec, savedAt: new Date().toISOString(), source: 'creative' })); router.push('/kokoro-tuner'); }} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #f59e0b', color: '#f59e0b', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>Tuner →</button>
                  <button onClick={() => setShowCode(p => !p)} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>{showCode ? 'コードを隠す' : 'コードを見る'}</button>
                  <button onClick={handleGenReset} style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280', padding: '10px 20px', borderRadius: 4, cursor: 'pointer' }}>もう一度</button>
                </div>
                {designDoc && (
                  <details style={{ marginTop: 20 }}>
                    <summary style={{ ...mono, fontSize: 10, color: '#3b82f6', cursor: 'pointer', padding: '8px 0' }}>設計書を見る</summary>
                    <div style={{ background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, maxHeight: 300, overflowY: 'auto', marginTop: 8 }}>
                      <pre style={{ fontSize: 12, lineHeight: 1.8, color: '#374151', fontFamily: "'Noto Sans JP', sans-serif", whiteSpace: 'pre-wrap', margin: 0 }}>{designDoc}</pre>
                    </div>
                  </details>
                )}
                {showCode && (
                  <div style={{ marginTop: 20, position: 'relative' }}>
                    <button onClick={async () => { try { await navigator.clipboard.writeText(generatedCode); } catch { /* fallback */ } setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ ...mono, fontSize: 9, position: 'absolute', top: 10, right: 10, zIndex: 10, background: copied ? '#059669' : 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '5px 12px', borderRadius: 3, cursor: 'pointer' }}>{copied ? '✓ Copied' : 'Copy'}</button>
                    <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: 20, maxHeight: 400, overflowY: 'auto' }}>
                      <pre style={{ fontSize: 11, lineHeight: 1.6, color: '#d4d4d4', fontFamily: "'Space Mono', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>{generatedCode}</pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ============================================ */}
        {/* Process モード */}
        {/* ============================================ */}
        {mode === 'process' && (
          <>
            {procPhase === 'upload' && (
              <div>
                <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: accentColor, textTransform: 'uppercase', marginBottom: 16 }}>
                  // 画像をアップロードしてください
                </div>
                <div
                  onDragOver={e => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: '2px dashed #d1d5db', borderRadius: 12, padding: '60px 20px',
                    textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s',
                    background: '#fafafa',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = accentColor)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#d1d5db')}
                >
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📷</div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
                    クリックまたはドラッグ&ドロップ
                  </div>
                  <div style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>
                    JPG, PNG, WebP（最大1200px にリサイズ）
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
                />
              </div>
            )}

            {procPhase === 'editing' && imageLoaded && (
              <div className="creative-process-split" style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 420px',
                gap: 20,
                alignItems: 'start',
              }}>
                {/* 左: プレビュー（sticky） */}
                <div style={{ position: 'sticky', top: 80, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ ...mono, fontSize: 9, letterSpacing: '0.12em', color: '#9ca3af' }}>PREVIEW</div>
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', background: '#1a1a1a', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 8, minHeight: 400 }}>
                    <canvas
                      ref={previewCanvasRef}
                      style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 200px)', display: 'block' }}
                    />
                  </div>
                  <div style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>
                    {imgSize.w} × {imgSize.h}px — {effectChain.filter(e => e.enabled).length} effects active
                  </div>
                </div>

                {/* 右: コントロール */}
                <div style={{ minWidth: 0 }}>
                {/* スタイルプリセット */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ ...mono, fontSize: 9, letterSpacing: '0.12em', color: '#9ca3af', marginBottom: 10 }}>STYLE PRESETS</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.entries(STYLE_PRESETS).map(([key, preset]) => (
                      <button key={key} onClick={() => applyPreset(key)} title={preset.desc} style={{
                        fontSize: 11, color: '#6b7280', background: '#f3f4f6',
                        border: 'none', padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                        fontFamily: "'Noto Sans JP', sans-serif",
                      }}>{preset.label}</button>
                    ))}
                  </div>
                </div>

                {/* AI スタイル提案 */}
                <div style={{ marginBottom: 24, display: 'flex', gap: 8 }}>
                  <input
                    value={styleInput}
                    onChange={e => setStyleInput(e.target.value)}
                    placeholder="スタイルを自由に指定（例: 大友克洋風、水彩画風、80年代ポップ）"
                    onKeyDown={e => { if (e.key === 'Enter' && !aiLoading) handleAiSuggest(); }}
                    style={{
                      flex: 1, fontSize: 13, padding: '10px 14px', border: '1px solid #d1d5db',
                      borderRadius: 6, outline: 'none', fontFamily: "'Noto Sans JP', sans-serif", color: '#374151',
                    }}
                  />
                  <button onClick={handleAiSuggest} disabled={!styleInput.trim() || aiLoading} style={{
                    ...mono, fontSize: 10, letterSpacing: '0.12em',
                    background: aiLoading ? '#9ca3af' : accentColor,
                    border: 'none', color: '#fff', padding: '10px 16px', borderRadius: 6,
                    cursor: styleInput.trim() && !aiLoading ? 'pointer' : 'not-allowed',
                    whiteSpace: 'nowrap',
                  }}>{aiLoading ? '...' : 'AI提案'}</button>
                </div>

                {/* エフェクトチェーン */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ ...mono, fontSize: 9, letterSpacing: '0.12em', color: '#9ca3af', marginBottom: 10 }}>EFFECT CHAIN</div>
                  {effectChain.length === 0 && (
                    <div style={{ fontSize: 12, color: '#9ca3af', padding: '16px 0' }}>
                      プリセットを選択するか、AI提案を使うか、下のボタンでエフェクトを追加してください
                    </div>
                  )}
                  {effectChain.map(effect => (
                    <div key={effect.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      background: effect.enabled ? '#fafafa' : '#f3f4f6',
                      border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 6,
                      opacity: effect.enabled ? 1 : 0.5,
                    }}>
                      <input type="checkbox" checked={effect.enabled} onChange={e => updateEffect(effect.id, { enabled: e.target.checked })} />
                      <span style={{ fontSize: 12, fontWeight: 500, minWidth: 100, color: '#374151' }}>{effect.label}</span>
                      <input type="range" min={0} max={100} value={effect.intensity}
                        onChange={e => updateEffect(effect.id, { intensity: parseInt(e.target.value) })}
                        style={{ flex: 1, accentColor }}
                      />
                      <span style={{ ...mono, fontSize: 10, color: '#6b7280', minWidth: 30, textAlign: 'right' }}>{effect.intensity}</span>
                      <button onClick={() => removeEffect(effect.id)} style={{
                        background: 'transparent', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: 16, padding: '0 4px',
                      }}>×</button>
                    </div>
                  ))}
                </div>

                {/* エフェクト追加 */}
                <details style={{ marginBottom: 24 }}>
                  <summary style={{ ...mono, fontSize: 10, letterSpacing: '0.1em', color: '#6b7280', cursor: 'pointer', padding: '8px 0' }}>
                    + エフェクトを追加
                  </summary>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {ALL_EFFECTS.map(e => (
                      <button key={e.type} onClick={() => addEffect(e.type)} title={e.desc} style={{
                        fontSize: 10, color: '#6b7280', background: '#f8f9fa', border: '1px solid #e5e7eb',
                        padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                        fontFamily: "'Noto Sans JP', sans-serif",
                      }}>{e.label}</button>
                    ))}
                  </div>
                </details>

                {/* AI自律調整 */}
                <div style={{ marginBottom: 20, padding: '16px', background: '#fdf2f8', border: '1px solid #fce7f3', borderRadius: 8 }}>
                  <div style={{ ...mono, fontSize: 9, letterSpacing: '0.12em', color: accentColor, marginBottom: 10 }}>
                    AI AUTO-ADJUST — 感性マップと照合して自動調整
                  </div>
                  <button onClick={handleAutoAdjust} disabled={autoAdjusting || effectChain.length === 0} style={{
                    ...mono, fontSize: 11, letterSpacing: '0.14em',
                    background: autoAdjusting ? '#9ca3af' : accentColor,
                    border: 'none', color: '#fff', padding: '10px 24px', borderRadius: 4,
                    cursor: autoAdjusting || effectChain.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: effectChain.length === 0 ? 0.5 : 1,
                  }}>
                    {autoAdjusting ? '調整中...' : '自律調整を実行'}
                  </button>
                  {effectChain.length === 0 && (
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                      まずプリセットやAI提案でエフェクトを追加してください
                    </div>
                  )}

                  {/* 調整ログ */}
                  {adjustLog.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      {adjustLog.map((log, i) => (
                        <div key={i} style={{ padding: '8px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ ...mono, fontSize: 9, color: accentColor }}>Round {log.round}</span>
                            <span style={{
                              ...mono, fontSize: 10, fontWeight: 700,
                              color: log.score >= 80 ? '#059669' : log.score >= 50 ? '#f59e0b' : '#ef4444',
                            }}>Score: {log.score}</span>
                          </div>
                          <div style={{ fontSize: 11, color: '#374151', marginBottom: 2 }}>{log.evaluation}</div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>{log.adjustments}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* スコアバッジ */}
                  {adjustScore !== null && !autoAdjusting && (
                    <div style={{
                      display: 'inline-block', marginTop: 8, padding: '4px 12px', borderRadius: 20,
                      ...mono, fontSize: 10, fontWeight: 700,
                      background: adjustScore >= 80 ? '#d1fae5' : adjustScore >= 50 ? '#fef3c7' : '#fee2e2',
                      color: adjustScore >= 80 ? '#059669' : adjustScore >= 50 ? '#d97706' : '#dc2626',
                    }}>
                      感性マッチ: {adjustScore}/100
                    </div>
                  )}
                </div>

                {/* アクションボタン */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={handleExportProcPng} style={{
                    ...mono, fontSize: 10, letterSpacing: '0.12em', background: accentColor, border: 'none', color: '#fff',
                    padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                  }}>Export PNG</button>
                  <button onClick={() => { setEffectChain([]); setAdjustLog([]); setAdjustScore(null); }} style={{
                    ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
                    padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                  }}>エフェクトをリセット</button>
                  <button onClick={handleProcReset} style={{
                    ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
                    padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                  }}>別の画像を読み込む</button>
                </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ============================================ */}
        {/* Vector モード */}
        {/* ============================================ */}
        {mode === 'vector' && (
          <>
            {vecPhase === 'input' && (
              <div>
                <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: accentColor, textTransform: 'uppercase', marginBottom: 16 }}>
                  // インテント → ベクターマッピング
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.8, marginBottom: 20, padding: '12px 16px', background: '#fdf2f8', borderRadius: 8, border: '1px solid #fce7f3' }}>
                  主題とスタイルを分けて入力してください。<br/>
                  AIが構造設計 → SVG生成 → 自律デバッグ（最大5回）を実行します。
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ ...mono, fontSize: 9, letterSpacing: '0.12em', color: '#9ca3af', display: 'block', marginBottom: 6 }}>SUBJECT（主題）</label>
                  <input
                    value={vecSubject} onChange={e => setVecSubject(e.target.value)}
                    placeholder="例: カーネル・サンダース（ケンタッキーおじさん）"
                    style={{ width: '100%', fontSize: 13, padding: '12px 14px', border: '1px solid #d1d5db', borderRadius: 6, outline: 'none', fontFamily: "'Noto Sans JP', sans-serif", color: '#374151' }}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ ...mono, fontSize: 9, letterSpacing: '0.12em', color: '#9ca3af', display: 'block', marginBottom: 6 }}>STYLE（作風・質感）</label>
                  <input
                    value={vecStyle} onChange={e => setVecStyle(e.target.value)}
                    placeholder="例: 大友克洋風（緻密な線画、メカニカルなディテール、ハッチング影）"
                    style={{ width: '100%', fontSize: 13, padding: '12px 14px', border: '1px solid #d1d5db', borderRadius: 6, outline: 'none', fontFamily: "'Noto Sans JP', sans-serif", color: '#374151' }}
                  />
                </div>

                {/* スタイルプリセット */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ ...mono, fontSize: 9, letterSpacing: '0.12em', color: '#9ca3af', marginBottom: 8 }}>STYLE PRESETS</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      { label: '大友克洋風', val: '大友克洋風（緻密な線画、メカニカルなディテール、ハッチング影、情報密度が高い）' },
                      { label: '浮世絵風', val: '浮世絵風（太い輪郭線、平面的な塗り、限定色パレット、波・雲のパターン）' },
                      { label: 'ミニマル', val: 'ミニマルモダン（最小限の線、幾何学的な単純化、余白を活かす、モノトーン）' },
                      { label: 'コミック', val: 'アメコミ風（太いアウトライン、ハーフトーン、鮮やかな原色、ポップ）' },
                      { label: '設計図風', val: '設計図・ブループリント風（細い線、寸法線、注釈テキスト、グリッド背景、青白配色）' },
                    ].map(p => (
                      <button key={p.label} onClick={() => setVecStyle(p.val)} style={{
                        fontSize: 11, color: vecStyle === p.val ? '#fff' : '#6b7280',
                        background: vecStyle === p.val ? accentColor : '#f3f4f6',
                        border: 'none', padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                        fontFamily: "'Noto Sans JP', sans-serif",
                      }}>{p.label}</button>
                    ))}
                  </div>
                </div>

                <button onClick={handleVectorGenerate} disabled={!vecSubject.trim()} style={{
                  ...mono, fontSize: 11, letterSpacing: '0.16em', background: accentColor, border: 'none', color: '#fff',
                  padding: '14px 32px', borderRadius: 4, cursor: vecSubject.trim() ? 'pointer' : 'not-allowed',
                  marginTop: 8, opacity: vecSubject.trim() ? 1 : 0.5, display: 'block', width: '100%',
                }}>Generate Vector</button>

                {/* SVG読み込み（Edit モード直行） */}
                <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid #e5e7eb' }}>
                  <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: '#6b7280', textTransform: 'uppercase', marginBottom: 12 }}>
                    // 既存のSVGを読み込んで編集する
                  </div>
                  <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={handleVecFileDrop}
                    onClick={() => vecFileInputRef.current?.click()}
                    style={{
                      border: '2px dashed #d1d5db', borderRadius: 12, padding: '32px 20px',
                      textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s', background: '#fafafa',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = accentColor)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#d1d5db')}
                  >
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📐</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>SVGファイルをドロップまたはクリック</div>
                    <div style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>SVG ファイル</div>
                  </div>
                  <input ref={vecFileInputRef} type="file" accept=".svg,image/svg+xml" style={{ display: 'none' }} onChange={handleVecFileSelect} />
                  <button onClick={handleVecPaste} style={{
                    ...mono, fontSize: 10, letterSpacing: '0.1em', background: '#fff', border: '1px solid #d1d5db',
                    color: '#6b7280', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', marginTop: 10, width: '100%',
                  }}>📋 クリップボードからSVGを貼り付け</button>
                </div>
              </div>
            )}

            {vecPhase === 'generating' && (
              <div style={{ textAlign: 'center', paddingTop: 60 }}>
                <div style={{ ...mono, fontSize: 11, letterSpacing: '0.16em', color: accentColor }}>// {vecProgress || '生成中...'}</div>
                <PersonaLoading />
                <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginTop: 8 }}>
                  Logic → Styling → Debug の3レイヤーで構築中
                </div>
                {vecLog.length > 0 && (
                  <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: 14, marginTop: 24, maxHeight: 250, overflowY: 'auto', textAlign: 'left' }}>
                    {vecLog.map((log, i) => (
                      <div key={i} style={{ ...mono, fontSize: 10, lineHeight: 1.8, color: log.startsWith('✓') ? '#4ade80' : log.startsWith('✗') ? '#f87171' : log.startsWith('▶') ? '#60a5fa' : log.startsWith('  △') ? '#fbbf24' : '#9ca3af' }}>{log}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {vecPhase === 'done' && vecSvg && (
              <div>
                <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: '#059669', textTransform: 'uppercase', marginBottom: 16 }}>// ベクター生成完了</div>

                {/* SVGプレビュー（iframe方式で確実に表示） */}
                <div style={{
                  border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 20,
                  background: '#f8f9fa', minHeight: 400,
                }}>
                  <iframe
                    srcDoc={`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f8f9fa}svg{max-width:100%;max-height:100vh;width:auto;height:auto}</style></head><body>${vecSvg}</body></html>`}
                    style={{ width: '100%', height: 600, border: 'none', display: 'block' }}
                    sandbox="allow-scripts"
                    title="Vector Preview"
                  />
                </div>

                {/* アクションボタン */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={handleExportSvg} style={{
                    ...mono, fontSize: 10, letterSpacing: '0.12em', background: accentColor, border: 'none', color: '#fff',
                    padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                  }}>Export SVG</button>
                  <button onClick={handleExportVecPng} style={{
                    ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: `1px solid ${accentColor}`, color: accentColor,
                    padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                  }}>Export PNG</button>
                  <button onClick={handleVecToTuner} style={{
                    ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #f59e0b', color: '#f59e0b',
                    padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                  }}>Tuner →</button>
                  <button onClick={() => { setVecPhase('editing'); setVecEditHistory([]); setVecEditInstruction(''); setVecShowCode(false); }} style={{
                    ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: `1px solid ${accentColor}`, color: accentColor,
                    padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                  }}>Edit →</button>
                  <button onClick={() => setVecShowCode(p => !p)} style={{
                    ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
                    padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                  }}>{vecShowCode ? 'コードを隠す' : 'SVGコードを見る'}</button>
                  <button onClick={handleVecReset} style={{
                    ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
                    padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                  }}>もう一度</button>
                </div>

                {/* ビルドログ */}
                {vecLog.length > 0 && (
                  <details style={{ marginTop: 20 }} open>
                    <summary style={{ ...mono, fontSize: 10, color: '#60a5fa', cursor: 'pointer', padding: '8px 0' }}>ビルドログ</summary>
                    <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: 14, maxHeight: 200, overflowY: 'auto', marginTop: 8 }}>
                      {vecLog.map((log, i) => (
                        <div key={i} style={{ ...mono, fontSize: 10, lineHeight: 1.8, color: log.startsWith('✓') ? '#4ade80' : log.startsWith('✗') ? '#f87171' : log.startsWith('▶') ? '#60a5fa' : log.startsWith('  △') ? '#fbbf24' : '#9ca3af' }}>{log}</div>
                      ))}
                    </div>
                  </details>
                )}

                {/* 設計書 */}
                {vecDesignDoc && (
                  <details style={{ marginTop: 20 }}>
                    <summary style={{ ...mono, fontSize: 10, color: '#3b82f6', cursor: 'pointer', padding: '8px 0' }}>Logic Layer 設計書を見る</summary>
                    <div style={{ background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, maxHeight: 300, overflowY: 'auto', marginTop: 8 }}>
                      <pre style={{ fontSize: 12, lineHeight: 1.8, color: '#374151', fontFamily: "'Noto Sans JP', sans-serif", whiteSpace: 'pre-wrap', margin: 0 }}>{vecDesignDoc}</pre>
                    </div>
                  </details>
                )}

                {/* SVGコード */}
                {vecShowCode && (
                  <div style={{ marginTop: 20, position: 'relative' }}>
                    <button onClick={async () => { try { await navigator.clipboard.writeText(vecSvg); } catch { /* */ } }} style={{ ...mono, fontSize: 9, position: 'absolute', top: 10, right: 10, zIndex: 10, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '5px 12px', borderRadius: 3, cursor: 'pointer' }}>Copy</button>
                    <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: 20, maxHeight: 400, overflowY: 'auto' }}>
                      <pre style={{ fontSize: 10, lineHeight: 1.5, color: '#d4d4d4', fontFamily: "'Space Mono', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>{vecSvg}</pre>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ============================================ */}
            {/* Vector Edit モード */}
            {/* ============================================ */}
            {vecPhase === 'editing' && vecSvg && (
              <div>
                <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: accentColor, textTransform: 'uppercase', marginBottom: 16 }}>
                  // SVG Edit — 自然言語で修正指示
                </div>

                {/* SVGプレビュー */}
                <div style={{
                  border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 20,
                  background: '#f8f9fa', minHeight: 350,
                }}>
                  <iframe
                    srcDoc={`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f8f9fa}svg{max-width:100%;max-height:100vh;width:auto;height:auto}</style></head><body>${vecSvg}</body></html>`}
                    style={{ width: '100%', height: 500, border: 'none', display: 'block' }}
                    sandbox="allow-scripts"
                    title="SVG Edit Preview"
                  />
                </div>

                {/* 編集指示入力 */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ ...mono, fontSize: 9, letterSpacing: '0.12em', color: '#9ca3af', display: 'block', marginBottom: 8 }}>
                    EDIT INSTRUCTION
                  </label>
                  <textarea
                    value={vecEditInstruction}
                    onChange={e => setVecEditInstruction(e.target.value)}
                    placeholder="例: 背景色を暖色系にして / 目をもっと大きくして / ハッチングの密度を上げて / 全体のカラーパレットをサイバーパンク風にして"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !vecEditLoading) {
                        e.preventDefault(); handleVecEdit();
                      }
                    }}
                    style={{
                      width: '100%', minHeight: 80, resize: 'vertical',
                      fontFamily: "'Noto Sans JP', sans-serif", fontSize: 13, lineHeight: 1.8,
                      background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, padding: 14,
                      outline: 'none', color: '#374151',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <button onClick={handleVecEdit} disabled={!vecEditInstruction.trim() || vecEditLoading} style={{
                      ...mono, fontSize: 11, letterSpacing: '0.14em', flex: 1,
                      background: vecEditLoading ? '#9ca3af' : accentColor,
                      border: 'none', color: '#fff', padding: '12px 24px', borderRadius: 4,
                      cursor: vecEditInstruction.trim() && !vecEditLoading ? 'pointer' : 'not-allowed',
                      opacity: vecEditInstruction.trim() ? 1 : 0.5,
                    }}>
                      {vecEditLoading ? '修正中...' : 'Apply Edit'}
                    </button>
                    <button onClick={handleVecEditUndo} disabled={vecEditHistory.length === 0 || vecEditLoading} style={{
                      ...mono, fontSize: 10, letterSpacing: '0.1em',
                      background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
                      padding: '12px 16px', borderRadius: 4,
                      cursor: vecEditHistory.length > 0 && !vecEditLoading ? 'pointer' : 'not-allowed',
                      opacity: vecEditHistory.length > 0 ? 1 : 0.4,
                    }}>↩ Undo</button>
                  </div>
                  <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginTop: 6 }}>
                    ⌘/Ctrl + Enter で実行 ・ 編集 {vecEditHistory.length} 回
                  </div>
                </div>

                {/* 編集履歴 */}
                {vecEditHistory.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <button onClick={() => setVecShowHistory(p => !p)} style={{
                      ...mono, fontSize: 10, letterSpacing: '0.1em', color: '#60a5fa',
                      background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0',
                    }}>
                      {vecShowHistory ? '▼' : '▶'} 編集履歴（{vecEditHistory.length}件）
                    </button>
                    {vecShowHistory && (
                      <div style={{ marginTop: 8, background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                        {vecEditHistory.map((entry, i) => (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '6px 0', borderBottom: i < vecEditHistory.length - 1 ? '1px solid #e5e7eb' : 'none',
                          }}>
                            <span style={{ ...mono, fontSize: 9, color: '#9ca3af', minWidth: 20 }}>#{i + 1}</span>
                            <span style={{ fontSize: 12, color: '#374151', flex: 1 }}>{entry.instruction}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* アクションボタン */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={handleExportSvg} style={{
                    ...mono, fontSize: 10, letterSpacing: '0.12em', background: accentColor, border: 'none', color: '#fff',
                    padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                  }}>Export SVG</button>
                  <button onClick={handleExportVecPng} style={{
                    ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: `1px solid ${accentColor}`, color: accentColor,
                    padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                  }}>Export PNG</button>
                  <button onClick={handleVecToTuner} style={{
                    ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #f59e0b', color: '#f59e0b',
                    padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                  }}>Tuner →</button>
                  <button onClick={() => setVecShowCode(p => !p)} style={{
                    ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
                    padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                  }}>{vecShowCode ? 'コードを隠す' : 'SVGコードを見る'}</button>
                  <button onClick={handleVecReset} style={{
                    ...mono, fontSize: 10, letterSpacing: '0.12em', background: '#fff', border: '1px solid #d1d5db', color: '#6b7280',
                    padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
                  }}>新規作成に戻る</button>
                </div>

                {/* SVGコード */}
                {vecShowCode && (
                  <div style={{ marginTop: 20, position: 'relative' }}>
                    <button onClick={async () => { try { await navigator.clipboard.writeText(vecSvg); } catch { /* */ } }} style={{ ...mono, fontSize: 9, position: 'absolute', top: 10, right: 10, zIndex: 10, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '5px 12px', borderRadius: 3, cursor: 'pointer' }}>Copy</button>
                    <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: 20, maxHeight: 400, overflowY: 'auto' }}>
                      <pre style={{ fontSize: 10, lineHeight: 1.5, color: '#d4d4d4', fontFamily: "'Space Mono', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>{vecSvg}</pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* エラー表示 */}
        {error && (
          <div style={{ marginTop: 16 }}>
            <div style={{ ...mono, fontSize: 10, color: '#ef4444', lineHeight: 1.6, marginBottom: 12 }}>// エラー: {error}</div>
          </div>
        )}
      </div>

      {/* ランタイムテスト用 非表示iframe */}
      <iframe ref={testIframeRef} style={{ position: 'fixed', left: -9999, top: -9999, width: 375, height: 667 }} sandbox="allow-scripts allow-same-origin" title="Runtime Test" />

      <style>{`
        @media (max-width: 900px) {
          .creative-process-split {
            grid-template-columns: 1fr !important;
          }
          .creative-process-split > div:first-child {
            position: static !important;
          }
        }
      `}</style>
    </div>
  );
}
