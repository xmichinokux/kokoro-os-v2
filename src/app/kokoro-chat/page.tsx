'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getProfile, updateExplicit, canAskQuestion, markQuestionAsked } from '@/lib/profile';
import TalkResponse from '@/components/kokoro/TalkResponse';
import type { Persona, PersonaStayState, IdentityState, ResponseStrategy } from '@/types/kokoroOutput';
import { PERSONA_LABELS, PERSONA_COLORS as CORE_PERSONA_COLORS, PERSONA_EMOJIS as CORE_PERSONA_EMOJIS } from '@/lib/kokoro/personaLabels';
import { createHonneLog } from '@/lib/kokoro/diagnosis/createHonneLog';
import { appendHonneLog, clearHonneLogs, getHonneLogs } from '@/lib/kokoro/diagnosis/honneStorage';
import { shouldTriggerEmi, buildEmiResponse, buildZenPromptFromEmi, type EmiState } from '@/lib/kokoro/emi';
import { inferSessionState, calcEffectiveProfileWeight } from '@/lib/kokoro/sessionState';
import { createNoteFromEmi } from '@/lib/kokoro/createNoteFromTalk';
import { saveNote } from '@/lib/kokoro/noteStorage';
import { consumeNoteForTalk, buildTalkPromptFromNote } from '@/lib/kokoro/noteLinkage';
import type { KokoroNote } from '@/types/note';

/* ── 型定義 ── */
type StayWhisper = { persona: string; text: string };

