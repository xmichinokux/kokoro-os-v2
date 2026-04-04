'use client';

import { useState, useRef, useEffect } from 'react';

/* ── 型定義 ── */
type Message = {
  role: 'user' | 'ai';
  content: string;
  personaId?: string;
  syncRate?: number;
  showZen?: boolean;
};

type ApiHistory = { role: string; content: string };

const PERSONA_COLORS: Record<string, string> = {
  norm:   '#d97706',
  shin:   '#2563eb',
  canon:  '#7c3aed',
  digg:   '#059669',
  emi:    '#db2777',
  watari: '#ea580c',
};

const PERSONA_NAMES: Record<string, string> = {
  norm:'ノーム', shin:'シン', canon:'カノン',
  digg:'ディグ', emi:'エミ', watari:'ワタリ',
};

const PERSONA_EMOJIS: Record<string, string> = {
  norm:   '🌱',
  shin:   '🔍',
  canon:  '🌙',
  digg:   '🎧',
  emi:    '🌊',
  watari: '🔥',
};

/* ── メインコンポーネント ── */
export default function KokoroChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [zenOpen, setZenOpen] = useState(false);
  const [zenLoading, setZenLoading] = useState(false);
  const [zenSource, setZenSource] = useState('');
  const [zenEmiMain, setZenEmiMain] = useState('');
  const [zenEmiQuestion, setZenEmiQuestion] = useState('');
  const [deepOpen, setDeepOpen] = useState(false);
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepEmiMain, setDeepEmiMain] = useState('');
  const [deepEmiQuestion, setDeepEmiQuestion] = useState('');
  const [deepLoaded, setDeepLoaded] = useState(false);
  const [zenPersonas, setZenPersonas] = useState<{id:string;name:string;text:string}[]>([]);
  const [personasOpen, setPersonasOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, zenOpen]);

  const apiHistory: ApiHistory[] = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
  }));

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/kokoro-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: apiHistory,
          turnCount: messages.filter(m => m.role === 'user').length,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const aiMsg: Message = {
        role: 'ai',
        content: data.text,
        personaId: data.personaId,
        syncRate: data.syncRate,
        showZen: data.showZen,
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'ai', content: `エラーが発生しました: ${e instanceof Error ? e.message : '不明なエラー'}`,
      }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  const openZen = async () => {
    const userTexts = messages.filter(m => m.role === 'user').map(m => m.content).join('\n');
    setZenSource(userTexts);
    setZenLoading(true);
    setZenOpen(true);
    setZenEmiMain('');
    setZenEmiQuestion('');
    setDeepOpen(false);
    setDeepLoaded(false);
    setDeepEmiMain('');
    setDeepEmiQuestion('');

    try {
      const res = await fetch('/api/kokoro-zen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userTexts }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setZenEmiMain(data.emiMain || '');
      setZenEmiQuestion(data.emiQuestion || '');
      setZenPersonas(data.personas || []);
    } catch (e) {
      setZenEmiMain(`エラー: ${e instanceof Error ? e.message : '不明'}`);
    } finally {
      setZenLoading(false);
    }
  };

  const loadDeepEmi = async () => {
    if (deepLoaded) {
      setDeepOpen(v => !v);
      return;
    }
    setDeepLoading(true);
    setDeepOpen(true);
    try {
      const res = await fetch('/api/kokoro-zen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: zenSource, mode: 'deep_emi' }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDeepEmiMain(data.emiMain || '');
      setDeepEmiQuestion(data.emiQuestion || '');
      setDeepLoaded(true);
    } catch (e) {
      setDeepEmiMain(`エラー: ${e instanceof Error ? e.message : ''}`);
      setDeepLoaded(true);
    } finally {
      setDeepLoading(false);
    }
  };

  const formatEmi = (text: string) =>
    text.split(/(?<=。)/).map(s => s.trim()).filter(s => s).map((s, i) => (
      <p key={i} style={{ margin: '0 0 1em 0' }}>{s}</p>
    ));

  const isWelcome = messages.length === 0;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#fff', color:'#1a1a1a', fontFamily:"'Noto Sans JP', sans-serif", fontWeight:300 }}>

      {/* ヘッダー */}
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', borderBottom:'1px solid #e5e7eb', background:'#fff', position:'sticky', top:0, zIndex:10 }}>
        <div>
          <span style={{ fontFamily:"'Space Mono', monospace", fontSize:13, fontWeight:700, color:'#1a1a1a' }}>Kokoro</span>
          <span style={{ fontFamily:"'Space Mono', monospace", fontSize:13, fontWeight:700, color:'#7c3aed', marginLeft:4 }}>OS</span>
          <span style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#9ca3af', marginLeft:8, letterSpacing:'0.15em' }}>// Talk</span>
        </div>
      </header>

      {/* チャットエリア */}
      <div style={{ flex:1, overflowY:'auto', padding:'24px 0' }}>
        <div style={{ maxWidth:680, margin:'0 auto', padding:'0 20px' }}>

          {/* ウェルカム */}
          {isWelcome && (
            <div style={{ textAlign:'center', padding:'60px 20px' }}>
              <div style={{ fontSize:22, fontWeight:400, marginBottom:10, color:'#1a1a1a' }}>今、何が少し引っかかってる？</div>
              <div style={{ fontSize:13, color:'#9ca3af', marginBottom:28 }}>うまく言えなくても大丈夫</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center' }}>
                {['なんか不安','モヤモヤする','疲れてる気がする','うまくいかない','アイデアがある'].map(hint => (
                  <button key={hint} onClick={() => setInput(hint)}
                    style={{ fontSize:12, padding:'6px 14px', border:'1px solid #e5e7eb', borderRadius:20, background:'#fff', cursor:'pointer', color:'#6b7280', transition:'all .15s' }}>
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* メッセージ一覧 */}
          {messages.map((msg, i) => (
            <div key={i} style={{ marginBottom:20, display:'flex', flexDirection:'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {msg.role === 'user' ? (
                <div style={{ background:'#f3f4f6', borderRadius:'16px 16px 4px 16px', padding:'10px 16px', maxWidth:'75%', fontSize:14, lineHeight:1.7 }}>
                  {msg.content}
                </div>
              ) : (
                <div style={{ maxWidth:'85%' }}>
                  {msg.personaId && (
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                      <div style={{ width:28, height:28, borderRadius:'50%', background: PERSONA_COLORS[msg.personaId] + '22', border:`1.5px solid ${PERSONA_COLORS[msg.personaId] || '#7c3aed'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>
                        {PERSONA_EMOJIS[msg.personaId] || '💬'}
                      </div>
                      <div style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color: PERSONA_COLORS[msg.personaId] || '#7c3aed', letterSpacing:'0.15em', textTransform:'uppercase' }}>
                        {PERSONA_NAMES[msg.personaId] || msg.personaId}
                        {msg.syncRate !== undefined && <span style={{ color:'#d1d5db', marginLeft:8 }}>sync {Math.round(msg.syncRate * 100)}%</span>}
                      </div>
                    </div>
                  )}
                  <div style={{ borderLeft:'2px solid #e5e7eb', paddingLeft:16, fontSize:14, lineHeight:2, color:'#374151' }}>
                    {msg.content}
                  </div>
                  {msg.showZen && (
                    <div style={{ marginTop:12, padding:'10px 14px', background:'#faf5ff', border:'1px solid #e9d5ff', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                      <span style={{ fontSize:12, color:'#7c3aed' }}>少しだけ、見方を変えてみる？</span>
                      <button onClick={openZen}
                        style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#7c3aed', background:'transparent', border:'1px solid #c4b5fd', borderRadius:2, padding:'6px 12px', cursor:'pointer' }}>
                        見方を変えてみる →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* ローディング */}
          {isLoading && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0' }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'#7c3aed', animation:'pulse 1s infinite' }} />
              <span style={{ fontSize:12, color:'#9ca3af' }}>考えています...</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Zenオーバーレイ */}
      {zenOpen && (
        <div style={{ position:'fixed', inset:0, background:'#fff', zIndex:100, overflowY:'auto', display:'flex', flexDirection:'column' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', borderBottom:'1px solid #e5e7eb', position:'sticky', top:0, background:'#fff', zIndex:10 }}>
            <span style={{ fontFamily:"'Space Mono', monospace", fontSize:10, letterSpacing:'0.2em', color:'#7c3aed', textTransform:'uppercase' }}>// Kokoro Zen</span>
            <button onClick={() => { setZenOpen(false); setZenEmiMain(''); setZenEmiQuestion(''); setDeepOpen(false); setDeepLoaded(false); }}
              style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#6b7280', background:'transparent', border:'1px solid #e5e7eb', borderRadius:2, padding:'6px 12px', cursor:'pointer' }}>
              ← Talk に戻る
            </button>
          </div>

          <div style={{ maxWidth:680, margin:'0 auto', padding:'40px 20px 80px', width:'100%' }}>

            {/* ローディング */}
            {zenLoading && (
              <div style={{ height:1, background:'#e5e7eb', position:'relative', overflow:'hidden', marginTop:20 }}>
                <div style={{ position:'absolute', left:'-40%', top:0, width:'40%', height:'100%', background:'#7c3aed', animation:'sweep 1.4s ease-in-out infinite' }} />
              </div>
            )}

            {/* エミ（短） */}
            {!zenLoading && zenEmiMain && (
              <>
                <div style={{ borderLeft:'2px solid #7c3aed', paddingLeft:24, marginBottom:28 }}>
                  <div style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.18em', color:'#7c3aed', textTransform:'uppercase', marginBottom:16 }}>// エミより</div>
                  <div style={{ fontSize:16, lineHeight:2.4, color:'#1a1a1a', fontWeight:300 }}>
                    {formatEmi(zenEmiMain)}
                  </div>
                  {zenEmiQuestion && (
                    <div style={{ marginTop:20, paddingTop:16, borderTop:'1px solid #e5e7eb', fontSize:14, color:'#6b7280', fontStyle:'italic' }}>
                      「{zenEmiQuestion}」
                    </div>
                  )}
                </div>

                {/* もっと深く見る */}
                <button onClick={loadDeepEmi} disabled={deepLoading}
                  style={{ width:'100%', background:'transparent', border:'1px solid #e5e7eb', borderRadius:2, color: deepLoading ? '#9ca3af' : '#6b7280', fontFamily:"'Space Mono', monospace", fontSize:10, letterSpacing:'0.14em', textTransform:'uppercase', padding:'13px 20px', cursor: deepLoading ? 'not-allowed' : 'pointer', textAlign:'left', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                  <span>{deepLoading ? '// 深部に降りています...' : (deepLoaded && deepOpen) ? '▲ 閉じる' : '▼ もっと深く見てみる'}</span>
                  <span style={{ fontSize:8, color:'#9ca3af' }}>エミ（深）</span>
                </button>

                {/* エミ（深） */}
                {deepOpen && !deepLoading && deepLoaded && (
                  <div style={{ marginBottom:20 }}>
                    <div style={{ borderLeft:'2px solid #e5e7eb', paddingLeft:24, marginTop:16 }}>
                      <div style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.18em', color:'#9ca3af', textTransform:'uppercase', marginBottom:16 }}>// エミより（深）</div>
                      <div style={{ fontSize:15, lineHeight:2.2, color:'#374151', fontWeight:300 }}>
                        {formatEmi(deepEmiMain)}
                      </div>
                      {deepEmiQuestion && (
                        <div style={{ marginTop:16, paddingTop:14, borderTop:'1px solid #e5e7eb', fontSize:13, color:'#6b7280', fontStyle:'italic' }}>
                          「{deepEmiQuestion}」
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ローディング中のライン */}
                {deepLoading && (
                  <div style={{ height:1, background:'#e5e7eb', position:'relative', overflow:'hidden', margin:'16px 0' }}>
                    <div style={{ position:'absolute', left:'-40%', top:0, width:'40%', height:'100%', background:'#7c3aed', animation:'sweep 1.4s ease-in-out infinite' }} />
                  </div>
                )}

                {/* 4人格（折りたたみ） */}
                {zenPersonas.length > 0 && (
                  <>
                    <button onClick={() => setPersonasOpen(v => !v)}
                      style={{ width:'100%', background:'transparent', border:'1px solid #e5e7eb', borderRadius:2, color:'#6b7280', fontFamily:"'Space Mono', monospace", fontSize:10, letterSpacing:'0.14em', textTransform:'uppercase', padding:'13px 20px', cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4, marginTop:4 }}>
                      <span>{personasOpen ? '▲ 閉じる' : '▼ 他の視点を見る'}</span>
                      <span style={{ fontSize:8, color:'#9ca3af' }}>// 4つの人格</span>
                    </button>
                    {personasOpen && (
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
                        {zenPersonas.map(p => {
                          const colors: Record<string,string> = { norm:'#d97706', shin:'#2563eb', canon:'#7c3aed', digg:'#059669' };
                          return (
                            <div key={p.id} style={{ background:'#f8f9fa', border:'1px solid #e5e7eb', borderTop:`2px solid ${colors[p.id] || '#7c3aed'}`, padding:20 }}>
                              <div style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.15em', color: colors[p.id] || '#7c3aed', textTransform:'uppercase', marginBottom:12 }}>{p.name}</div>
                              <div style={{ fontSize:13, color:'#374151', lineHeight:2 }}>{p.text}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 入力エリア */}
      <div style={{ padding:'12px 20px 16px', borderTop:'1px solid #e5e7eb', background:'#fff' }}>
        <div style={{ maxWidth:680, margin:'0 auto', display:'flex', gap:10, alignItems:'flex-end' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
            placeholder="なんでもいいよ。断片でも。"
            rows={1}
            style={{ flex:1, resize:'none', border:'1px solid #e5e7eb', borderRadius:12, padding:'12px 16px', fontSize:14, lineHeight:1.6, outline:'none', fontFamily:'inherit', background:'#f9fafb', color:'#1a1a1a', minHeight:48, maxHeight:160, overflowY:'auto' }}
          />
          <button onClick={sendMessage} disabled={isLoading}
            style={{ width:46, height:46, flexShrink:0, background:'#7c3aed', border:'none', borderRadius:12, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, color:'#fff', opacity: isLoading ? 0.5 : 1 }}>
            ↑
          </button>
        </div>
        <div style={{ maxWidth:680, margin:'4px auto 0', textAlign:'center', fontFamily:"'Space Mono', monospace", fontSize:9, color:'#d1d5db', letterSpacing:'0.1em' }}>
          Enter で送信 // Shift+Enter で改行
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes sweep { 0%{left:-40%} 100%{left:140%} }
      `}</style>
    </div>
  );
}
