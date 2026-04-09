'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { saveToNote } from '@/lib/saveToNote';

type AgendaItem = { topic: string; duration: string; questions: string[] };
type ActionItem = { task: string; owner?: string };
type BoardResult = {
  opening: string;
  agenda_items: AgendaItem[];
  action_items: ActionItem[];
  closing: string;
};

export default function KokoroBoardPage() {
  const router = useRouter();
  const mono = { fontFamily: "'Space Mono', monospace" };
  const accentColor = '#0ea5e9';

  const [members, setMembers] = useState('');
  const [agenda, setAgenda] = useState('');
  const [result, setResult] = useState<BoardResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const canSubmit = agenda.trim().length > 0 && !isLoading;

  const handleStart = useCallback(async () => {
    if (!agenda.trim()) return;
    setIsLoading(true);
    setError('');
    setResult(null);
    setSaved(false);

    try {
      const res = await fetch('/api/kokoro-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agenda: agenda.trim(), members: members.trim() }),
      });
      if (!res.ok) throw new Error('会議台本の生成に失敗しました');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  }, [agenda, members]);

  const handleSaveToNote = () => {
    if (!result) return;
    let body = `会議: ${agenda}\n\n[開会]\n${result.opening}\n\n`;
    body += result.agenda_items.map((a, i) =>
      `[議題${i + 1}] ${a.topic} (${a.duration})\n${a.questions.map(q => '・' + q).join('\n')}`
    ).join('\n\n');
    body += '\n\n[アクションアイテム]\n';
    body += result.action_items.map(a => `✓ ${a.task}${a.owner ? ` (${a.owner})` : ''}`).join('\n');
    body += `\n\n[閉会]\n${result.closing}`;

    saveToNote(body, 'Board');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  useEffect(() => {
    const raw = sessionStorage.getItem('boardFromTalk');
    if (!raw) return;
    sessionStorage.removeItem('boardFromTalk');
    let userText = '';
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.userText === 'string') userText = parsed.userText;
    } catch {
      userText = raw;
    }
    if (userText) setAgenda(userText);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#374151' }}>

      <header style={{
        padding: '14px 28px', borderBottom: '1px solid #e5e7eb',
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 32, height: 32, border: `1px solid rgba(14,165,233,0.3)`,
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(circle at 40% 40%,rgba(14,165,233,0.1) 0%,transparent 70%)',
            fontSize: 16,
          }}>👥</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: accentColor }}>Board</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>会議ファシリテーターAI</span>
          </div>
        </div>
        <button
          onClick={() => router.push('/kokoro-chat')}
          style={{ ...mono, fontSize: 9, letterSpacing: '.12em', color: '#9ca3af', background: 'transparent', border: '1px solid #e5e7eb', padding: '5px 14px', borderRadius: 3, cursor: 'pointer' }}
        >
          ← Talk
        </button>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 28px 100px' }}>

        {/* 参加者入力 */}
        <label style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', display: 'block', marginBottom: 10 }}>
          // 参加者（任意）
        </label>
        <input
          type="text"
          value={members}
          onChange={e => setMembers(e.target.value)}
          placeholder="例：田中、佐藤、鈴木（カンマ区切り）"
          style={{
            width: '100%', background: '#f8f9fa', border: '1px solid #d1d5db',
            borderRadius: 4, padding: '10px 14px', fontSize: 13, color: '#111827',
            outline: 'none', marginBottom: 12,
            fontFamily: "'Noto Sans JP', sans-serif", boxSizing: 'border-box',
          }}
        />

        {/* アジェンダ入力 */}
        <label style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', display: 'block', marginBottom: 10 }}>
          // 今日のアジェンダ
        </label>
        <textarea
          value={agenda}
          onChange={e => setAgenda(e.target.value)}
          placeholder="例：Q3の売上について振り返り、来期の方針を決める。予算案も確認したい。"
          style={{
            width: '100%', background: '#f8f9fa',
            border: '1px solid #d1d5db', borderLeft: '2px solid #d1d5db',
            borderRadius: '0 4px 4px 0',
            padding: 14, fontSize: 14, color: '#111827',
            resize: 'vertical', outline: 'none', minHeight: 80,
            fontFamily: "'Noto Sans JP', sans-serif",
            boxSizing: 'border-box', marginBottom: 12,
          }}
          onFocus={e => e.currentTarget.style.borderLeftColor = accentColor}
          onBlur={e => e.currentTarget.style.borderLeftColor = '#d1d5db'}
        />

        <button
          onClick={handleStart}
          disabled={!canSubmit}
          style={{
            width: '100%', background: 'transparent',
            border: `1px solid ${canSubmit ? accentColor : '#d1d5db'}`,
            color: canSubmit ? accentColor : '#9ca3af',
            ...mono, fontSize: 10, letterSpacing: '.2em',
            padding: 13, cursor: canSubmit ? 'pointer' : 'not-allowed',
            borderRadius: 2,
          }}
        >
          {isLoading ? '// 準備中...' : '▸ 会議を始める'}
        </button>

        {isLoading && (
          <div style={{ marginTop: 16 }}>
            <div style={{ width: '100%', height: 1, background: '#e5e7eb', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: '-40%', top: 0, width: '40%', height: '100%', background: accentColor, animation: 'sweep 1.4s ease-in-out infinite' }} />
            </div>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 12, ...mono, fontSize: 11, color: '#ef4444', lineHeight: 1.8 }}>
            // エラー: {error}
          </div>
        )}

        {/* 結果表示 */}
        {result && (
          <div style={{ marginTop: 28 }}>
            {/* 開会 */}
            <div style={{
              background: '#f8f9fa', border: '1px solid #e5e7eb',
              borderLeft: `3px solid ${accentColor}`,
              padding: '18px 20px', marginBottom: 12, borderRadius: '0 8px 8px 0',
              animation: 'fadeUp 0.4s ease-out both',
            }}>
              <div style={{ ...mono, fontSize: 8, letterSpacing: '.14em', color: accentColor, marginBottom: 8 }}>
                // 開会
              </div>
              <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
                {result.opening}
              </div>
            </div>

            {/* 議題 */}
            {result.agenda_items.map((item, i) => (
              <div
                key={i}
                style={{
                  background: '#f8f9fa', border: '1px solid #e5e7eb',
                  borderLeft: `3px solid ${accentColor}`,
                  padding: '18px 20px', marginBottom: 12, borderRadius: '0 8px 8px 0',
                  animation: `fadeUp 0.4s ease-out ${(i + 1) * 0.1}s both`,
                }}
              >
                <div style={{ ...mono, fontSize: 8, letterSpacing: '.14em', color: accentColor, marginBottom: 8 }}>
                  // 議題 {i + 1}　{item.duration}
                </div>
                <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.9 }}>
                  <strong>{item.topic}</strong>
                  {item.questions.map((q, j) => (
                    <div key={j}>・{q}</div>
                  ))}
                </div>
              </div>
            ))}

            {/* アクションアイテム */}
            <div style={{
              marginTop: 20, background: '#f8f9fa',
              border: '1px solid #e5e7eb', padding: 20,
              animation: 'fadeUp 0.4s 0.5s ease-out both',
            }}>
              <div style={{ ...mono, fontSize: 8, letterSpacing: '.2em', color: accentColor, marginBottom: 14 }}>
                // アクションアイテム
              </div>
              {result.action_items.map((a, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 13, color: '#374151', lineHeight: 1.8,
                    padding: '8px 0',
                    borderBottom: i < result.action_items.length - 1 ? '1px solid #e5e7eb' : 'none',
                  }}
                >
                  ✓ {a.task}{a.owner ? `（${a.owner}）` : ''}
                </div>
              ))}
            </div>

            {/* 閉会 */}
            <div style={{
              background: '#f8f9fa', border: '1px solid #e5e7eb',
              borderLeft: `3px solid ${accentColor}`,
              padding: '18px 20px', marginTop: 12, borderRadius: '0 8px 8px 0',
              animation: 'fadeUp 0.4s 0.6s ease-out both',
            }}>
              <div style={{ ...mono, fontSize: 8, letterSpacing: '.14em', color: accentColor, marginBottom: 8 }}>
                // 閉会
              </div>
              <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
                {result.closing}
              </div>
            </div>

            {/* Note保存ボタン */}
            <button
              onClick={handleSaveToNote}
              disabled={saved}
              style={{
                marginTop: 16, background: 'transparent',
                border: `1px solid ${saved ? '#10b981' : '#d1d5db'}`,
                color: saved ? '#10b981' : '#9ca3af',
                ...mono, fontSize: 8, letterSpacing: '.12em',
                padding: '8px 16px', cursor: saved ? 'default' : 'pointer',
                borderRadius: 3,
              }}
            >
              {saved ? '// Noteに保存しました ✓' : '📝 Note に保存'}
            </button>
          </div>
        )}

        <style>{`
          @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes sweep { 0% { left: -40%; } 100% { left: 140%; } }
        `}</style>
      </div>
    </div>
  );
}