type Message = {
  role: 'user' | 'ai';
  content: string;
  talkPersona?: Persona;
  talkResponse?: string;
  personaId?: string;
  syncRate?: number;
  showAnimal?: boolean;
  showFashion?: boolean;
  imagePreview?: string;
  imageBase64?: string;
  imageMediaType?: string;
  stayMain?: string;
  stayPersona?: Persona;
  stayWhispers?: StayWhisper[];
  showZen?: boolean;
  isEmi?: boolean;        // エミの発言メッセージ
  emiLine?: string;       // エミの発言内容
  emiConflict?: string;
  emiDeepFeeling?: string;
  emiShowZenCta?: boolean; // ターン2後のZen CTA表示
  identityState?: IdentityState;
  gapIntensity?: number;
  responseStrategy?: ResponseStrategy;
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
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedMediaType, setAttachedMediaType] = useState('');
  const [attachedPreview, setAttachedPreview] = useState<string | null>(null);
  const [stayState, setStayState] = useState<PersonaStayState>({
    active: false,
    persona: 'gnome',
    style: 'balanced',
    turnCount: 0,
  });
  const [whisperOpen, setWhisperOpen] = useState<Record<number, boolean>>({});
  const [showDiagnosisBanner, setShowDiagnosisBanner] = useState(false);
  const [emiState, setEmiState] = useState<EmiState>({ active: false, turnCount: 0, triggerCount: 0 });
  const [turnCount, setTurnCount] = useState(0);
  const [linkedNote, setLinkedNote] = useState<Partial<KokoroNote> | null>(null);
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

  // Note→Talk連携: メモからの初期メッセージを復元
  useEffect(() => {
    const noteData = consumeNoteForTalk();
    if (noteData) {
      setLinkedNote(noteData);
      const prompt = buildTalkPromptFromNote(noteData);
      setInput(prompt);
    }
  }, []);

  // メッセージが更新されるたびにlocalStorageに保存
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('talkMessages', JSON.stringify(messages));
    }
  }, [messages]);

  // ページ読み込み時に診断バナー表示チェック
  useEffect(() => {
    const logs = getHonneLogs();
    if (logs.length >= 3) {
      setShowDiagnosisBanner(true);
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 診断画面からの遷移を受け取る
  const diagnosisHandledRef = useRef(false);
  useEffect(() => {
    if (diagnosisHandledRef.current) return;
    diagnosisHandledRef.current = true;

    const stayData = sessionStorage.getItem('diagnosisStayIntent');
    if (stayData) {
      try {
        const { stayPersona, prompt } = JSON.parse(stayData);
        sessionStorage.removeItem('diagnosisStayIntent');
        setStayState({ active: true, persona: stayPersona, style: 'balanced', turnCount: 0 });
        if (prompt) {
          setTimeout(() => { setInput(prompt); }, 300);
        }
      } catch { /* ignore */ }
    }

    const multiData = sessionStorage.getItem('diagnosisMultiIntent');
    if (multiData) {
      try {
        const { prompt } = JSON.parse(multiData);
        sessionStorage.removeItem('diagnosisMultiIntent');
        if (prompt) {
          setTimeout(() => { setInput(prompt); }, 300);
        }
      } catch { /* ignore */ }
    }
  }, []);

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
  const ANIMAL_TALK_WORDS = ['なんて言ってる','何て言ってる','なんて言ってるのかな','何て言ってるのかな','声を聞く','声を聞いて','鳴い','猫','犬','ねこ','いぬ','ペット','動物'];

  const isFashionIntent = (text: string): boolean =>
    FASHION_WORDS.some(w => text.includes(w));

  const isAnimalTalkIntent = (text: string, hasImage: boolean): boolean =>
    ANIMAL_TALK_WORDS.some(w => text.includes(w)) || (hasImage && !isFashionIntent(text));

  const canShowFashionButton = (): boolean => {
    const profile = getProfile();
    const explicit = profile.explicit;
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
    if (!profile.explicit.age_range && canAskQuestion('age_range')) return 'age_range';
    if (isFashion && !profile.explicit.style_keywords?.length && canAskQuestion('style_keywords')) return 'style_keywords';
    if (!profile.explicit.favorite_things?.length && canAskQuestion('favorite_things')) return 'favorite_things';
    return null;
  };

  const PROFILE_QUESTIONS: Record<string, string> = {
    age_range: '\n\n---\nざっくりでいいんだけど、年齢どのくらい？',
    style_keywords: '\n\n---\n普段どういう方向の服が好き？3語くらいで教えて',
    favorite_things: '\n\n---\n好きなもの、思いつく範囲で3つ教えて',
  };

  const parseProfileAnswer = (text: string): boolean => {
    const lastAiMsg = [...messages].reverse().find(m => m.role === 'ai');
    if (!lastAiMsg) return false;
    const lastContent = lastAiMsg.content;
    let saved = false;

    if (lastContent.includes('年齢') || lastContent.includes('何歳')) {
      const ageMap: Record<string, string> = {
        '10': 'teens', '20': '20s', '30': '30s',
        '40': '40s', '50': '50s', '60': '60+',
      };
      for (const [key, val] of Object.entries(ageMap)) {
        if (text.includes(key)) { updateExplicit('age_range', val); saved = true; break; }
      }
    }

    if (lastContent.includes('方向の服が好き') || lastContent.includes('3語くらいで教えて')) {
      const keywords = text.split(/[、,，\s]+/).filter(Boolean);
      if (keywords.length > 0) { updateExplicit('style_keywords', keywords); saved = true; }
    }

    if (lastContent.includes('好きなもの') || lastContent.includes('3つ教えて')) {
      const things = text.split(/[、,，\s]+/).filter(Boolean);
      if (things.length > 0) { updateExplicit('favorite_things', things); saved = true; }
    }

    return saved;
  };

  const enterStayMode = (persona: Persona) => {
    setStayState({ active: true, persona, style: 'balanced', turnCount: 0 });
  };

  const exitStayMode = () => {
    setStayState({ active: false, persona: 'gnome', style: 'balanced', turnCount: 0 });
  };

  const DECISION_KEYWORDS = /決断|決め|重要|大事な選択|人生|覚悟/;
  const shouldSuggestReturn = (text: string, turnCount: number): boolean => {
    return turnCount >= 5 || DECISION_KEYWORDS.test(text);
  };

  const hasRecentFashionContext = (msgs: Message[]): boolean => {
    return msgs.slice(-5).some(m => FASHION_WORDS.some(kw => m.content.includes(kw)));
  };

  const handleZenClick = (opts?: { conflict?: string; deepFeeling?: string }) => {
    const lastUserMsg = messages.filter(m => m.role === 'user').map(m => m.content).pop() || '';
    const prompt = buildZenPromptFromEmi({
      lastUserMessage: lastUserMsg,
      detectedConflict: opts?.conflict,
      deepFeeling: opts?.deepFeeling,
    });
    sessionStorage.setItem('zenFromTalk', JSON.stringify({ userInput: prompt }));
    router.push('/kokoro-zen');
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const profileUpdated = parseProfileAnswer(text);

    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setTurnCount(prev => prev + 1);

    try {
      // Stay mode の場合
      if (stayState.active) {
        const res = await fetch('/api/chat-stay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            history: apiHistory,
            persona: stayState.persona,
            style: stayState.style,
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const newTurnCount = stayState.turnCount + 1;
        setStayState(prev => ({ ...prev, turnCount: newTurnCount }));

        const suggestReturn = shouldSuggestReturn(text, newTurnCount);

        const aiMsg: Message = {
          role: 'ai',
          content: data.main || '',
          stayMain: data.main || '',
          stayPersona: stayState.persona,
          stayWhispers: data.whispers || [],
          showZen: suggestReturn,
        };
        setMessages(prev => [...prev, aiMsg]);
        setIsLoading(false);
        setTimeout(() => textareaRef.current?.focus(), 100);
        return;
      }

      // Talk（1人格返答）
      const fashionCheck = isFashionIntent(text);

      // session_state推定とprofileWeight計算
      const recentTexts = messages.filter(m => m.role === 'user').slice(-5).map(m => m.content);
      const sessionState = inferSessionState(recentTexts);
      const effectiveProfileWeight = calcEffectiveProfileWeight({
        currentMessage: text,
        turnCount,
        sessionState,
      });
      const profile = getProfile();

      // Note連携: linkedNoteがある場合はnoteContextとして送信
      const noteContext = linkedNote ? {
        noteId: linkedNote.id,
        title: linkedNote.title,
        body: linkedNote.body,
        topic: linkedNote.topic,
        insightType: linkedNote.insightType,
        emotionTone: linkedNote.emotionTone,
      } : undefined;

      const res = await fetch('/api/kokoro-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: fashionCheck ? [] : apiHistory,
          imageBase64: attachedImage || undefined,
          mediaType: attachedMediaType || undefined,
          profile,
          sessionState,
          effectiveProfileWeight,
          turnCount,
          noteContext,
        }),
      });

      // 初回送信後にlinkedNoteをクリア
      if (linkedNote) setLinkedNote(null);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // 自己認識ズレ検出結果
      const identityState: IdentityState = data.identityState ?? 'NO_GAP';
      const gapIntensity: number = data.gapIntensity ?? 0;
      const responseStrategy: ResponseStrategy = data.responseStrategy ?? 'normal';

      const savedImage = attachedImage;
      const savedMediaType = attachedMediaType;
      const savedPreview = attachedPreview;
      clearAttachment();

      // Intent検出
      const fashionDetected = fashionCheck;
      const hasImage = !!(savedImage && savedMediaType);
      const animalDetected = isAnimalTalkIntent(text, hasImage);

      // プロフィール質問追加（最初の3ターンは質問しない）
      let replyText = data.response || '';
      let askedProfileQuestion = false;
      if (!animalDetected && turnCount >= 3) {
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
      }

      // エミがアクティブまたは発動直後はFashion/Animalボタンを非表示
      const emiBlocking = emiState.active || emiState.turnCount >= 1;

      let showAnimalBtn = !!(savedImage && savedMediaType) && !emiBlocking;
      let showFashionBtn = false;

      if (!emiBlocking) {
        if (fashionDetected) {
          showFashionBtn = !askedProfileQuestion;
          if (hasImage) showAnimalBtn = false;
        } else if (profileUpdated && hasRecentFashionContext(messages)) {
          showFashionBtn = true;
        }
      }

      // 本音ログ保存
      if (data.honneLog) {
        const log = createHonneLog({
          ...data.honneLog,
          sourceMode: stayState.active ? 'stay' : 'normal',
          activePersona: stayState.active ? stayState.persona : undefined,
        });
        appendHonneLog(log);
      }

      // 診断バナー表示チェック（APIレスポンス後）
      {
        const logs = getHonneLogs();
        if (logs.length >= 3) {
          setShowDiagnosisBanner(true);
        }
      }

      // エミ2ターン半人格モード
      const recentUserTexts = messages
        .filter(m => m.role === 'user')
        .slice(-3)
        .map(m => m.content);

      const currentConflict = data.honneLog?.conflictAxes?.[0];
      const currentDeepFeeling = data.honneLog?.deepFeeling;

      if (emiState.active) {
        // エミがアクティブ中
        const nextTurn = (emiState.turnCount + 1) as 1 | 2;

        if (nextTurn === 1) {
          // ターン1: 通常人格 + エミの一言
          const { line: emiLine, detection } = buildEmiResponse(text, recentUserTexts, emiState, 1);

          const aiMsg: Message = {
            role: 'ai',
            content: replyText,
            talkPersona: (data.persona || 'gnome') as Persona,
            talkResponse: replyText,
            identityState,
            gapIntensity,
            responseStrategy,
            showAnimal: showAnimalBtn || undefined,
            showFashion: showFashionBtn || undefined,
            imagePreview: savedPreview || undefined,
            imageBase64: savedImage || undefined,
            imageMediaType: savedMediaType || undefined,
            emiLine,
            emiConflict: currentConflict,
            emiDeepFeeling: currentDeepFeeling,
          };
          setMessages(prev => [...prev, aiMsg]);
          setEmiState(prev => ({
            ...prev,
            turnCount: 1,
            lastInsightType: detection.type,
            lastInsightLevel: detection.level,
            lastEmiLine: emiLine,
            sharpUsedAt: detection.level === 'sharp' ? new Date().toISOString() : prev.sharpUsedAt,
          }));

        } else {
          // ターン2: エミのみ（通常人格なし）+ Zen CTA
          const { line: emiLine, detection } = buildEmiResponse(text, recentUserTexts, emiState, 2);

          const emiMsg: Message = {
            role: 'ai',
            content: emiLine,
            isEmi: true,
            emiLine,
            emiConflict: currentConflict,
            emiDeepFeeling: currentDeepFeeling,
            emiShowZenCta: true,
          };
          setMessages(prev => [...prev, emiMsg]);
          setEmiState(prev => ({
            ...prev,
            active: false,
            turnCount: 0,
            lastInsightType: detection.type,
            lastInsightLevel: detection.level,
            lastEmiLine: emiLine,
            sharpUsedAt: detection.level === 'sharp' ? new Date().toISOString() : prev.sharpUsedAt,
          }));
        }

      } else {
        // エミ非アクティブ: 新規トリガー判定
        const emiTriggered = shouldTriggerEmi({
          text,
          recentUserTexts,
          conflictAxes: data.honneLog?.conflictAxes,
          deepFeeling: currentDeepFeeling,
        });

        let emiActivated = false;
        if (emiTriggered) {
          const now = Date.now();
          const lastTriggered = emiState.lastTriggeredAt
            ? new Date(emiState.lastTriggeredAt).getTime()
            : 0;
          const cooldownOk = now - lastTriggered > 60000;
          if (cooldownOk) {
            emiActivated = true;
          }
        }

        if (emiActivated) {
          // ターン1発火: 通常人格 + エミの一言
          const { line: emiLine, detection } = buildEmiResponse(text, recentUserTexts, emiState, 1);

          const aiMsg: Message = {
            role: 'ai',
            content: replyText,
            talkPersona: (data.persona || 'gnome') as Persona,
            talkResponse: replyText,
            identityState,
            gapIntensity,
            responseStrategy,
            showAnimal: showAnimalBtn || undefined,
            showFashion: showFashionBtn || undefined,
            imagePreview: savedPreview || undefined,
            imageBase64: savedImage || undefined,
            imageMediaType: savedMediaType || undefined,
            emiLine,
            emiConflict: currentConflict,
            emiDeepFeeling: currentDeepFeeling,
          };
          setMessages(prev => [...prev, aiMsg]);
          setEmiState({
            active: true,
            turnCount: 1,
            lastTriggeredAt: new Date().toISOString(),
            triggerCount: emiState.triggerCount + 1,
            lastInsightType: detection.type,
            lastInsightLevel: detection.level,
            lastEmiLine: emiLine,
            sharpUsedAt: detection.level === 'sharp' ? new Date().toISOString() : emiState.sharpUsedAt,
          });

          // エミ発火 + medium/sharp の場合にnoteを自動保存
          if (detection.level !== 'soft') {
            const emiNote = createNoteFromEmi(
              emiLine,
              detection.type,
              data.honneLog?.topic
            );
            saveNote(emiNote);
          }

        } else {
          // 通常応答（エミなし）
          const aiMsg: Message = {
            role: 'ai',
            content: replyText,
            talkPersona: (data.persona || 'gnome') as Persona,
            talkResponse: replyText,
            identityState,
            gapIntensity,
            responseStrategy,
            showAnimal: showAnimalBtn || undefined,
            showFashion: showFashionBtn || undefined,
            imagePreview: savedPreview || undefined,
            imageBase64: savedImage || undefined,
            imageMediaType: savedMediaType || undefined,
          };
          setMessages(prev => [...prev, aiMsg]);
        }
      }
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'ai', content: `エラーが発生しました: ${e instanceof Error ? e.message : '不明なエラー'}`,
      }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

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
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={() => { localStorage.removeItem('talkMessages'); setMessages([]); }}
            style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#9ca3af', background:'transparent', border:'1px solid #e5e7eb', borderRadius:2, padding:'4px 10px', cursor:'pointer' }}>
            履歴をクリア
          </button>
          <button onClick={() => { localStorage.removeItem('kokoroProfile'); }}
            style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#9ca3af', background:'transparent', border:'1px solid #e5e7eb', borderRadius:2, padding:'4px 10px', cursor:'pointer' }}>
            プロフィールをクリア
          </button>
          <button onClick={() => { clearHonneLogs(); }}
            style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#9ca3af', background:'transparent', border:'1px solid #e5e7eb', borderRadius:2, padding:'4px 10px', cursor:'pointer' }}>
            本音ログをクリア
          </button>
        </div>
      </header>

      {/* 人格選択バー */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'8px 20px', borderBottom:'1px solid #f3f4f6', background:'#fafafa' }}>
        {stayState.active && (
          <button onClick={exitStayMode}
            style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#7c3aed', background:'#ede9fe', border:'1px solid #c4b5fd', borderRadius:4, padding:'4px 10px', cursor:'pointer', marginRight:8 }}>
            4人格に戻る
          </button>
        )}
        {(['gnome', 'shin', 'canon', 'dig'] as Persona[]).map(p => {
          const isActive = stayState.active && stayState.persona === p;
          const color = CORE_PERSONA_COLORS[p];
          return (
            <button key={p} onClick={() => stayState.active && stayState.persona === p ? exitStayMode() : enterStayMode(p)}
              style={{
                display:'flex', alignItems:'center', gap:4, padding:'5px 12px',
                border: isActive ? `2px solid ${color}` : '1px solid #e5e7eb',
                borderRadius:20, cursor:'pointer', transition:'all .15s',
                background: isActive ? color + '15' : '#fff',
              }}>
              <span style={{ fontSize:14 }}>{CORE_PERSONA_EMOJIS[p]}</span>
              <span style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color: isActive ? color : '#9ca3af', letterSpacing:'0.1em', fontWeight: isActive ? 600 : 400 }}>
                {PERSONA_LABELS[p]}
              </span>
            </button>
          );
        })}
        {stayState.active && (
          <button onClick={() => setStayState(prev => ({ ...prev, style: prev.style === 'balanced' ? 'pure' : 'balanced' }))}
            style={{ fontFamily:"'Space Mono', monospace", fontSize:8, color:'#9ca3af', background:'transparent', border:'1px solid #e5e7eb', borderRadius:4, padding:'4px 8px', cursor:'pointer', marginLeft:8 }}>
            {stayState.style === 'balanced' ? 'balanced' : 'pure'}
          </button>
        )}
      </div>

      {/* Stay mode バナー */}
      {stayState.active && (
        <div style={{ textAlign:'center', padding:'6px 20px', background: CORE_PERSONA_COLORS[stayState.persona] + '10', borderBottom: `1px solid ${CORE_PERSONA_COLORS[stayState.persona]}30` }}>
          <span style={{ fontFamily:"'Space Mono', monospace", fontSize:10, color: CORE_PERSONA_COLORS[stayState.persona], letterSpacing:'0.12em' }}>
            {CORE_PERSONA_EMOJIS[stayState.persona]} {PERSONA_LABELS[stayState.persona]}と対話中
          </span>
        </div>
      )}

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
                  {msg.stayMain && msg.stayPersona ? (
                    /* Stay mode メッセージ */
                    <>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                        <div style={{ width:28, height:28, borderRadius:'50%', background: CORE_PERSONA_COLORS[msg.stayPersona] + '22', border:`1.5px solid ${CORE_PERSONA_COLORS[msg.stayPersona]}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>
                          {CORE_PERSONA_EMOJIS[msg.stayPersona]}
                        </div>
                        <div style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color: CORE_PERSONA_COLORS[msg.stayPersona], letterSpacing:'0.15em', textTransform:'uppercase' }}>
                          {PERSONA_LABELS[msg.stayPersona]}
                        </div>
                      </div>
                      <div style={{ borderLeft:`2px solid ${CORE_PERSONA_COLORS[msg.stayPersona]}`, paddingLeft:16, fontSize:14, lineHeight:2, color:'#374151' }}>
                        {msg.stayMain}
                      </div>
                      {/* Whispers（balanced mode） */}
                      {msg.stayWhispers && msg.stayWhispers.length > 0 && (
                        <div style={{ marginTop:10 }}>
                          <button onClick={() => setWhisperOpen(prev => ({ ...prev, [i]: !prev[i] }))}
                            style={{ fontFamily:"'Space Mono', monospace", fontSize:8, color:'#9ca3af', background:'transparent', border:'1px solid #e5e7eb', borderRadius:2, padding:'3px 8px', cursor:'pointer' }}>
                            {whisperOpen[i] ? '▲ 他の声を閉じる' : '▼ 他の声も聞く'}
                          </button>
                          {whisperOpen[i] && (
                            <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:4 }}>
                              {msg.stayWhispers.map((w, wi) => {
                                const wPersona = w.persona as Persona;
                                return (
                                  <div key={wi} style={{ display:'flex', alignItems:'flex-start', gap:6, paddingLeft:8 }}>
                                    <span style={{ fontSize:11, flexShrink:0 }}>{CORE_PERSONA_EMOJIS[wPersona] || '💬'}</span>
                                    <span style={{ fontSize:11, color:'#9ca3af', lineHeight:1.6 }}>
                                      <span style={{ fontFamily:"'Space Mono', monospace", fontSize:8, color: CORE_PERSONA_COLORS[wPersona] || '#9ca3af', marginRight:4 }}>{PERSONA_LABELS[wPersona] || w.persona}</span>
                                      {w.text}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : msg.isEmi ? (
                    /* エミ専用メッセージ（ターン2: エミのみ + Zen CTA） */
                    <>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                        <div style={{ width:28, height:28, borderRadius:'50%', background:'#fef3c720', border:'1.5px solid #eab308', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>
                          ⚡
                        </div>
                        <span style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#eab308', letterSpacing:'0.15em', textTransform:'uppercase' }}>エミ</span>
                      </div>
                      <div style={{ borderLeft:'2px solid #eab308', paddingLeft:16, fontSize:14, lineHeight:2, color:'#374151', fontStyle:'italic' }}>
                        {msg.emiLine}
                      </div>
                      {msg.emiShowZenCta && (
                        <div style={{ marginTop:12, padding:'10px 14px', background:'#faf5ff', border:'1px solid #e9d5ff', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                          <span style={{ fontSize:12, color:'#7c3aed' }}>内側を整理してみない？</span>
                          <button onClick={() => handleZenClick({ conflict: msg.emiConflict, deepFeeling: msg.emiDeepFeeling })}
                            style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#7c3aed', background:'transparent', border:'1px solid #c4b5fd', borderRadius:2, padding:'6px 12px', cursor:'pointer' }}>
                            Zen を開く →
                          </button>
                        </div>
                      )}
                    </>
                  ) : msg.talkPersona && msg.talkResponse ? (
                    /* Talk 1人格返答 */
                    <TalkResponse
                      persona={msg.talkPersona}
                      response={msg.talkResponse}
                      identityState={msg.identityState}
                      gapIntensity={msg.gapIntensity}
                      responseStrategy={msg.responseStrategy}
                    />
                  ) : (
                    /* フォールバック：テキストのみ */
                    <>
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
                    </>
                  )}
                  {/* エミの割り込み（ターン1: 通常人格の下に表示） */}
                  {msg.emiLine && !msg.isEmi && (
                    <div style={{ marginTop:12, paddingLeft:4 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                        <span style={{ fontSize:12, color:'#eab308' }}>⚡</span>
                        <span style={{ fontFamily:"'Space Mono', monospace", fontSize:8, color:'#eab308', letterSpacing:'0.12em', textTransform:'uppercase' }}>エミ</span>
                      </div>
                      <div style={{ borderLeft:'2px solid #eab308', paddingLeft:14, fontSize:13, lineHeight:1.9, color:'#6b7280', fontStyle:'italic' }}>
                        {msg.emiLine}
                      </div>
                    </div>
                  )}
                  {msg.showZen && !msg.emiLine && (
                    <div style={{ marginTop:12, padding:'10px 14px', background:'#faf5ff', border:'1px solid #e9d5ff', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                      <span style={{ fontSize:12, color:'#7c3aed' }}>
                        {msg.stayPersona ? '他の視点も見てみる？' : '少しだけ、見方を変えてみる？'}
                      </span>
                      <button onClick={msg.stayPersona ? exitStayMode : () => handleZenClick()}
                        style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#7c3aed', background:'transparent', border:'1px solid #c4b5fd', borderRadius:2, padding:'6px 12px', cursor:'pointer' }}>
                        {msg.stayPersona ? '4人格モードに戻る →' : 'Zen を開く →'}
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
        <div style={{ maxWidth:680, margin:'4px auto 0', display:'flex', justifyContent:'center', alignItems:'center', gap:12 }}>
          <span style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#d1d5db', letterSpacing:'0.1em' }}>
            Enter で送信 // Shift+Enter で改行
          </span>
          {showDiagnosisBanner ? (
            <button onClick={() => router.push('/kokoro-diagnosis')}
              style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#7c3aed', background:'#ede9fe', border:'1px solid #c4b5fd', borderRadius:4, padding:'3px 10px', cursor:'pointer', letterSpacing:'0.05em' }}>
              💡 今の状態を見る →
            </button>
          ) : (
            <button onClick={() => router.push('/kokoro-diagnosis')}
              style={{ fontFamily:"'Space Mono', monospace", fontSize:8, color:'#9ca3af', background:'transparent', border:'1px solid #e5e7eb', borderRadius:2, padding:'2px 8px', cursor:'pointer' }}>
              今の状態を見る
            </button>
          )}
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
