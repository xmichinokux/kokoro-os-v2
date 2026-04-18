'use client';

import { useState, useEffect, useCallback } from 'react';
import { saveToNote } from '@/lib/saveToNote';
import PersonaLoading from '@/components/PersonaLoading';

type CoupleTab = 'consult' | 'gift' | 'date';
type PairStatus = 'loading' | 'unpaired' | 'pending' | 'paired';

const TAB_CONFIG: Record<CoupleTab, { label: string; icon: string; inputLabel: string; placeholder: string; hasBudget: boolean }> = {
  consult: {
    label: '相談',
    icon: '💬',
    inputLabel: '// 相談内容',
    placeholder: 'パートナーとのこと、話してみてください。\n例：最近すれ違いが多い気がする',
    hasBudget: false,
  },
  gift: {
    label: 'プレゼント',
    icon: '🎁',
    inputLabel: '// プレゼントの相談',
    placeholder: 'どんな場面・気持ちで贈りたいか教えてください。\n例：記念日に、日頃の感謝を込めて',
    hasBudget: true,
  },
  date: {
    label: 'デート',
    icon: '❤',
    inputLabel: '// デートの相談',
    placeholder: '今の状況や気分を教えてください。\n例：久しぶりに二人でゆっくり過ごしたい',
    hasBudget: true,
  },
};

const TABS: CoupleTab[] = ['consult', 'gift', 'date'];

const BUDGET_OPTIONS = [
  { value: '1000', label: '〜1,000' },
  { value: '3000', label: '〜3,000' },
  { value: '5000', label: '〜5,000' },
  { value: '10000', label: '〜1万' },
  { value: '30000', label: '〜3万' },
  { value: '50000', label: '〜5万' },
  { value: 'free', label: '指定なし' },
];

