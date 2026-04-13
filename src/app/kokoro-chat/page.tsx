'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getProfile } from '@/lib/profile';
import TalkResponse from '@/components/kokoro/TalkResponse';
import type { Persona, PersonaStayState } from '@/types/kokoroOutput';
import { PERSONA_LABELS, PERSONA_COLORS as CORE_PERSONA_COLORS, PERSONA_EMOJIS as CORE_PERSONA_EMOJIS } from '@/lib/kokoro/personaLabels';
import { createHonneLog } from '@/lib/kokoro/diagnosis/createHonneLog';
import { appendHonneLog, clearHonneLogs, getHonneLogs } from '@/lib/kokoro/diagnosis/honneStorage';
import { buildZenPromptFromEmi } from '@/lib/kokoro/emi';
import { inferSessionState, calcEffectiveProfileWeight } from '@/lib/kokoro/sessionState';
import { consumeNoteForTalk, buildTalkPromptFromNote } from '@/lib/kokoro/noteLinkage';
import { createRecipeInputFromTalk, setRecipeInput } from '@/lib/kokoro/recipeInput';
import { saveToWishlist, type WishCategory, type WishIntensity } from '@/lib/wishlist';
import PersonaLoading from '@/components/PersonaLoading';

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
  showNote?: boolean;
  imagePreview?: string;
  imageBase64?: string;
  imageMediaType?: string;
  stayMain?: string;
  stayPersona?: Persona;
  stayWhispers?: StayWhisper[];
  showZen?: boolean;
  topic?: string;
  userTextForNote?: string;
  helpApps?: { name: string; emoji: string; description: string }[];
  showRecipe?: boolean;
  showInsight?: boolean;
  // meta 由来の追加バナー（spec: for_claude_code_routing.md）
  showPlan?: boolean;
  showWriter?: boolean;
  showBrowser?: boolean;
  showCouple?: boolean;
  showBuddy?: boolean;
  showPhilosophy?: boolean;
  showBoard?: boolean;
  showKami?: boolean;
  showPonchi?: boolean;
  showGatekeeper?: boolean;
  showStrategy?: boolean;
  showWorld?: boolean;
  // ウィッシュリスト追加バナー
  showWishlist?: boolean;
  wishlistText?: string;
  wishlistCategory?: WishCategory;
  wishlistIntensity?: WishIntensity;
  // バナー click 時に sessionStorage に渡すためのソースデータ
  routingUserText?: string;       // 最後のユーザー発言テキスト
  routingHistoryShort?: string;   // 会話履歴テキスト（最新5件）
  routingHistoryLong?: string;    // 会話履歴テキスト（最新10件）
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
  const [turnCount, setTurnCount] = useState(0);
  const [linkedNote, setLinkedNote] = useState<{ id?: string; title?: string; body?: string; topic?: string; insightType?: string; emotionTone?: string } | null>(null);
  const [savedWishIds, setSavedWishIds] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const handleAddToWishlist = async (msgIndex: number, msg: Message) => {
    if (!msg.wishlistText) return;
    const result = await saveToWishlist({
      text: msg.wishlistText,
      category: msg.wishlistCategory,
      intensity: msg.wishlistIntensity,
      source: 'Talk',
    });
    if (result) {
      setSavedWishIds(prev => new Set(prev).add(msgIndex));
      showToast('ウィッシュリストに追加しました');
    } else {
      showToast('保存に失敗しました');
    }
  };
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

    // Wishlist → Talk 遷移
    const wishData = sessionStorage.getItem('wishlistToTalk');
    if (wishData) {
      sessionStorage.removeItem('wishlistToTalk');
      try {
        const { userText } = JSON.parse(wishData);
        if (typeof userText === 'string' && userText) {
          setTimeout(() => { setInput(userText); }, 300);
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
    if (!imgData || !imgType) {
      // 画像なしの場合は直接遷移（Animal側でアップロード待ち）
      router.push('/kokoro-animal');
      return;
    }
    sessionStorage.setItem('animalTalkImage', JSON.stringify({
      base64: imgData,
      mediaType: imgType,
    }));
    router.push('/kokoro-animal');
  };

  /* ── 明示的アプリ名検出（パターンA）── */
  const EXPLICIT_APP_NAMES: Record<string, string[]> = {
    zen:        ['zen', 'ゼン'],
    recipe:     ['recipe', 'レシピ'],
    note:       ['note', 'ノート', 'メモ'],
    insight:    ['insight', 'インサイト'],
    plan:       ['plan', 'プラン'],
    writer:     ['writer', 'ライター'],
    fashion:    ['fashion', 'ファッション'],
    animal:     ['animal', 'アニマル'],
    couple:     ['couple', 'カップル'],
    buddy:      ['buddy', 'バディ'],
    philosophy: ['philosophy', 'フィロソフィ', 'philo', 'フィロ'],
    board:      ['board', 'ボード'],
    kami:       ['kami', 'カミ'],
    ponchi:     ['ponchi', 'ポンチ'],
    browser:    ['browser', 'ブラウザ'],
    wishlist:   ['wishlist', 'ウィッシュ'],
    strategy:   ['strategy', 'ストラテジー'],
    world:      ['world', 'ワールド'],
  };

  const detectExplicitApps = (text: string): Set<string> => {
    const lower = text.toLowerCase();
    const result = new Set<string>();
    for (const [app, names] of Object.entries(EXPLICIT_APP_NAMES)) {
      if (names.some(n => lower.includes(n.toLowerCase()))) result.add(app);
    }
    return result;
  };

  // 文脈からのアプリ推定
  const CONTEXT_PATTERNS: Record<string, RegExp> = {
    buddy:      /企画|アイデア|ブレスト|壁打ち|発想|思いつ/,
    plan:       /タスク|目標|やること|計画|段取り|スケジュール|to.?do/i,
    zen:        /悩み|モヤモヤ|もやもや|しんどい|つらい|不安|苦しい|落ち込/,
    writer:     /文章.*(書|整|直|編集)|書きたい|整えたい|リライト|推敲/,
    recipe:     /料理|献立|食事|ご飯|レシピ|作り置き|晩ご飯|昼ご飯/,
    fashion:    /ファッション|服|コーデ|着こなし|コーディネート|何着/,
    insight:    /作品|音楽|映画|本|漫画|アニメ|ドラマ|レビュー|感想|評価/,
    note:       /メモ|記録|残し|書き留|日記/,
    couple:     /パートナー|彼氏|彼女|恋人|夫|妻|カップル|恋愛|付き合/,
    philosophy: /哲学|思想|深い問い|人生の意味|存在|本質/,
    board:      /会議|ミーティング|アジェンダ|議題|進行|ファシリ/,
    strategy:   /企画書|提案書|報告書|資料.*(統合|まとめ)|一本.*(まとめ|統合)/,
    world:      /デモ.*(作|生成|ページ)|動くページ|プロトタイプ.*(作|生成)|ランディング.*(作|生成)/,
  };

  const detectContextApps = (text: string): Set<string> => {
    const result = new Set<string>();
    for (const [app, pattern] of Object.entries(CONTEXT_PATTERNS)) {
      if (pattern.test(text)) result.add(app);
    }
    return result;
  };

  /* ── ヘルプ機能：アプリ紹介 ── */
  const APP_INTRODUCTIONS: { name: string; emoji: string; description: string }[] = [
    { name: 'Talk', emoji: '💬', description: '気持ちや考えを話しかけるだけで、AIが応答します' },
    { name: 'Zen', emoji: '🧘', description: '会話を深掘りして思考を整理します' },
    { name: 'Note', emoji: '📝', description: '日記・メモ・記録を残せます' },
    { name: 'Fashion', emoji: '👗', description: 'コーデを処方します' },
    { name: 'Recipe', emoji: '🍳', description: '今週の献立を生成します' },
    { name: 'Insight', emoji: '🔍', description: '作品のインパクトを分析します' },
    { name: 'Writer', emoji: '✍️', description: '文章をモダンにレイアウトします' },
    { name: 'Plan', emoji: '📋', description: '目標をタスクに分解します' },
    { name: 'Browser', emoji: '🌐', description: '保存したNoteをタイムラインで見られます' },
    { name: 'Couple', emoji: '❤️', description: 'パートナーへの相談・提案をします' },
    { name: 'Buddy', emoji: '🎧', description: 'アイデアを一緒に広げます' },
    { name: 'Philo', emoji: '💭', description: '哲学的な問いを探究します' },
    { name: 'Board', emoji: '📊', description: '会議の進行を整理します' },
    { name: 'Kami', emoji: '📄', description: '表やデータを整理します' },
    { name: 'Ponchi', emoji: '🎨', description: 'コンセプトをスライド構成に変換します' },
    { name: 'Animal', emoji: '🐾', description: '動物の気持ちを読み取ります' },
    { name: 'Strategy', emoji: '⚡', description: 'Writer・Kami・Ponchiの出力を統合して企画書を生成します' },
    { name: 'World', emoji: '🌍', description: '企画書から動くデモページを自動生成します' },
    { name: 'Wishlist', emoji: '🌟', description: '欲しいものや行きたい場所を記録します' },
  ];

  const detectHelpIntent = (text: string): boolean => {
    const lower = text.toLowerCase();
    const helpPatterns = [
      'kokoro os', 'ココロos', 'こころos', 'kokoroos',
      '何ができる', 'なにができる', 'できること',
      'アプリ一覧', 'アプリを教え', '機能一覧', '機能を教え',
      'どんなアプリ', 'どんな機能', '使い方',
      'kokoro osって', 'これって何', 'このアプリ', 'このosは',
    ];
    return helpPatterns.some(p => lower.includes(p.toLowerCase()));
  };

  const getRandomApps = (count: number) => {
    const shuffled = [...APP_INTRODUCTIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  };

  const openFashion = async () => {
    const profile = await getProfile();
    const lastImageMsg = [...messages].reverse().find(m => m.imageBase64);
    sessionStorage.setItem('fashionIntent', JSON.stringify({
      fromTalk: true,
      autoAnalyze: true,
      profile,
      imageBase64: lastImageMsg?.imageBase64 ?? null,
      imageMediaType: lastImageMsg?.imageMediaType ?? null,
    }));
    router.push('/kokoro-fashion');
  };

  // プロフィール収集は /kokoro-profile で管理するため Talk では行わない

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

  /* ── sessionStorage ルーティング（spec: for_claude_code_routing.md） ──
     渡されるデータは Message に保持済みのスナップショット（routingUserText など）。
     キーは仕様の `xxxFromTalk`。各アプリ側は次セッションで読み出し処理を実装する。 */
  const routeFromTalk = (
    targetKey: string,
    targetUrl: string,
    payload: Record<string, unknown>,
  ) => {
    try {
      sessionStorage.setItem(targetKey, JSON.stringify(payload));
    } catch {
      /* QuotaExceeded などは握りつぶして遷移は行う */
    }
    router.push(targetUrl);
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setTurnCount(prev => prev + 1);

    try {
      // ヘルプ検出：Kokoro OS についての質問は専用返答
      if (detectHelpIntent(text)) {
        const apps = getRandomApps(3);
        const helpReply = 'Kokoro OSは、あなたの日常・創作・思考を静かに支えるAI OSです。\nテキストを入れてYoroshikuボタンを押すだけで使えます。\n\nいくつかのアプリを紹介しますね。';
        const aiMsg: Message = {
          role: 'ai',
          content: helpReply,
          talkPersona: 'gnome' as Persona,
          talkResponse: helpReply,
          helpApps: apps,
        };
        setMessages(prev => [...prev, aiMsg]);
        setIsLoading(false);
        setTimeout(() => textareaRef.current?.focus(), 100);
        return;
      }

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

      // session_state推定とprofileWeight計算
      const recentTexts = messages.filter(m => m.role === 'user').slice(-5).map(m => m.content);
      const sessionState = inferSessionState(recentTexts);
      const effectiveProfileWeight = calcEffectiveProfileWeight({
        currentMessage: text,
        turnCount,
        sessionState,
      });
      const profile = await getProfile();

      // Note連携
      const noteContext = linkedNote ? {
        noteId: linkedNote.id,
        title: linkedNote.title,
        body: linkedNote.body,
        topic: linkedNote.topic,
      } : undefined;

      const res = await fetch('/api/kokoro-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: apiHistory,
          imageBase64: attachedImage || undefined,
          mediaType: attachedMediaType || undefined,
          profile,
          sessionState,
          effectiveProfileWeight,
          turnCount,
          noteContext,
        }),
      });

      if (linkedNote) setLinkedNote(null);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // 履歴スナップショット（バナークリック時に渡す素材）
      const allTurns = [...messages, userMsg];
      const fmtHistory = (n: number) =>
        allTurns.slice(-n).map(m => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.content}`).join('\n');
      const routingUserText = text;
      const routingHistoryShort = fmtHistory(5);
      const routingHistoryLong = fmtHistory(10);

      const savedImage = attachedImage;
      const savedMediaType = attachedMediaType;
      const savedPreview = attachedPreview;
      clearAttachment();

      const replyText = data.response || '';

      // 明示的なアプリ名指定
      const explicitApps = detectExplicitApps(text);
      const hasImage = !!(savedImage && savedMediaType);

      // 文脈からのアプリ推定
      const contextApps = detectContextApps(text);

      // wishlist は meta から wishlist_item が必要
      const meta = (data.meta ?? {}) as Record<string, boolean | number | string | null>;
      const wishItem = (meta as { wishlist_item?: { text: string; category: WishCategory; intensity: WishIntensity } | null }).wishlist_item ?? null;

      const has = (app: string) => explicitApps.has(app) || contextApps.has(app);

      const metaFields: Partial<Message> = {
        showZen:        has('zen') || undefined,
        showAnimal:     has('animal') || undefined,
        showFashion:    has('fashion') || undefined,
        showNote:       has('note') || undefined,
        showRecipe:     has('recipe') || undefined,
        showInsight:    has('insight') || undefined,
        showPlan:       has('plan') || undefined,
        showWriter:     has('writer') || undefined,
        showBrowser:    has('browser') || undefined,
        showCouple:     has('couple') || undefined,
        showBuddy:      has('buddy') || undefined,
        showPhilosophy: has('philosophy') || undefined,
        showBoard:      has('board') || undefined,
        showKami:       has('kami') || undefined,
        showPonchi:     has('ponchi') || undefined,
        showGatekeeper: has('gatekeeper') || undefined,
        showStrategy:   has('strategy') || undefined,
        showWorld:      has('world') || undefined,
        showWishlist:   (has('wishlist') && !!wishItem?.text) || undefined,
        wishlistText:     explicitApps.has('wishlist') && wishItem ? wishItem.text : undefined,
        wishlistCategory: explicitApps.has('wishlist') && wishItem ? wishItem.category : undefined,
        wishlistIntensity: explicitApps.has('wishlist') && wishItem ? wishItem.intensity : undefined,
        routingUserText,
        routingHistoryShort,
        routingHistoryLong,
      };

      // 本音ログ保存
      if (data.honneLog) {
        const log = createHonneLog({
          ...data.honneLog,
          sourceMode: stayState.active ? 'stay' : 'normal',
          activePersona: stayState.active ? stayState.persona : undefined,
        });
        appendHonneLog(log);
      }

      // 通常応答
      const aiMsg: Message = {
        role: 'ai',
        content: replyText,
        talkPersona: (data.persona || 'gnome') as Persona,
        talkResponse: replyText,
        ...metaFields,
        imagePreview: savedPreview || undefined,
        imageBase64: savedImage || undefined,
        imageMediaType: savedMediaType || undefined,
        topic: data.honneLog?.topic,
        userTextForNote: text,
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
            title="履歴をクリア"
            style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#9ca3af', background:'transparent', border:'1px solid #e5e7eb', borderRadius:2, padding:'4px 10px', cursor:'pointer' }}>
            History ×
          </button>
          <button onClick={() => { localStorage.removeItem('kokoroProfile'); }}
            title="プロフィールをクリア"
            style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#9ca3af', background:'transparent', border:'1px solid #e5e7eb', borderRadius:2, padding:'4px 10px', cursor:'pointer' }}>
            Profile ×
          </button>
          <button onClick={() => { clearHonneLogs(); }}
            title="本音ログをクリア"
            style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#9ca3af', background:'transparent', border:'1px solid #e5e7eb', borderRadius:2, padding:'4px 10px', cursor:'pointer' }}>
            Honne ×
          </button>
        </div>
      </header>

      {/* 人格選択バー（アイコンのみ・5人格） */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'8px 20px', borderBottom:'1px solid #f3f4f6', background:'#fafafa' }}>
        {stayState.active && (
          <button onClick={exitStayMode}
            title="全人格モードに戻る"
            style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#7c3aed', background:'#ede9fe', border:'1px solid #c4b5fd', borderRadius:4, padding:'4px 10px', cursor:'pointer', marginRight:8 }}>
            ←
          </button>
        )}
        {(['gnome', 'shin', 'canon', 'dig', 'emi'] as Persona[]).map(p => {
          const isActive = stayState.active && stayState.persona === p;
          const color = CORE_PERSONA_COLORS[p];
          return (
            <button key={p}
              onClick={() => stayState.active && stayState.persona === p ? exitStayMode() : enterStayMode(p)}
              title={PERSONA_LABELS[p]}
              style={{
                display:'flex', alignItems:'center', justifyContent:'center',
                width: 36, height: 36, padding: 0,
                border: isActive ? `2px solid ${color}` : '1px solid #e5e7eb',
                borderRadius: '50%', cursor:'pointer', transition:'all .15s',
                background: isActive ? color + '15' : '#fff',
              }}>
              <span style={{ fontSize: 16 }}>{CORE_PERSONA_EMOJIS[p]}</span>
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

      {/* Stay mode バナー（アイコンのみ） */}
      {stayState.active && (
        <div style={{ textAlign:'center', padding:'6px 20px', background: CORE_PERSONA_COLORS[stayState.persona] + '10', borderBottom: `1px solid ${CORE_PERSONA_COLORS[stayState.persona]}30` }}>
          <span style={{ fontSize: 16 }}>{CORE_PERSONA_EMOJIS[stayState.persona]}</span>
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
                        <div title={PERSONA_LABELS[msg.stayPersona]} style={{ width:28, height:28, borderRadius:'50%', background: CORE_PERSONA_COLORS[msg.stayPersona] + '22', border:`1.5px solid ${CORE_PERSONA_COLORS[msg.stayPersona]}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>
                          {CORE_PERSONA_EMOJIS[msg.stayPersona]}
                        </div>
                      </div>
                      <div style={{ borderLeft:`2px solid ${CORE_PERSONA_COLORS[msg.stayPersona]}`, paddingLeft:16, fontSize:14, lineHeight:2, color:'#374151' }}>
                        {msg.stayMain}
                      </div>
                      {/* Whispers（balanced mode） */}
                      {msg.stayWhispers && msg.stayWhispers.length > 0 && (
                        <div style={{ marginTop:10 }}>
                          <button onClick={() => setWhisperOpen(prev => ({ ...prev, [i]: !prev[i] }))}
                            title={whisperOpen[i] ? '他の声を閉じる' : '他の声も聞く'}
                            style={{ fontFamily:"'Space Mono', monospace", fontSize:8, color:'#9ca3af', background:'transparent', border:'1px solid #e5e7eb', borderRadius:2, padding:'3px 8px', cursor:'pointer' }}>
                            {whisperOpen[i] ? '▲' : 'Details ▼'}
                          </button>
                          {whisperOpen[i] && (
                            <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:4 }}>
                              {msg.stayWhispers.map((w, wi) => {
                                const wPersona = w.persona as Persona;
                                return (
                                  <div key={wi} style={{ display:'flex', alignItems:'flex-start', gap:6, paddingLeft:8 }}>
                                    <span title={PERSONA_LABELS[wPersona] || w.persona} style={{ fontSize:11, flexShrink:0 }}>{CORE_PERSONA_EMOJIS[wPersona] || '💬'}</span>
                                    <span style={{ fontSize:11, color:'#9ca3af', lineHeight:1.6 }}>
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
                  ) : msg.talkPersona && msg.talkResponse ? (
                    /* Talk 1人格返答 */
                    <TalkResponse
                      persona={msg.talkPersona}
                      response={msg.talkResponse}
                      showRecipe={msg.showRecipe}
                      onSaveRecipe={() => {
                        const recipeInput = createRecipeInputFromTalk({
                          summary: msg.talkResponse ?? '',
                          emotionTone: undefined,
                          topic: msg.topic,
                        });
                        setRecipeInput(recipeInput);
                        router.push('/kokoro-recipe');
                      }}
                    />
                  ) : (
                    /* フォールバック：テキストのみ */
                    <>
                      {msg.personaId && (
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                          <div title={PERSONA_NAMES[msg.personaId] || msg.personaId} style={{ width:28, height:28, borderRadius:'50%', background: PERSONA_COLORS[msg.personaId] + '22', border:`1.5px solid ${PERSONA_COLORS[msg.personaId] || '#7c3aed'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>
                            {PERSONA_EMOJIS[msg.personaId] || '💬'}
                          </div>
                        </div>
                      )}
                      <div style={{ borderLeft:'2px solid #e5e7eb', paddingLeft:16, fontSize:14, lineHeight:2, color:'#374151' }}>
                        {msg.content}
                      </div>
                    </>
                  )}
                  {/* アプリ誘導ボタン（ボタンのみ） */}
                  {(msg.showZen || msg.showAnimal || msg.showFashion || msg.showNote || msg.showInsight || msg.showPlan || msg.showWriter || msg.showBrowser || msg.showCouple || msg.showBuddy || msg.showPhilosophy || msg.showBoard || msg.showKami || msg.showPonchi || msg.showGatekeeper || msg.showStrategy || msg.showWorld || msg.showWishlist) && (
                    <div style={{ marginTop:10, display:'flex', flexWrap:'wrap', gap:6 }}>
                      {msg.showZen && (
                        <button onClick={msg.stayPersona ? exitStayMode : () => handleZenClick()}
                          style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#7c3aed', background:'transparent', border:'1px solid #c4b5fd', borderRadius:4, padding:'5px 12px', cursor:'pointer' }}>
                          {msg.stayPersona ? '← Personas' : 'Zen →'}
                        </button>
                      )}
                      {msg.showAnimal && (
                        <button onClick={() => openAnimalTalk(msg)}
                          style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#7c3aed', background:'transparent', border:'1px solid #c4b5fd', borderRadius:4, padding:'5px 12px', cursor:'pointer' }}>
                          Animal →
                        </button>
                      )}
                      {msg.showFashion && (
                        <button onClick={openFashion}
                          style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#7c3aed', background:'transparent', border:'1px solid #c4b5fd', borderRadius:4, padding:'5px 12px', cursor:'pointer' }}>
                          Fashion →
                        </button>
                      )}
                      {msg.showNote && (
                        <button onClick={() => { window.location.href = '/kokoro-note?mode=create'; }}
                          style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#7c3aed', background:'transparent', border:'1px solid #c4b5fd', borderRadius:4, padding:'5px 12px', cursor:'pointer' }}>
                          Note →
                        </button>
                      )}
                      {msg.showInsight && (
                        <button onClick={() => router.push('/kokoro-insight')}
                          style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#7c3aed', background:'transparent', border:'1px solid #c4b5fd', borderRadius:4, padding:'5px 12px', cursor:'pointer' }}>
                          Insight →
                        </button>
                      )}
                      {msg.showRecipe && (
                        <button onClick={() => router.push('/kokoro-recipe')}
                          style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#7c3aed', background:'transparent', border:'1px solid #c4b5fd', borderRadius:4, padding:'5px 12px', cursor:'pointer' }}>
                          Recipe →
                        </button>
                      )}
                      {msg.showPlan && (
                        <button onClick={() => routeFromTalk('planFromTalk', '/kokoro-plan', { userText: msg.routingUserText })}
                          style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#7c3aed', background:'transparent', border:'1px solid #c4b5fd', borderRadius:4, padding:'5px 12px', cursor:'pointer' }}>
                          Plan →
                        </button>
                      )}
                      {msg.showWriter && (
                        <button onClick={() => routeFromTalk('writerFromTalk', '/kokoro-writer', { userText: msg.routingUserText })}
                          style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#7c3aed', background:'transparent', border:'1px solid #c4b5fd', borderRadius:4, padding:'5px 12px', cursor:'pointer' }}>
                          Writer →
                        </button>
                      )}
                      {msg.showBrowser && (
                        <button onClick={() => routeFromTalk('browserFromTalk', '/kokoro-browser', { userText: msg.routingUserText })}
                          style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#7c3aed', background:'transparent', border:'1px solid #c4b5fd', borderRadius:4, padding:'5px 12px', cursor:'pointer' }}>
                          Browser →
                        </button>
                      )}
                      {msg.showCouple && (
                        <button onClick={() => routeFromTalk('coupleFromTalk', '/kokoro-couple', { userText: msg.routingUserText })}
                          style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#7c3aed', background:'transparent', border:'1px solid #c4b5fd', borderRadius:4, padding:'5px 12px', cursor:'pointer' }}>
                          Couple →
                        </button>
                      )}
                      {msg.showBuddy && (
                        <button onClick={() => routeFromTalk('buddyFromTalk', '/kokoro-buddy', { userText: msg.routingUserText })}
                          style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#7c3aed', background:'transparent', border:'1px solid #c4b5fd', borderRadius:4, padding:'5px 12px', cursor:'pointer' }}>
                          Buddy →
                        </button>
                      )}
                      {msg.showPhilosophy && (
                        <button onClick={() => routeFromTalk('philoFromTalk', '/kokoro-philo', { userText: msg.routingUserText })}
                          style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#7c3aed', background:'transparent', border:'1px solid #c4b5fd', borderRadius:4, padding:'5px 12px', cursor:'pointer' }}>
                          Philo →
                        </button>
                      )}
                      {msg.showBoard && (
                        <button onClick={() => routeFromTalk('boardFromTalk', '/kokoro-board', { userText: msg.routingUserText })}
                          style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#7c3aed', background:'transparent', border:'1px solid #c4b5fd', borderRadius:4, padding:'5px 12px', cursor:'pointer' }}>
                          Board →
                        </button>
                      )}
                      {msg.showKami && (
                        <button onClick={() => routeFromTalk('kamiFromTalk', '/kokoro-kami', { userText: msg.routingUserText })}
                          style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#7c3aed', background:'transparent', border:'1px solid #c4b5fd', borderRadius:4, padding:'5px 12px', cursor:'pointer' }}>
                          Kami →
                        </button>
                      )}
                      {msg.showPonchi && (
                        <button onClick={() => routeFromTalk('ponchiFromTalk', '/kokoro-ponchi', { userText: msg.routingUserText })}
                          style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#7c3aed', background:'transparent', border:'1px solid #c4b5fd', borderRadius:4, padding:'5px 12px', cursor:'pointer' }}>
                          Ponchi →
                        </button>
                      )}
                      {msg.showGatekeeper && (
                        <button onClick={() => router.push('/kokoro-gatekeeper')}
                          style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#6366f1', background:'transparent', border:'1px solid rgba(99,102,241,0.4)', borderRadius:4, padding:'5px 12px', cursor:'pointer' }}>
                          Gatekeeper →
                        </button>
                      )}
                      {msg.showStrategy && (
                        <button onClick={() => router.push('/kokoro-strategy')}
                          style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#f59e0b', background:'transparent', border:'1px solid rgba(245,158,11,0.4)', borderRadius:4, padding:'5px 12px', cursor:'pointer' }}>
                          Strategy →
                        </button>
                      )}
                      {msg.showWorld && (
                        <button onClick={() => router.push('/kokoro-world')}
                          style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color:'#10b981', background:'transparent', border:'1px solid rgba(16,185,129,0.4)', borderRadius:4, padding:'5px 12px', cursor:'pointer' }}>
                          World →
                        </button>
                      )}
                      {msg.showWishlist && msg.wishlistText && (
                        <button onClick={() => handleAddToWishlist(i, msg)} disabled={savedWishIds.has(i)}
                          style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.1em', color: savedWishIds.has(i) ? '#9ca3af' : '#ec4899', background:'transparent', border:`1px solid ${savedWishIds.has(i) ? '#e5e7eb' : 'rgba(244,114,182,0.4)'}`, borderRadius:4, padding:'5px 12px', cursor: savedWishIds.has(i) ? 'default' : 'pointer' }}>
                          {savedWishIds.has(i) ? 'Wish ✓' : 'Wish +'}
                        </button>
                      )}
                    </div>
                  )}
                  {/* ヘルプ：アプリ紹介カード */}
                  {msg.helpApps && msg.helpApps.length > 0 && (
                    <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:6 }}>
                      <span style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#9ca3af', letterSpacing:'0.1em' }}>
                        KOKORO APPS
                      </span>
                      {msg.helpApps.map((app, ai) => (
                        <div key={ai} style={{
                          display:'flex', alignItems:'center', gap:10,
                          padding:'8px 12px', background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:8,
                        }}>
                          <span style={{ fontSize:18, flexShrink:0 }}>{app.emoji}</span>
                          <div>
                            <span style={{ fontFamily:"'Space Mono', monospace", fontSize:11, fontWeight:600, color:'#1a1a1a' }}>{app.name}</span>
                            <span style={{ fontSize:12, color:'#6b7280', marginLeft:8 }}>{app.description}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* ローディング */}
          {isLoading && <PersonaLoading />}

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
        {/* クイックアクセスアイコン */}
        <div style={{
          maxWidth: 680, margin: '0 auto 6px',
          display: 'flex', gap: 2, overflowX: 'auto',
          scrollbarWidth: 'none', msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        }}>
          <style>{`.quick-access::-webkit-scrollbar{display:none}`}</style>
          {([
            { emoji: '🧘', name: 'Zen', href: '/kokoro-zen' },
            { emoji: '📝', name: 'Note', href: '/kokoro-note' },
            { emoji: '👗', name: 'Fashion', href: '/kokoro-fashion' },
            { emoji: '🍳', name: 'Recipe', href: '/kokoro-recipe' },
            { emoji: '🔍', name: 'Insight', href: '/kokoro-insight' },
            { emoji: '✍️', name: 'Writer', href: '/kokoro-writer' },
            { emoji: '📋', name: 'Plan', href: '/kokoro-plan' },
            { emoji: '🌐', name: 'Browser', href: '/kokoro-browser' },
            { emoji: '❤️', name: 'Couple', href: '/kokoro-couple' },
            { emoji: '🎧', name: 'Buddy', href: '/kokoro-buddy' },
            { emoji: '💭', name: 'Philo', href: '/kokoro-philo' },
            { emoji: '📊', name: 'Board', href: '/kokoro-board' },
            { emoji: '📄', name: 'Kami', href: '/kokoro-kami' },
            { emoji: '🎨', name: 'Ponchi', href: '/kokoro-ponchi' },
            { emoji: '⚡', name: 'Strategy', href: '/kokoro-strategy' },
            { emoji: '🌍', name: 'World', href: '/kokoro-world' },
            { emoji: '🐾', name: 'Animal', href: '/kokoro-animal' },
            { emoji: '🌟', name: 'Wishlist', href: '/kokoro-wishlist' },
          ] as const).map(app => (
            <button
              key={app.href}
              onClick={() => router.push(app.href)}
              title={app.name}
              className="quick-access"
              style={{
                flexShrink: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 1,
                width: 42, padding: '4px 0',
                background: 'transparent', border: 'none',
                borderRadius: 8, cursor: 'pointer',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>{app.emoji}</span>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 7, color: '#9ca3af', lineHeight: 1, whiteSpace: 'nowrap' }}>{app.name}</span>
            </button>
          ))}
        </div>

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
        </div>
      </div>

      {toast && (
        <div style={{
          position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)',
          background:'#1a1a1a', color:'#fff', padding:'10px 18px', borderRadius:8,
          fontSize:13, fontFamily:"'Noto Sans JP', sans-serif",
          boxShadow:'0 4px 12px rgba(0,0,0,0.18)', zIndex:9999,
          animation:'fadeIn 0.2s ease-out',
        }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
      `}</style>
    </div>
  );
}
