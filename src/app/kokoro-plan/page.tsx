'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { saveToNote } from '@/lib/saveToNote';
import PersonaLoading from '@/components/PersonaLoading';

type Task = {
  text: string;
  estimate: string;
  priority: 'high' | 'mid' | 'low';
  done: boolean;
};

const PRIORITY_COLOR: Record<string, string> = {
  high: '#ef4444',
  mid: '#10b981',
  low: '#9ca3af',
};

export default function KokoroPlanPage() {
  const router = useRouter();
  const mono = { fontFamily: "'Space Mono', monospace" };

  const [goal, setGoal] = useState('');
  const [heat] = useState(3);
  const [grain] = useState(3);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // 3 本柱
  const [motive, setMotive] = useState('');
  const [notDoList, setNotDoList] = useState('');
  const [reflection, setReflection] = useState('');
  const [showMotive, setShowMotive] = useState(false);
  const [showNotDo, setShowNotDo] = useState(false);

  const canSubmit = goal.trim().length > 0 && !isLoading;

  const handleGenerate = useCallback(async (goalText?: string) => {
    const g = goalText ?? goal;
    if (!g.trim()) return;
    setIsLoading(true);
    setError('');
    setTasks([]);
    setSaved(false);

    try {
      const res = await fetch('/api/kokoro-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: g, heat, grain, motive, notDoList }),
      });
      if (!res.ok) throw new Error('タスク生成に失敗しました');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTasks((data.tasks ?? []).map((t: Omit<Task, 'done'>) => ({ ...t, done: false })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  }, [goal, heat, grain, motive, notDoList]);

  const toggleTask = (idx: number) => {
    setTasks(prev => prev.map((t, i) => i === idx ? { ...t, done: !t.done } : t));
  };

  const handleSaveToNote = async () => {
    if (!goal.trim() || tasks.length === 0) return;
    let body = `Goal: ${goal}\n`;
    if (motive.trim()) body += `\n[動機] ${motive.trim()}\n`;
    if (notDoList.trim()) body += `\n[やらないこと]\n${notDoList.trim()}\n`;
    body += `\n[タスク]\n${tasks.map(t => `${t.done ? '✓' : '□'} ${t.text}${t.estimate ? ` (${t.estimate})` : ''}`).join('\n')}`;
    if (reflection.trim()) body += `\n\n[内省] ${reflection.trim()}`;
    await saveToNote(body, 'Plan');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // sessionStorage から planFromTalk を読み取り
  useEffect(() => {
    const raw = sessionStorage.getItem('planFromTalk');
    if (!raw) return;
    sessionStorage.removeItem('planFromTalk');
    let userText = '';
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.userText === 'string') userText = parsed.userText;
    } catch {
      userText = raw;
    }
    if (!userText || !userText.trim()) return;
    // 遷移コマンドだけの場合は自動処理しない（テキストだけセット）
    const navOnly = /^(plan|プラン).{0,8}(開|行|使|起動|見|やり)/i.test(userText.trim());
    if (navOnly) {
      // テキスト欄は空のまま、ユーザーの入力を待つ
      return;
    }
    setGoal(userText);
    setTimeout(() => {
      handleGenerate(userText);
    }, 300);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
            width: 32, height: 32, border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(circle at 40% 40%,rgba(16,185,129,0.1) 0%,transparent 70%)',
            fontSize: 16,
          }}>⚙</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: '#10b981' }}>Plan</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>タスク分解エンジン</span>
          </div>
        </div>
        <div />
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '56px 28px 100px' }}>

        {/* ゴール入力 */}
        <textarea
          value={goal}
          onChange={e => setGoal(e.target.value)}
          placeholder={'やりたいこと・目標を入力してください\n例：Reactの基礎を2週間で学ぶ'}
          style={{
            width: '100%', background: '#f8f9fa', border: '1px solid #d1d5db',
            borderLeft: '2px solid #d1d5db', borderRadius: '0 4px 4px 0',
            padding: 14, fontSize: 14, color: '#111827',
            resize: 'none', outline: 'none', minHeight: 80,
            fontFamily: "'Noto Serif JP', serif", lineHeight: 1.8,
            marginBottom: 12, boxSizing: 'border-box',
          }}
          onFocus={e => e.currentTarget.style.borderLeftColor = '#10b981'}
          onBlur={e => e.currentTarget.style.borderLeftColor = '#d1d5db'}
        />

        {/* 3 本柱の入口（折り畳み） */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowMotive(!showMotive)}
            style={{
              ...mono, fontSize: 9, letterSpacing: '.08em',
              color: showMotive || motive.trim() ? '#10b981' : '#9ca3af',
              background: 'transparent',
              border: `1px solid ${showMotive || motive.trim() ? '#10b981' : '#e5e7eb'}`,
              padding: '4px 10px', borderRadius: 12, cursor: 'pointer',
            }}
          >
            なぜ？{motive.trim() && ' ●'}
          </button>
          <button
            onClick={() => setShowNotDo(!showNotDo)}
            style={{
              ...mono, fontSize: 9, letterSpacing: '.08em',
              color: showNotDo || notDoList.trim() ? '#10b981' : '#9ca3af',
              background: 'transparent',
              border: `1px solid ${showNotDo || notDoList.trim() ? '#10b981' : '#e5e7eb'}`,
              padding: '4px 10px', borderRadius: 12, cursor: 'pointer',
            }}
          >
            やらないこと{notDoList.trim() && ' ●'}
          </button>
        </div>

        {/* 動機の問い */}
        {showMotive && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ ...mono, fontSize: 8, letterSpacing: '.14em', color: '#9ca3af', display: 'block', marginBottom: 6 }}>
              // 動機の問い — なぜこれをやりたい？
            </label>
            <input
              type="text"
              value={motive}
              onChange={e => setMotive(e.target.value)}
              placeholder="一言でいい。書かなくてもいい。"
              style={{
                width: '100%', background: '#f8f9fa',
                border: '1px solid #d1d5db', borderLeft: '2px solid #d1d5db',
                borderRadius: '0 4px 4px 0',
                padding: '10px 14px', fontSize: 13, color: '#111827',
                outline: 'none', fontFamily: "'Noto Serif JP', serif",
                boxSizing: 'border-box',
              }}
              onFocus={e => e.currentTarget.style.borderLeftColor = '#10b981'}
              onBlur={e => e.currentTarget.style.borderLeftColor = '#d1d5db'}
            />
          </div>
        )}

        {/* やらないリスト */}
        {showNotDo && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ ...mono, fontSize: 8, letterSpacing: '.14em', color: '#9ca3af', display: 'block', marginBottom: 6 }}>
              // やらないリスト — このゴールのために手を出さないこと
            </label>
            <textarea
              value={notDoList}
              onChange={e => setNotDoList(e.target.value)}
              placeholder="例：完璧を目指さない / SNS で進捗自慢しない / 睡眠を削らない"
              style={{
                width: '100%', background: '#f8f9fa',
                border: '1px solid #d1d5db', borderLeft: '2px solid #d1d5db',
                borderRadius: '0 4px 4px 0',
                padding: '10px 14px', fontSize: 13, color: '#111827',
                resize: 'vertical', outline: 'none', minHeight: 60,
                fontFamily: "'Noto Serif JP', serif", lineHeight: 1.7,
                boxSizing: 'border-box',
              }}
              onFocus={e => e.currentTarget.style.borderLeftColor = '#10b981'}
              onBlur={e => e.currentTarget.style.borderLeftColor = '#d1d5db'}
            />
          </div>
        )}

        {/* 実行ボタン */}
        <button
          onClick={() => handleGenerate()}
          disabled={!canSubmit}
          title="タスクを生成する"
          style={{
            width: '100%', background: 'transparent',
            border: `1px solid ${canSubmit ? '#10b981' : '#d1d5db'}`,
            color: canSubmit ? '#10b981' : '#9ca3af',
            ...mono, fontSize: 10, letterSpacing: '.2em',
            padding: 13, cursor: canSubmit ? 'pointer' : 'not-allowed',
            borderRadius: 2,
          }}
        >
          Yoroshiku
        </button>

        {/* ローディング */}
        {isLoading && <PersonaLoading />}

        {/* エラー */}
        {error && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ ...mono, fontSize: 11, color: '#f97316', marginBottom: 20, lineHeight: 1.8 }}>
              // エラー: {error}
            </div>
          </div>
        )}

        {/* タスクリスト */}
        {tasks.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{
              ...mono, fontSize: 8, letterSpacing: '.2em', color: '#9ca3af',
              marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span>// {tasks.length} タスク</span>
              <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tasks.map((task, i) => (
                <div
                  key={i}
                  onClick={() => toggleTask(i)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '14px 16px', background: '#f8f9fa',
                    border: '1px solid #e5e7eb', borderRadius: 4,
                    cursor: 'pointer', transition: 'all 0.15s',
                    opacity: task.done ? 0.5 : 1,
                    textDecoration: task.done ? 'line-through' : 'none',
                    animation: `fadeUp 0.3s ease-out ${i * 0.05}s both`,
                  }}
                >
                  {/* チェックボックス */}
                  <div style={{
                    width: 18, height: 18, border: `1px solid ${task.done ? '#10b981' : '#d1d5db'}`,
                    borderRadius: 4, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, background: task.done ? '#10b981' : 'transparent',
                    color: task.done ? '#fff' : 'transparent',
                    transition: 'all 0.15s',
                  }}>
                    ✓
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
                      {task.text}
                    </div>
                    <div style={{ ...mono, fontSize: 8, color: '#9ca3af', marginTop: 4 }}>
                      {task.estimate}{task.priority ? ` // ${task.priority}` : ''}
                    </div>
                  </div>
                  {/* 優先度インジケーター */}
                  <div style={{
                    width: 4, height: 4, borderRadius: '50%',
                    background: PRIORITY_COLOR[task.priority] ?? '#9ca3af',
                    flexShrink: 0, marginTop: 6,
                  }} />
                </div>
              ))}
            </div>

            {/* 1 行内省 */}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed #e5e7eb' }}>
              <label style={{ ...mono, fontSize: 8, letterSpacing: '.14em', color: '#9ca3af', display: 'block', marginBottom: 6 }}>
                // 1 行内省 — 今の気持ちを一言で
              </label>
              <input
                type="text"
                value={reflection}
                onChange={e => setReflection(e.target.value)}
                placeholder="書かなくてもいい。書いた一言は Note に残る。"
                style={{
                  width: '100%', background: '#fafafa',
                  border: '1px solid #e5e7eb', borderRadius: 4,
                  padding: '10px 14px', fontSize: 13, color: '#111827',
                  outline: 'none', fontFamily: "'Noto Serif JP', serif",
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Note保存ボタン */}
            <button
              onClick={handleSaveToNote}
              disabled={saved}
              title="Noteに保存"
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

            <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
          </div>
        )}
      </div>
    </div>
  );
}