export default function KokoroCouplePage() {
  const mono = { fontFamily: "'Space Mono', monospace" };
  const accentColor = '#7c3aed';

  /* ─── ペアリング状態 ─── */
  const [pairStatus, setPairStatus] = useState<PairStatus>('loading');
  const [partnerName, setPartnerName] = useState('');
  const [pendingCode, setPendingCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [pairError, setPairError] = useState('');

  /* ─── 提案 ─── */
  const [activeTab, setActiveTab] = useState<CoupleTab>('consult');
  const [budget, setBudget] = useState('free');
  const [inputText, setInputText] = useState('');
  const [resultText, setResultText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const config = TAB_CONFIG[activeTab];
  const canSubmit = inputText.trim().length > 0 && !isLoading;

  /* ─── ペアリング状態確認 ─── */
  const checkPair = useCallback(async () => {
    try {
      const res = await fetch('/api/kokoro-couple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check_pair' }),
      });
      const data = await res.json();
      if (data.error) {
        setPairStatus('unpaired');
        return;
      }
      if (data.paired) {
        setPairStatus('paired');
        setPartnerName(data.partnerName || 'パートナー');
      } else if (data.pendingCode) {
        setPairStatus('pending');
        setPendingCode(data.pendingCode);
      } else {
        setPairStatus('unpaired');
      }
    } catch {
      setPairStatus('unpaired');
    }
  }, []);

  useEffect(() => { checkPair(); }, [checkPair]);

  /* ─── コード生成 ─── */
  const handleGenerate = async () => {
    setPairError('');
    try {
      const res = await fetch('/api/kokoro-couple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_code' }),
      });
      const data = await res.json();
      if (data.error) { setPairError(data.error); return; }
      setPendingCode(data.code);
      setPairStatus('pending');
    } catch {
      setPairError('コード生成に失敗しました');
    }
  };

  /* ─── コード入力でペアリング ─── */
  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setPairError('');
    try {
      const res = await fetch('/api/kokoro-couple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join_code', code: joinCode.trim() }),
      });
      const data = await res.json();
      if (data.error) { setPairError(data.error); return; }
      await checkPair();
    } catch {
      setPairError('ペアリングに失敗しました');
    }
  };

  /* ─── ペアリング解除 ─── */
  const handleUnpair = async () => {
    try {
      await fetch('/api/kokoro-couple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unpair' }),
      });
      setPairStatus('unpaired');
      setPartnerName('');
      setPendingCode('');
      setResultText('');
    } catch { /* ignore */ }
  };

  /* ─── 提案実行 ─── */
  const handleRun = useCallback(async () => {
    if (!inputText.trim()) return;
    setIsLoading(true);
    setError('');
    setResultText('');
    setSaved(false);

    try {
      const res = await fetch('/api/kokoro-couple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText,
          tab: activeTab,
          budget: config.hasBudget ? budget : undefined,
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
  }, [inputText, activeTab, budget, config.hasBudget]);

  const handleSaveToNote = async () => {
    if (!resultText) return;
    const label = TAB_CONFIG[activeTab].label;
    const body = `[${label}] ${resultText}`;
    await saveToNote(body, 'Couple');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTabChange = (tab: CoupleTab) => {
    setActiveTab(tab);
    setResultText('');
    setError('');
    setSaved(false);
  };

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
        {pairStatus === 'paired' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ ...mono, fontSize: 9, color: '#10b981', letterSpacing: '.08em' }}>
              ❤ {partnerName}
            </span>
            <button
              onClick={handleUnpair}
              style={{ ...mono, fontSize: 8, color: '#9ca3af', background: 'transparent', border: '1px solid #e5e7eb', padding: '3px 10px', borderRadius: 3, cursor: 'pointer' }}
            >
              解除
            </button>
          </div>
        )}
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 28px 120px' }}>

        {/* ─── ペアリング画面 ─── */}
        {pairStatus === 'loading' && (
          <div style={{ textAlign: 'center', padding: '60px 0', ...mono, fontSize: 11, color: '#9ca3af' }}>
            // loading...
          </div>
        )}

        {(pairStatus === 'unpaired' || pairStatus === 'pending') && (
          <div style={{ maxWidth: 400, margin: '0 auto' }}>

            <p style={{
              fontSize: 14, color: '#6b7280', lineHeight: 2,
              fontFamily: "'Noto Serif JP', serif",
              marginBottom: 32, textAlign: 'center',
            }}>
              パートナーとペアリングして始めましょう。<br />
              お互いのプロフィールとウィッシュリストから<br />
              二人に合った提案をします。
            </p>

            {/* コード生成 */}
            <div style={{
              background: '#f8f9fa', border: '1px solid #e5e7eb',
              borderRadius: 8, padding: 24, marginBottom: 20,
            }}>
              <div style={{ ...mono, fontSize: 9, letterSpacing: '.14em', color: accentColor, marginBottom: 12 }}>
                // STEP 1 : コードを作る
              </div>
              {pairStatus === 'pending' ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    ...mono, fontSize: 28, fontWeight: 700, letterSpacing: '.2em',
                    color: '#111827', marginBottom: 8,
                  }}>
                    {pendingCode}
                  </div>
                  <p style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>
                    このコードをパートナーに送ってください
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleGenerate}
                  style={{
                    width: '100%', padding: '12px 0',
                    background: accentColor, color: '#fff', border: 'none',
                    borderRadius: 4, cursor: 'pointer',
                    ...mono, fontSize: 11, letterSpacing: '.14em',
                  }}
                >
                  ペアリングコードを生成
                </button>
              )}
            </div>

            {/* コード入力 */}
            <div style={{
              background: '#f8f9fa', border: '1px solid #e5e7eb',
              borderRadius: 8, padding: 24,
            }}>
              <div style={{ ...mono, fontSize: 9, letterSpacing: '.14em', color: accentColor, marginBottom: 12 }}>
                // STEP 2 : コードを入力する
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="KKR-XXXX"
                  maxLength={8}
                  style={{
                    flex: 1, padding: '10px 14px',
                    ...mono, fontSize: 16, letterSpacing: '.2em', textAlign: 'center',
                    border: '1px solid #d1d5db', borderRadius: 4,
                    color: '#111827', outline: 'none', background: '#fff',
                  }}
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                />
                <button
                  onClick={handleJoin}
                  disabled={!joinCode.trim()}
                  style={{
                    padding: '10px 20px',
                    background: joinCode.trim() ? accentColor : '#d1d5db',
                    color: '#fff', border: 'none', borderRadius: 4,
                    cursor: joinCode.trim() ? 'pointer' : 'not-allowed',
                    ...mono, fontSize: 10, letterSpacing: '.1em',
                  }}
                >
                  接続
                </button>
              </div>
            </div>

            {pairError && (
              <div style={{ marginTop: 12, ...mono, fontSize: 11, color: '#ef4444', textAlign: 'center' }}>
                // {pairError}
              </div>
            )}
          </div>
        )}

        {/* ─── メイン（ペアリング済み）─── */}
        {pairStatus === 'paired' && (
          <>
            {/* タブ */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
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

            {/* 予算セレクタ（gift / date のみ） */}
            {config.hasBudget && (
              <div style={{ marginBottom: 20 }}>
                <span style={{ ...mono, fontSize: 8, letterSpacing: '.16em', color: '#9ca3af', display: 'block', marginBottom: 8 }}>
                  // 予算
                </span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {BUDGET_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setBudget(opt.value)}
                      style={{
                        ...mono, fontSize: 9, letterSpacing: '.06em',
                        padding: '5px 12px', borderRadius: 14,
                        border: `1px solid ${budget === opt.value ? accentColor : '#e5e7eb'}`,
                        color: budget === opt.value ? accentColor : '#9ca3af',
                        background: budget === opt.value ? 'rgba(236,72,153,0.04)' : 'transparent',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

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
              onClick={handleRun}
              disabled={!canSubmit}
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
            {isLoading && <PersonaLoading />}

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

                <button
                  onClick={handleSaveToNote}
                  disabled={saved}
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
          </>
        )}

        <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      </div>
    </div>
  );
}
