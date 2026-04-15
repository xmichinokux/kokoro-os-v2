'use client';

import { createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { getProfile } from '@/lib/profile';
import { inferSessionState, calcEffectiveProfileWeight } from '@/lib/kokoro/sessionState';
import { createHonneLog } from '@/lib/kokoro/diagnosis/createHonneLog';
import { appendHonneLog } from '@/lib/kokoro/diagnosis/honneStorage';
import type { WishCategory, WishIntensity } from '@/lib/wishlist';

/* ── 型定義 ── */
export type TalkMessage = {
  role: 'user' | 'ai';
  content: string;
  personaId?: string;
  syncRate?: number;
  topic?: string;
  // meta由来のルーティングバナー
  showZen?: boolean;
  showPlan?: boolean;
  showWriter?: boolean;
  showBrowser?: boolean;
  showNote?: boolean;
  showRecipe?: boolean;
  showInsight?: boolean;
  showCouple?: boolean;
  showBuddy?: boolean;
  showPhilosophy?: boolean;
  showBoard?: boolean;
  showKami?: boolean;
  showPonchi?: boolean;
  showGatekeeper?: boolean;
  showBuilder?: boolean;
  showStrategy?: boolean;
  showWorld?: boolean;
  showAnimal?: boolean;
  showFashion?: boolean;
  showWishlist?: boolean;
  wishlistText?: string;
  wishlistCategory?: WishCategory;
  wishlistIntensity?: WishIntensity;
  routingUserText?: string;
  routingHistoryShort?: string;
  routingHistoryLong?: string;
};

type ApiHistory = { role: string; content: string };

const CURRENT_KEY = 'talkMessages';
const HISTORY_KEY = 'talkSessionHistory';

export type TalkSession = {
  id: string;
  title: string;
  createdAt: string;
  messageCount: number;
  messages: TalkMessage[];
};

/* ── Context型 ── */
type TalkContextType = {
  messages: TalkMessage[];
  setMessages: (msgs: TalkMessage[]) => void;
  addMessage: (msg: TalkMessage) => void;
  input: string;
  setInput: (v: string) => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  sendMessage: () => Promise<void>;
  popupOpen: boolean;
  setPopupOpen: (v: boolean) => void;
  sessions: TalkSession[];
  saveAndNewSession: () => void;
  loadSession: (session: TalkSession) => void;
  deleteSession: (id: string) => void;
  // Talk ページが自身の sendMessage をオーバーライドするための ref
  sendOverrideRef: React.MutableRefObject<(() => Promise<void>) | null>;
};

const TalkCtx = createContext<TalkContextType | null>(null);

export function useTalk() {
  const ctx = useContext(TalkCtx);
  if (!ctx) throw new Error('useTalk must be used within TalkProvider');
  return ctx;
}

/* ── 明示的アプリ名検出 ── */
const EXPLICIT_APP_NAMES: Record<string, string[]> = {
  zen: ['zen', 'ゼン'], recipe: ['recipe', 'レシピ'], note: ['note', 'ノート', 'メモ'],
  insight: ['insight', 'インサイト'], plan: ['plan', 'プラン'], writer: ['writer', 'ライター'],
  fashion: ['fashion', 'ファッション'], animal: ['animal', 'アニマル'],
  couple: ['couple', 'カップル'], buddy: ['buddy', 'バディ'],
  philosophy: ['philosophy', 'フィロソフィ', 'philo', 'フィロ'],
  board: ['board', 'ボード'], kami: ['kami', 'カミ'], ponchi: ['ponchi', 'ポンチ'],
  browser: ['browser', 'ブラウザ'], wishlist: ['wishlist', 'ウィッシュ'],
  strategy: ['strategy', 'ストラテジー'], world: ['world', 'ワールド'],
};

const detectExplicitApps = (text: string): Set<string> => {
  const lower = text.toLowerCase();
  const result = new Set<string>();
  for (const [app, names] of Object.entries(EXPLICIT_APP_NAMES)) {
    if (names.some(n => lower.includes(n.toLowerCase()))) result.add(app);
  }
  return result;
};

const CONTEXT_PATTERNS: Record<string, RegExp> = {
  buddy: /企画|アイデア|ブレスト|壁打ち|発想|思いつ/,
  plan: /タスク|目標|やること|計画|段取り|スケジュール|to.?do/i,
  zen: /悩み|モヤモヤ|もやもや|しんどい|つらい|不安|苦しい|落ち込/,
  writer: /文章.*(書|整|直|編集)|書きたい|整えたい|リライト|推敲/,
  recipe: /料理|献立|食事|ご飯|レシピ|作り置き|晩ご飯|昼ご飯/,
  fashion: /ファッション|服|コーデ|着こなし|コーディネート|何着/,
  insight: /作品|音楽|映画|本|漫画|アニメ|ドラマ|レビュー|感想|評価/,
  note: /メモ|記録|残し|書き留|日記/,
  couple: /パートナー|彼氏|彼女|恋人|夫|妻|カップル|恋愛|付き合/,
  philosophy: /哲学|思想|深い問い|人生の意味|存在|本質/,
  board: /会議|ミーティング|アジェンダ|議題|進行|ファシリ/,
  strategy: /企画書|提案書|報告書|資料.*(統合|まとめ)|一本.*(まとめ|統合)/,
  world: /デモ.*(作|生成|ページ)|動くページ|プロトタイプ.*(作|生成)/,
};

const detectContextApps = (text: string): Set<string> => {
  const result = new Set<string>();
  for (const [app, pattern] of Object.entries(CONTEXT_PATTERNS)) {
    if (pattern.test(text)) result.add(app);
  }
  return result;
};

/* ── Provider ── */
export function TalkProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<TalkMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [turnCount, setTurnCount] = useState(0);
  const [sessions, setSessions] = useState<TalkSession[]>([]);
  const initialized = useRef(false);
  const sendOverrideRef = useRef<(() => Promise<void>) | null>(null);

  const addMessage = useCallback((msg: TalkMessage) => {
    setMessages(prev => [...prev, msg]);
  }, []);

  // 初期化
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    try {
      const saved = localStorage.getItem(CURRENT_KEY);
      if (saved) setMessages(JSON.parse(saved));
    } catch { /* ignore */ }
    try {
      const hist = localStorage.getItem(HISTORY_KEY);
      if (hist) setSessions(JSON.parse(hist));
    } catch { /* ignore */ }
  }, []);

  // メッセージ永続化
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(CURRENT_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  // セッション保存
  const saveAndNewSession = useCallback(() => {
    if (messages.length < 2) {
      localStorage.removeItem(CURRENT_KEY);
      setMessages([]);
      return;
    }
    const firstUserMsg = messages.find(m => m.role === 'user')?.content || 'Talk';
    const session: TalkSession = {
      id: `session_${Date.now()}`,
      title: firstUserMsg.slice(0, 30),
      createdAt: new Date().toISOString(),
      messageCount: messages.length,
      messages,
    };
    const updated = [session, ...sessions].slice(0, 30);
    setSessions(updated);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    localStorage.removeItem(CURRENT_KEY);
    setMessages([]);
    setTurnCount(0);
  }, [messages, sessions]);

  const loadSession = useCallback((session: TalkSession) => {
    if (messages.length >= 2) {
      const firstUserMsg = messages.find(m => m.role === 'user')?.content || 'Talk';
      const current: TalkSession = {
        id: `session_${Date.now()}`,
        title: firstUserMsg.slice(0, 30),
        createdAt: new Date().toISOString(),
        messageCount: messages.length,
        messages,
      };
      const updated = [current, ...sessions.filter(s => s.id !== session.id)].slice(0, 30);
      setSessions(updated);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    }
    setMessages(session.messages);
    localStorage.setItem(CURRENT_KEY, JSON.stringify(session.messages));
  }, [messages, sessions]);

  const deleteSession = useCallback((id: string) => {
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  }, [sessions]);

  // メッセージ送信（オーバーライド対応）
  const sendMessage = useCallback(async () => {
    // Talk ページがオーバーライドしている場合はそちらを使う
    if (sendOverrideRef.current) {
      await sendOverrideRef.current();
      return;
    }

    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: TalkMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setTurnCount(prev => prev + 1);

    try {
      const apiHistory: ApiHistory[] = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      }));

      const recentTexts = messages.filter(m => m.role === 'user').slice(-5).map(m => m.content);
      const sessionState = inferSessionState(recentTexts);
      const effectiveProfileWeight = calcEffectiveProfileWeight({
        currentMessage: text, turnCount, sessionState,
      });
      const profile = await getProfile();

      const res = await fetch('/api/kokoro-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text, history: apiHistory, profile,
          sessionState, effectiveProfileWeight, turnCount,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const replyText = data.response || '';

      // アプリルーティング
      const explicitApps = detectExplicitApps(text);
      const contextApps = detectContextApps(text);
      const meta = (data.meta ?? {}) as Record<string, boolean | number | string | null | object>;
      const wishItem = (meta as { wishlist_item?: { text: string; category: WishCategory; intensity: WishIntensity } | null }).wishlist_item ?? null;

      const has = (app: string) => {
        if (explicitApps.has(app) || contextApps.has(app)) return true;
        const metaKey = `need_${app === 'animal' ? 'animal_talk' : app}`;
        return meta[metaKey] === true;
      };

      // 履歴スナップショット
      const allTurns = [...messages, userMsg];
      const fmtHistory = (n: number) =>
        allTurns.slice(-n).map(m => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.content}`).join('\n');

      // 本音ログ保存
      if (data.honneLog) {
        const log = createHonneLog({
          ...data.honneLog,
          sourceMode: 'normal',
        });
        appendHonneLog(log);
      }

      const aiMsg: TalkMessage = {
        role: 'ai',
        content: replyText,
        personaId: data.persona || 'gnome',
        syncRate: typeof data.meta?.sync_rate === 'number' ? data.meta.sync_rate : undefined,
        topic: data.honneLog?.topic,
        showZen: has('zen') || undefined,
        showAnimal: has('animal') || undefined,
        showFashion: has('fashion') || undefined,
        showNote: has('note') || undefined,
        showRecipe: has('recipe') || undefined,
        showInsight: has('insight') || undefined,
        showPlan: has('plan') || undefined,
        showWriter: has('writer') || undefined,
        showBrowser: has('browser') || undefined,
        showCouple: has('couple') || undefined,
        showBuddy: has('buddy') || undefined,
        showPhilosophy: has('philosophy') || undefined,
        showBoard: has('board') || undefined,
        showKami: has('kami') || undefined,
        showPonchi: has('ponchi') || undefined,
        showGatekeeper: has('gatekeeper') || undefined,
        showBuilder: has('builder') || undefined,
        showStrategy: has('strategy') || undefined,
        showWorld: has('world') || undefined,
        showWishlist: (has('wishlist') && !!wishItem?.text) || undefined,
        wishlistText: wishItem?.text,
        wishlistCategory: wishItem?.category,
        wishlistIntensity: wishItem?.intensity,
        routingUserText: text,
        routingHistoryShort: fmtHistory(5),
        routingHistoryLong: fmtHistory(10),
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'ai', content: `エラー: ${e instanceof Error ? e.message : '不明'}`,
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, turnCount]);

  return (
    <TalkCtx.Provider value={{
      messages, setMessages, addMessage, input, setInput,
      isLoading, setIsLoading, sendMessage,
      popupOpen, setPopupOpen,
      sessions, saveAndNewSession, loadSession, deleteSession,
      sendOverrideRef,
    }}>
      {children}
    </TalkCtx.Provider>
  );
}
