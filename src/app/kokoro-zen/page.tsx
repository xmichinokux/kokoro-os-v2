'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { consumeNoteForZen, buildZenPromptFromNoteData } from '@/lib/kokoro/noteLinkage';
import { saveToNote } from '@/lib/saveToNote';
import { createRecipeInputFromZen, setRecipeInput } from '@/lib/kokoro/recipeInput';

type PersonaResult = { id: string; name: string; text: string };
type Core = {
  main_story: string;
  emotional_heat: number;
  tensions: string[];
  needs: string[];
  key_question: string;
};
type ZenResult = {
  core: Core;
  personas: PersonaResult[];
  emiMain: string;
  emiQuestion: string;
  zenLevel: 'soft' | 'insight' | 'deep';
};
type DeepResult = { emiMain: string; emiQuestion: string };

const PERSONA_COLORS: Record<string, string> = {
  norm:'#d97706', shin:'#2563eb', canon:'#7c3aed', digg:'#059669',
};

export default function KokoroZen() {
  const router = useRouter();
  const [sourceText, setSourceText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadStep, setLoadStep] = useState(0);
  const [result, setResult] = useState<ZenResult | null>(null);
  const [error, setError] = useState('');
  const [personasOpen, setPersonasOpen] = useState(false);
  const [coreOpen, setCoreOpen] = useState(false);
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepData, setDeepData] = useState<DeepResult | null>(null);
  const [deepOpen, setDeepOpen] = useState(false);
  const [noInput, setNoInput] = useState(false);
  const [zenNoteSaved, setZenNoteSaved] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const runZenAnalysis = useCallback(async (text: string) => {
    if (!text.trim()) return;

    setError('');
    setResult(null);
    setDeepData(null);
    setDeepOpen(false);
    setPersonasOpen(false);
    setCoreOpen(false);
    setZenNoteSaved(false);
    setIsLoading(true);
    setLoadStep(1);

    try {
      const res = await fetch('/api/kokoro-zen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      setLoadStep(2);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLoadStep(3);
      await new Promise(r => setTimeout(r, 300));
      setResult(data);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior:'smooth', block:'start' }), 200);
    } catch (e) {
      setError(e instanceof Error ? e.message : '不明なエラー');
    } finally {
      setIsLoading(false);
      setLoadStep(0);
    }
  }, []);

  // Talk→Zen / Note→Zen 自動分析
  const autoRunRef = useRef(false);
  useEffect(() => {
    if (autoRunRef.current) return;
    autoRunRef.current = true;

    // 1) sessionStorage: Talk→Zen
    const raw = sessionStorage.getItem('zenFromTalk');
    if (raw) {
      sessionStorage.removeItem('zenFromTalk');
      try {
        const { userInput } = JSON.parse(raw);
        if (userInput) {
          setSourceText(userInput);
          setTimeout(() => runZenAnalysis(userInput), 100);
          return;
        }
      } catch {
        // fallback: rawがJSON以外（旧形式）
        setSourceText(raw);
        setTimeout(() => runZenAnalysis(raw), 100);
        return;
      }
    }

    // 2) localStorage: Note→Zen
    const noteData = consumeNoteForZen();
    if (noteData) {
      const prompt = buildZenPromptFromNoteData(noteData);
      setSourceText(prompt);
      setTimeout(() => runZenAnalysis(prompt), 100);
      return;
    }

    setNoInput(true);
  }, [runZenAnalysis]);

  const formatEmi = (text: string) =>
    text.split(/(?<=。)/).map(s => s.trim()).filter(s => s).map((s, i) => (
      <p key={i} style={{ margin:'0 0 1.1em 0' }}>{s}</p>
    ));

  const loadDeepEmi = async () => {
    if (deepData) { setDeepOpen(v => !v); return; }
    setDeepLoading(true);
    setDeepOpen(true);
    try {
      const res = await fetch('/api/kokoro-zen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: sourceText, mode: 'deep_emi' }),
      });
      const data = await res.json();
      setDeepData({ emiMain: data.emiMain, emiQuestion: data.emiQuestion });
    } catch (e) {
      setDeepData({ emiMain: `エラー: ${e instanceof Error ? e.message : ''}`, emiQuestion: '' });
    } finally {
      setDeepLoading(false);
    }
  };

  const handleSaveZenNote = () => {
    if (!result || zenNoteSaved) return;
    const parts: string[] = [];
    parts.push(`[中心の物語]\n${result.core.main_story}`);
    if (result.core.tensions?.length) {
      parts.push(`[緊張]\n${result.core.tensions.map(t => '・' + t).join('\n')}`);
    }
    if (result.core.needs?.length) {
      parts.push(`[必要としているもの]\n${result.core.needs.map(n => '・' + n).join('\n')}`);
    }
    if (result.core.key_question) {
      parts.push(`[核となる問い]\n${result.core.key_question}`);
    }
    if (result.personas?.length) {
      parts.push(
        '[4つの視点]\n' +
          result.personas.map(p => `【${p.name}】\n${p.text}`).join('\n\n')
      );
    }
    if (result.emiMain) {
      parts.push(`[エミの返答]\n${result.emiMain}`);
    }
    if (result.emiQuestion) {
      parts.push(`[エミの問い]\n${result.emiQuestion}`);
    }
    const body = parts.join('\n\n');
    saveToNote(body, 'Zen');
    setZenNoteSaved(true);
  };

  const stepLabels = [
    '// 状況の輪郭を読み取っています',
    '// 4つの視点で言語化しています',
    '// 統合しています',
  ];

  return (
    <div style={{ minHeight:'100vh', background:'#fff', color:'#1a1a1a', fontFamily:"'Noto Sans JP', sans-serif", fontWeight:300 }}>

      {/* ヘッダー */}
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', borderBottom:'1px solid #e5e7eb', position:'sticky', top:0, background:'#fff', zIndex:10 }}>
        <div>
          <span style={{ fontFamily:"'Space Mono', monospace", fontSize:13, fontWeight:700 }}>Kokoro</span>
          <span style={{ fontFamily:"'Space Mono', monospace", fontSize:13, fontWeight:700, color:'#7c3aed', marginLeft:4 }}>OS</span>
          <span style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#9ca3af', marginLeft:8, letterSpacing:'0.15em' }}>// Zen</span>
        </div>
        <button onClick={() => router.push('/kokoro-chat')}
          title="Talk に戻る"
          style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#6b7280', background:'transparent', border:'1px solid #e5e7eb', borderRadius:2, padding:'6px 12px', cursor:'pointer' }}>
          ← Talk
        </button>
      </header>

      <div style={{ maxWidth:680, margin:'0 auto', padding:'40px 20px 80px' }}>

        {/* sessionStorageにデータがない場合 */}
        {noInput && !isLoading && !result && (
          <div style={{ textAlign:'center', padding:'80px 20px' }}>
            <div style={{ fontSize:18, color:'#6b7280', marginBottom:12 }}>Talkから遷移してください</div>
            <div style={{ fontSize:13, color:'#9ca3af', marginBottom:24 }}>Talkで会話した内容をもとに分析します</div>
            <button onClick={() => router.push('/kokoro-chat')}
              title="Talk を開く"
              style={{ fontFamily:"'Space Mono', monospace", fontSize:11, color:'#7c3aed', background:'#ede9fe', border:'none', borderRadius:6, padding:'10px 24px', cursor:'pointer' }}>
              ← Talk
            </button>
          </div>
        )}

        {/* エラー */}
        {error && (
          <div style={{ color:'#ef4444', fontSize:12, marginBottom:16 }}>{error}</div>
        )}

        {/* ローディング */}
        {isLoading && (
          <div style={{ marginBottom:32 }}>
            <div style={{ height:1, background:'#e5e7eb', position:'relative', overflow:'hidden', marginBottom:20 }}>
              <div style={{ position:'absolute', left:'-40%', top:0, width:'40%', height:'100%', background:'#7c3aed', animation:'sweep 1.4s ease-in-out infinite' }} />
            </div>
            {stepLabels.map((label, i) => (
              <div key={i} style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.14em', color: i < loadStep ? '#7c3aed' : '#d1d5db', marginBottom:8, transition:'color .3s' }}>
                {i < loadStep ? '✓ ' : '○ '}{label}
              </div>
            ))}
          </div>
        )}

        {/* 結果 */}
        {result && (
          <div ref={resultRef}>

            {/* ① エミ（短・刺す） */}
            <div style={{ borderLeft:'2px solid #7c3aed', paddingLeft:24, marginBottom:28, animation:'fadeUp .5s ease-out' }}>
              <div style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.18em', color:'#7c3aed', textTransform:'uppercase', marginBottom:16 }}>// エミより</div>
              <div style={{ fontSize:16, lineHeight:2.4, color:'#1a1a1a', fontWeight:300 }}>
                {formatEmi(result.emiMain)}
              </div>
              {result.emiQuestion && (
                <div style={{ marginTop:20, paddingTop:16, borderTop:'1px solid #e5e7eb', fontSize:14, color:'#6b7280', fontStyle:'italic', lineHeight:2 }}>
                  「{result.emiQuestion}」
                </div>
              )}
            </div>

            {/* ② もっと深く見る */}
            <button onClick={loadDeepEmi}
              title={deepOpen && deepData ? '閉じる' : 'もっと深く見てみる'}
              style={{ width:'100%', background:'transparent', border:'1px solid #e5e7eb', borderRadius:2, color:'#6b7280', fontFamily:"'Space Mono', monospace", fontSize:10, letterSpacing:'0.14em', textTransform:'uppercase', padding:'13px 20px', cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4, transition:'all .2s' }}>
              <span>{deepLoading ? '// 深部に降りています...' : deepOpen && deepData ? '▲' : 'Deep ▼'}</span>
              <span style={{ fontSize:8, color:'#9ca3af', letterSpacing:'0.05em' }}>エミ（深）</span>
            </button>

            {deepOpen && (
              <div style={{ marginBottom:20, animation:'fadeUp .4s ease-out' }}>
                {deepLoading ? (
                  <div style={{ height:1, background:'#e5e7eb', position:'relative', overflow:'hidden', margin:'16px 0' }}>
                    <div style={{ position:'absolute', left:'-40%', top:0, width:'40%', height:'100%', background:'#7c3aed', animation:'sweep 1.4s ease-in-out infinite' }} />
                  </div>
                ) : deepData && (
                  <div style={{ borderLeft:'2px solid #e5e7eb', paddingLeft:24, marginTop:16 }}>
                    <div style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.18em', color:'#9ca3af', textTransform:'uppercase', marginBottom:16 }}>// エミより（深）</div>
                    <div style={{ fontSize:15, lineHeight:2.2, color:'#374151', fontWeight:300 }}>
                      {formatEmi(deepData.emiMain)}
                    </div>
                    {deepData.emiQuestion && (
                      <div style={{ marginTop:16, paddingTop:14, borderTop:'1px solid #e5e7eb', fontSize:13, color:'#6b7280', fontStyle:'italic' }}>
                        「{deepData.emiQuestion}」
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ③ 4人格（折りたたみ） */}
            <button onClick={() => setPersonasOpen(v => !v)}
              title={personasOpen ? '閉じる' : '他の視点を見る'}
              style={{ width:'100%', background:'transparent', border:'1px solid #e5e7eb', borderRadius:2, color:'#6b7280', fontFamily:"'Space Mono', monospace", fontSize:10, letterSpacing:'0.14em', textTransform:'uppercase', padding:'13px 20px', cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4, transition:'all .2s' }}>
              <span>{personasOpen ? '▲' : 'Details ▼'}</span>
              <span style={{ fontSize:8, color:'#9ca3af' }}>// 4つの人格</span>
            </button>

            {personasOpen && (
              <div className="zen-personas-grid" style={{ marginBottom:20, display:'grid', gap:10, animation:'fadeUp .35s ease-out' }}>
                {result.personas.map(p => (
                  <div key={p.id} style={{ background:'#f8f9fa', border:'1px solid #e5e7eb', borderTop:`2px solid ${PERSONA_COLORS[p.id] || '#7c3aed'}`, padding:20 }}>
                    <div style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.15em', color: PERSONA_COLORS[p.id] || '#7c3aed', textTransform:'uppercase', marginBottom:12 }}>{p.name}</div>
                    <div style={{ fontSize:13, color:'#374151', lineHeight:2 }}>{p.text}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ④ Reasoning Core（折りたたみ） */}
            <button onClick={() => setCoreOpen(v => !v)}
              title={coreOpen ? '閉じる' : '状況の構造を見る'}
              style={{ width:'100%', background:'transparent', border:'1px solid #e5e7eb', borderRadius:2, color:'#6b7280', fontFamily:"'Space Mono', monospace", fontSize:10, letterSpacing:'0.14em', textTransform:'uppercase', padding:'13px 20px', cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4, transition:'all .2s' }}>
              <span>{coreOpen ? '▲' : 'Details ▼'}</span>
              <span style={{ fontSize:8, color:'#9ca3af' }}>// Reasoning Core</span>
            </button>

            {coreOpen && (
              <div style={{ marginBottom:20, background:'#f8f9fa', border:'1px solid #e5e7eb', padding:24, animation:'fadeUp .35s ease-out' }}>
                <div style={{ fontFamily:"'Space Mono', monospace", fontSize:10, letterSpacing:'0.15em', color:'#7c3aed', textTransform:'uppercase', marginBottom:16 }}>// 意味構造マップ</div>
                <div style={{ marginBottom:12 }}>
                  <span style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#9ca3af', display:'inline-block', width:80 }}>主な流れ</span>
                  <span style={{ fontSize:13, color:'#374151' }}>{result.core.main_story}</span>
                </div>
                <div style={{ marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#9ca3af', display:'inline-block', width:80 }}>感情の熱量</span>
                  <div style={{ display:'flex', gap:3 }}>
                    {[1,2,3,4,5].map(n => (
                      <div key={n} style={{ width:14, height:3, borderRadius:1, background: n <= result.core.emotional_heat ? '#7c3aed' : '#e5e7eb' }} />
                    ))}
                  </div>
                </div>
                {result.core.tensions?.length > 0 && (
                  <div style={{ marginBottom:12 }}>
                    <span style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#9ca3af', display:'block', marginBottom:6 }}>葛藤の構造</span>
                    {result.core.tensions.map((t, i) => (
                      <div key={i} style={{ fontSize:12, color:'#6b7280', paddingLeft:12, borderLeft:'2px solid #e5e7eb', marginBottom:4 }}>{t}</div>
                    ))}
                  </div>
                )}
                <div style={{ marginBottom:12 }}>
                  <span style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#9ca3af', display:'inline-block', width:80 }}>核心の問い</span>
                  <span style={{ fontSize:13, color:'#7c3aed', fontStyle:'italic' }}>"{result.core.key_question}"</span>
                </div>
                {result.core.needs?.length > 0 && (
                  <div>
                    <span style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#9ca3af', display:'block', marginBottom:6 }}>ニーズ</span>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {result.core.needs.map((n, i) => (
                        <span key={i} style={{ fontSize:11, padding:'4px 10px', border:'1px solid #e5e7eb', borderRadius:20, color:'#6b7280', fontFamily:"'Space Mono', monospace" }}>{n}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Zen → note 保存導線 */}
            <div style={{
              marginTop: 32,
              paddingTop: 20,
              borderTop: '1px solid rgba(124,58,237,0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              {zenNoteSaved ? (
                <button
                  onClick={() => router.push('/kokoro-note')}
                  title="noteに保存しました - 確認する"
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: 11,
                    color: '#34d399',
                    background: 'transparent',
                    border: '1px solid rgba(52,211,153,0.4)',
                    borderRadius: 6,
                    padding: '8px 18px',
                    cursor: 'pointer',
                    letterSpacing: '0.1em',
                  }}
                >
                  ✓ Note →
                </button>
              ) : (
                <button
                  onClick={handleSaveZenNote}
                  title="この整理をnoteに残す"
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: 11,
                    color: '#7c3aed',
                    background: 'rgba(124,58,237,0.06)',
                    border: '1px solid rgba(124,58,237,0.3)',
                    borderRadius: 6,
                    padding: '8px 18px',
                    cursor: 'pointer',
                    letterSpacing: '0.1em',
                    transition: 'all 0.15s',
                  }}
                >
                  Note +
                </button>
              )}
              <button
                onClick={() => {
                  const recipeInput = createRecipeInputFromZen({
                    headline: result.emiMain ?? '',
                    emotionTone: result.core.tensions.length > 0
                      ? [result.core.tensions[0]] : undefined,
                  });
                  setRecipeInput(recipeInput);
                  router.push('/kokoro-recipe');
                }}
                title="生活に落とす - Recipeを開く"
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 11, color: '#f97316',
                  background: 'rgba(249,115,22,0.06)',
                  border: '1px solid rgba(249,115,22,0.3)',
                  borderRadius: 6, padding: '8px 16px',
                  cursor: 'pointer', letterSpacing: '0.1em',
                }}
              >
                Recipe →
              </button>
              <button
                onClick={() => router.push('/kokoro-chat')}
                title="Talkで続きを話す"
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 11,
                  color: '#9ca3af',
                  background: 'transparent',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  padding: '8px 16px',
                  cursor: 'pointer',
                  letterSpacing: '0.1em',
                }}
              >
                ← Talk
              </button>
            </div>

          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes sweep { 0%{left:-40%} 100%{left:140%} }
        .zen-personas-grid { grid-template-columns: 1fr 1fr; }
        @media (max-width:768px) { .zen-personas-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}
