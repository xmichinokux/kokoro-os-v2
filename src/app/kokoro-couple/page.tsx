'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { saveToNote } from '@/lib/saveToNote';

type CoupleTab = 'consult' | 'gift' | 'date' | 'message';

const TAB_CONFIG: Record<CoupleTab, { label: string; icon: string; inputLabel: string; placeholder: string }> = {
  consult: {
    label: '相談',
    icon: '💬',
    inputLabel: '// 相談内容',
    placeholder: 'パートナーとのこと、話してみてください。\n例：最近すれ違いが多い気がする',
  },
  gift: {
    label: 'プレゼント',
    icon: '🎁',
    inputLabel: '// プレゼントのヒント',
    placeholder: '何か欲しそうなもの・好きなもの・予算を教えてください。\n例：音楽好き、3000円以内、記念日に',
  },
  date: {
    label: 'デート',
    icon: '❤',
    inputLabel: '// デートの条件',
    placeholder: '今の状況・好み・場所などを教えてください。\n例：付き合って1年、二人ともインドア派、東京在住',
  },
  message: {
    label: 'メッセージ',
    icon: '💌',
    inputLabel: '// メッセージの内容',
    placeholder: 'どんなメッセージを送りたいか教えてください。\n例：喧嘩した後の仲直りメッセージ、誕生日おめでとう',
  },
};

const TABS: CoupleTab[] = ['consult', 'gift', 'date', 'message'];

