'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getProfile, updateExplicit, canAskQuestion, markQuestionAsked } from '@/lib/profile';

/* ── 型定義 ── */
type Message = {
  role: 'user' | 'ai';
  content: string;
  personaId?: string;
  syncRate?: number;
  showZen?: boolean;
  showAnimal?: boolean;
  showFashion?: boolean;
  imagePreview?: string;
  imageBase64?: string;
  imageMediaType?: string;
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
  const router = useRouter();
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
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedMediaType, setAttachedMediaType] = useState('');
  const [attachedPreview, setAttachedPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // localStorageからメッセージを復元
  useEffect(() => {
    const saved = localStorage.getItem('talkMessages');
    if (saved) {
      try { setMessages(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  // メッセージが更新されるたびにlocalStorageに保存
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('talkMessages', JSON.stringify(messages));
    }
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, zenOpen]);

  const apiHistory: ApiHistory[] = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
  }));

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

  const handleImageAttach = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setAttachedMediaType('image/jpeg');
    const compressed = await compressImage(file);
    setAttachedPreview(compressed);
    setAttachedImage(compressed.split(',')[1]);
  };

  const clearAttachment = () => {
    setAttachedImage(null);
    setAttachedMediaType('');
    setAttachedPreview(null);
  };

  const openAnimalTalk = (msg?: Message) => {
    const imgData = msg?.imageBase64 || attachedImage;
    const imgType = msg?.imageMediaType || attachedMediaType;
    if (!imgData || !imgType) return;
    sessionStorage.setItem('animalTalkImage', JSON.stringify({
      base64: imgData,
      mediaType: imgType,
    }));
    router.push('/kokoro-animal');
  };

  const FASHION_WORDS = ['今日の服','コーデ','似合','服どう','これ見て','ファッション','着てる','コーディネート','どうかな','どうだろう','どう思う','見て','これ'];

  const isFashionIntent = (text: string): boolean =>
    FASHION_WORDS.some(w => text.includes(w));

  const canShowFashionButton = (): boolean => {
    const profile = getProfile();
    const explicit = profile.explicit;
    // どれか1つでもプロフィールがあればOK
    const hasAnyProfile =
      !!explicit.age_range ||
      (explicit.style_keywords != null && explicit.style_keywords.length > 0) ||
      (explicit.favorite_things != null && explicit.favorite_things.length > 0);
    return hasAnyProfile;
  };

  const openFashion = () => {
    const profile = getProfile();
    const hasProfile = !!profile.explicit.age_range ||
      (profile.explicit.style_keywords != null && profile.explicit.style_keywords.length > 0) ||
      (profile.explicit.favorite_things != null && profile.explicit.favorite_things.length > 0);
    // 直近の画像付きメッセージを探す
    const lastImageMsg = [...messages].reverse().find(m => m.imageBase64);
    sessionStorage.setItem('fashionIntent', JSON.stringify({
      fromTalk: true,
      autoAnalyze: hasProfile || !!(lastImageMsg?.imageBase64),
      profile,
      imageBase64: lastImageMsg?.imageBase64 ?? null,
      imageMediaType: lastImageMsg?.imageMediaType ?? null,
    }));
    router.push('/kokoro-fashion');
  };

  const getProfileQuestion = (text: string): string | null => {
    const profile = getProfile();
    const isFashion = isFashionIntent(text);

    // 優先順位1: age_range
    if (!profile.explicit.age_range && canAskQuestion('age_range')) {
      return 'age_range';
    }
    // 優先順位2: style_keywords（Fashion intent時）
    if (isFashion && !profile.explicit.style_keywords?.length && canAskQuestion('style_keywords')) {
      return 'style_keywords';
    }
    // 優先順位3: favorite_things
    if (!profile.explicit.favorite_things?.length && canAskQuestion('favorite_things')) {
      return 'favorite_things';
    }
    return null;
  };

  const PROFILE_QUESTIONS: Record<string, string> = {
    age_range: '\n\n---\nざっくりでいいんだけど、年齢どのくらい？',
    style_keywords: '\n\n---\n普段どういう方向の服が好き？3語くらいで教えて',
    favorite_things: '\n\n---\n好きなもの、思いつく範囲で3つ教えて',
  };

  const parseProfileAnswer = (text: string) => {
    // 直前のAIメッセージを取得
    const lastAiMsg = [...messages].reverse().find(m => m.role === 'ai');
    if (!lastAiMsg) return;
    const lastContent = lastAiMsg.content;

    // age_range質問への返答
    if (lastContent.includes('年齢') || lastContent.includes('何歳')) {
      const ageMap: Record<string, string> = {
        '10': 'teens', '20': '20s', '30': '30s',
        '40': '40s', '50': '50s', '60': '60+',
      };
      for (const [key, val] of Object.entries(ageMap)) {
        if (text.includes(key)) {
          updateExplicit('age_range', val);
          break;
        }
      }
    }

    // style_keywords質問への返答
    if (lastContent.includes('方向の服が好き') || lastContent.includes('3語くらいで教えて')) {
      const keywords = text.split(/[、,，\s]+/).filter(Boolean);
      if (keywords.length > 0) {
        updateExplicit('style_keywords', keywords);
      }
    }

    // favorite_things質問への返答
    if (lastContent.includes('好きなもの') || lastContent.includes('3つ教えて')) {
      const things = text.split(/[、,，\s]+/).filter(Boolean);
      if (things.length > 0) {
        updateExplicit('favorite_things', things);
      }
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    // プロフィール質問への返答を検出・保存
    parseProfileAnswer(text);

    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Fashion intent時は直前のメッセージのみ渡す（繰り返し言及を抑制）
      const fashionCheck = isFashionIntent(text);
      const historyToSend = fashionCheck ? apiHistory.slice(-2) : apiHistory;

      const res = await fetch('/api/kokoro-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyToSend,
          turnCount: messages.filter(m => m.role === 'user').length,
          imageBase64: attachedImage || undefined,
          mediaType: attachedMediaType || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const savedImage = attachedImage;
      const savedMediaType = attachedMediaType;
      const savedPreview = attachedPreview;
      clearAttachment();

      // Fashion intent検出（上で既に判定済み）
      const fashionDetected = fashionCheck;

      // プロフィール質問追加
      let replyText = data.text;
      let askedProfileQuestion = false;
      if (fashionDetected) {
        const questionField = getProfileQuestion(text);
        if (questionField) {
          replyText += PROFILE_QUESTIONS[questionField];
          markQuestionAsked(questionField);
          askedProfileQuestion = true;
        }
      } else {
        const questionField = getProfileQuestion(text);
        if (questionField) {
          replyText += PROFILE_QUESTIONS[questionField];
          markQuestionAsked(questionField);
        }
      }

      // 画像+Fashion intentの場合はAnimalを抑制してFashionを出す
      const hasImage = !!(savedImage && savedMediaType);
      let showAnimalBtn = data.showAnimal;
      let showFashionBtn = false;

      if (fashionDetected) {
        // プロフィール質問中でなければボタン表示
        // プロフィールがなくてもFashionページで手動入力可能なのでOK
        showFashionBtn = !askedProfileQuestion;
        if (hasImage) {
          showAnimalBtn = false;
        }
      }

      const aiMsg: Message = {
        role: 'ai',
        content: replyText,
        personaId: data.personaId,
        syncRate: data.syncRate,
        showZen: data.showZen,
        showAnimal: showAnimalBtn,
        showFashion: showFashionBtn,
        imagePreview: savedPreview || undefined,
        imageBase64: savedImage || undefined,
        imageMediaType: savedMediaType || undefined,
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
                  {msg.showAnimal && (
                    <div style={{ marginTop:8, padding:'10px 14px', background:'#f9f5ff', border:'1px solid #e9d5ff', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                      <span style={{ fontSize:12, color:'#7c3aed' }}>🐾 この子、何か言ってそう。声を聞いてみる？</span>
                      <button onClick={() => openAnimalTalk(msg)}
                        style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#7c3aed', background:'transparent', border:'1px solid #c4b5fd', borderRadius:2, padding:'6px 12px', cursor:'pointer' }}>
                        動物の声を聞く →
                      </button>
                    </div>
                  )}
                  {msg.showFashion && (
                    <div style={{ marginTop:8, padding:'10px 14px', background:'#faf5ff', border:'1px solid #e9d5ff', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                      <span style={{ fontSize:12, color:'#7c3aed' }}>👔 装いの奥を読んでみる？</span>
                      <button onClick={openFashion}
                        style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#7c3aed', background:'transparent', border:'1px solid #c4b5fd', borderRadius:2, padding:'6px 12px', cursor:'pointer' }}>
                        Fashion診断へ →
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
        {/* 画像プレビュー */}
        {attachedPreview && (
          <div style={{ maxWidth:680, margin:'0 auto 8px', padding:'0 20px' }}>
            <div style={{ position:'relative', display:'inline-block' }}>
              <img src={attachedPreview} alt="attachment"
                style={{ height:80, borderRadius:8, display:'block', objectFit:'cover' }} />
              <button onClick={clearAttachment}
                style={{ position:'absolute', top:-6, right:-6, width:20, height:20, borderRadius:'50%', background:'#1a1a1a', color:'#fff', border:'none', cursor:'pointer', fontSize:10, display:'flex', alignItems:'center', justifyContent:'center' }}>
                ✕
              </button>
            </div>
          </div>
        )}
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
          <button onClick={() => fileInputRef.current?.click()}
            style={{ width:46, height:46, flexShrink:0, background:'#f3f4f6', border:'1px solid #e5e7eb', borderRadius:12, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>
            📎
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display:'none' }}
            onChange={e => { if (e.target.files?.[0]) handleImageAttach(e.target.files[0]); e.target.value = ''; }} />
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