export default function KokoroCouplePage() {
  const router = useRouter();
  const mono = { fontFamily: "'Space Mono', monospace" };
  const accentColor = '#ec4899';

  const [activeTab, setActiveTab] = useState<CoupleTab>('consult');
  const [partnerName, setPartnerName] = useState('');
  const [partnerTraits, setPartnerTraits] = useState('');
  const [inputText, setInputText] = useState('');
  const [resultText, setResultText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const canSubmit = inputText.trim().length > 0 && !isLoading;

  const handleRun = useCallback(async (text?: string) => {
    const t = text ?? inputText;
    if (!t.trim()) return;
    setIsLoading(true);
    setError('');
    setResultText('');
    setSaved(false);

    try {
      const res = await fetch('/api/kokoro-couple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: t,
          tab: activeTab,
          partnerName: partnerName.trim(),
          partnerTraits: partnerTraits.trim(),
        }),
      });
      if (!res.ok) throw new Error('提案の生成に失敗しました');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResultText(data.result ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  }, [inputText, activeTab, partnerName, partnerTraits]);

  const handleSaveToNote = () => {
    if (!resultText) return;
    const label = TAB_CONFIG[activeTab].label;
    const body = `[${label}] ${resultText}`;
    saveToNote(body, 'Couple');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // sessionStorage から coupleFromTalk を読み取り
  useEffect(() => {
    const raw = sessionStorage.getItem('coupleFromTalk');
    if (!raw) return;
    sessionStorage.removeItem('coupleFromTalk');
    let userText = '';
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.userText === 'string') userText = parsed.userText;
    } catch {
      userText = raw;
    }
    if (userText) setInputText(userText);
  }, []);

  const handleTabChange = (tab: CoupleTab) => {
    setActiveTab(tab);
    setResultText('');
    setError('');
    setSaved(false);
  };

  const config = TAB_CONFIG[activeTab];

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#374151' }}>

      {/* ヘッダー */}
      <header style={{
        padding: '14px 28px',
        borderBottom: '1px solid #e5e7eb',
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 32, height: 32, border: `1px solid rgba(236,72,153,0.3)`,
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(circle at 40% 40%,rgba(236,72,153,0.1) 0%,transparent 70%)',
            fontSize: 16,
          }}>❤</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: accentColor }}>Couple</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>カップルのためのOS</span>
          </div>
        </div>
        <button
          onClick={() => router.push('/kokoro-chat')}
          title="Talkに戻る"
          style={{ ...mono, fontSize: 9, letterSpacing: '.12em', color: '#9ca3af', background: 'transparent', border: '1px solid #e5e7eb', padding: '5px 14px', borderRadius: 3, cursor: 'pointer' }}
        >
          ← Talk
        </button>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 28px 100px' }}>

        {/* パートナー情報バー */}
        <div style={{
          background: '#f8f9fa', border: '1px solid #e5e7eb',
          borderLeft: `3px solid ${accentColor}`,
          padding: '16px 20px', marginBottom: 28,
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <span style={{ ...mono, fontSize: 8, letterSpacing: '.16em', color: accentColor, whiteSpace: 'nowrap' }}>
            // パートナー
          </span>
          <input
            type="text"
            value={partnerName}
            onChange={e => setPartnerName(e.target.value)}
            placeholder="名前（任意）"
            style={{
              flex: 1, minWidth: 120, background: 'transparent',
              border: 'none', borderBottom: '1px solid #d1d5db',
              color: '#111827', fontSize: 14, padding: '4px 0', outline: 'none',
            }}
          />
          <input
            type="text"
            value={partnerTraits}
            onChange={e => setPartnerTraits(e.target.value)}
            placeholder="好きなもの・特徴（任意）"
            style={{
              flex: 1, minWidth: 120, background: 'transparent',
              border: 'none', borderBottom: '1px solid #d1d5db',
              color: '#111827', fontSize: 14, padding: '4px 0', outline: 'none',
            }}
          />
        </div>

        {/* タブ */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28, flexWrap: 'wrap' }}>
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              style={{
                ...mono, fontSize: 9, letterSpacing: '.1em',
                padding: '7px 16px',
                border: `1px solid ${activeTab === tab ? accentColor : '#d1d5db'}`,
                borderRadius: 20, cursor: 'pointer',
                color: activeTab === tab ? accentColor : '#9ca3af',
                background: activeTab === tab ? 'rgba(0,0,0,0.02)' : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              {TAB_CONFIG[tab].icon} {TAB_CONFIG[tab].label}
            </button>
          ))}
        </div>

        {/* 入力エリア */}
        <span style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', display: 'block', marginBottom: 10 }}>
          {config.inputLabel}
        </span>
        <textarea
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder={config.placeholder}
          style={{
            width: '100%', background: '#f8f9fa',
            border: '1px solid #d1d5db', borderLeft: '2px solid #d1d5db',
            borderRadius: '0 4px 4px 0',
            padding: 14, fontSize: 14, color: '#111827',
            resize: 'vertical', outline: 'none', minHeight: 80,
            fontFamily: "'Noto Serif JP', serif", lineHeight: 1.8,
            boxSizing: 'border-box',
          }}
          onFocus={e => e.currentTarget.style.borderLeftColor = accentColor}
          onBlur={e => e.currentTarget.style.borderLeftColor = '#d1d5db'}
        />

        {/* 実行ボタン */}
        <button
          onClick={() => handleRun()}
          disabled={!canSubmit}
          title="提案する"
          style={{
            width: '100%', background: 'transparent',
            border: `1px solid ${canSubmit ? accentColor : '#d1d5db'}`,
            color: canSubmit ? accentColor : '#9ca3af',
            ...mono, fontSize: 10, letterSpacing: '.2em',
            padding: 13, cursor: canSubmit ? 'pointer' : 'not-allowed',
            borderRadius: 2, marginTop: 12,
          }}
        >
          {isLoading ? '// 考えています...' : 'Yoroshiku'}
        </button>

        {/* ローディング */}
        {isLoading && (
          <div style={{ marginTop: 16 }}>
            <div style={{ width: '100%', height: 1, background: '#e5e7eb', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: '-40%', top: 0, width: '40%', height: '100%', background: accentColor, animation: 'sweep 1.4s ease-in-out infinite' }} />
            </div>
            <style>{`@keyframes sweep{0%{left:-40%}100%{left:140%}}`}</style>
          </div>
        )}

        {/* エラー */}
        {error && (
          <div style={{ marginTop: 12, ...mono, fontSize: 11, color: '#ef4444', lineHeight: 1.8 }}>
            // エラー: {error}
          </div>
        )}

        {/* 結果カード */}
        {resultText && (
          <div style={{
            background: '#f8f9fa', border: '1px solid #e5e7eb',
            borderLeft: `3px solid ${accentColor}`,
            padding: 24, borderRadius: '0 8px 8px 0', marginTop: 24,
            animation: 'fadeUp 0.4s ease-out forwards',
          }}>
            <div style={{ ...mono, fontSize: 8, letterSpacing: '.2em', color: accentColor, marginBottom: 14 }}>
              // 提案
            </div>
            <div style={{
              fontFamily: "'Noto Serif JP', serif", fontSize: 15,
              fontWeight: 300, lineHeight: 2, color: '#111827',
              whiteSpace: 'pre-wrap',
            }}>
              {resultText}
            </div>

            {/* Note保存ボタン */}
            <button
              onClick={handleSaveToNote}
              disabled={saved}
              title={saved ? 'Noteに保存しました' : 'Noteに保存'}
              style={{
                marginTop: 12, background: 'transparent',
                border: `1px solid ${saved ? '#10b981' : '#d1d5db'}`,
                color: saved ? '#10b981' : '#9ca3af',
                ...mono, fontSize: 8, letterSpacing: '.12em',
                padding: '8px 16px', cursor: saved ? 'default' : 'pointer',
                borderRadius: 3,
              }}
            >
              {saved ? 'Note ✓' : 'Note +'}
            </button>
          </div>
        )}

        <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      </div>
    </div>
  );
}
