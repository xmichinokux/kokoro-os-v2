'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { saveToNote } from '@/lib/saveToNote';
import PersonaLoading from '@/components/PersonaLoading';

type PhilMode = 'multi' | 'socratic' | 'eastern' | 'modern' | 'personas';

type Philosopher = { name: string; color: string; response: string };
type MultiResult = { philosophers: Philosopher[]; synthesis: string };
type EasternItem = { tradition: string; insight: string };
type EasternResult = { perspectives: EasternItem[]; unified: string };
type ModernItem = { school: string; thinker: string; insight: string };
type ModernResult = { perspectives: ModernItem[]; critique: string };

type DialogueMessage = { role: 'user' | 'assistant'; content: string };
type PersonaMessage = {
  role: 'user' | 'persona';
  persona?: string;
  icon?: string;
  color?: string;
  content: string;
};

const MODE_LABELS: Record<PhilMode, string> = {
  multi: '多角視点',
  socratic: 'ソクラテス対話',
  eastern: '東洋哲学',
  modern: '現代哲学',
  personas: '5人格対話',
};

const PERSONA_DEFS = [
  { id: 'gnome', name: 'ノーム', icon: '🌱', color: '#d97706' },
  { id: 'shin',  name: 'シン',   icon: '🔍', color: '#2563eb' },
  { id: 'canon', name: 'カノン', icon: '🌙', color: '#7c3aed' },
  { id: 'dig',   name: 'ディグ', icon: '🎧', color: '#059669' },
  { id: 'emi',   name: 'エミ',   icon: '🌊', color: '#db2777' },
];

export default function KokoroPhiloPage() {
  const router = useRouter();
  const mono = { fontFamily: "'Space Mono', monospace" };
  const accentColor = '#78716c';

  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState<PhilMode>('multi');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const [multiResult, setMultiResult] = useState<MultiResult | null>(null);
  const [easternResult, setEasternResult] = useState<EasternResult | null>(null);
  const [modernResult, setModernResult] = useState<ModernResult | null>(null);
  const [dialogueHistory, setDialogueHistory] = useState<DialogueMessage[]>([]);
  const [dialogueInput, setDialogueInput] = useState('');
  const [dialogueLoading, setDialogueLoading] = useState(false);

  // 5人格対話モード
  const [personaMessages, setPersonaMessages] = useState<PersonaMessage[]>([]);
  const [personaInput, setPersonaInput] = useState('');
  const [personaLoading, setPersonaLoading] = useState(false);
  const personaBottomRef = useRef<HTMLDivElement>(null);

  const clearResults = () => {
    setMultiResult(null);
    setEasternResult(null);
    setModernResult(null);
    setDialogueHistory([]);
    setPersonaMessages([]);
    setError('');
    setSaved(false);
  };

  const handleRun = useCallback(async () => {
    const q = question.trim();
    if (!q) return;
    setIsLoading(true);
    clearResults();

    try {
      if (mode === 'personas') {
        // 5人格対話モード: 初回の問いを全人格に投げる
        const userMsg: PersonaMessage = { role: 'user', content: q };
        setPersonaMessages([userMsg]);
        setIsLoading(true);

        const res = await fetch('/api/kokoro-philo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q, mode: 'personas' }),
        });
        if (!res.ok) throw new Error('生成に失敗しました');
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const responses: PersonaMessage[] = (data.responses || []).map(
          (r: { persona: string; content: string }) => {
            const def = PERSONA_DEFS.find(p => p.id === r.persona);
            return {
              role: 'persona' as const,
              persona: r.persona,
              icon: def?.icon || '💬',
              color: def?.color || '#78716c',
              content: r.content,
            };
          }
        );
        setPersonaMessages([userMsg, ...responses]);
        setTimeout(() => personaBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 200);
      } else {
        const res = await fetch('/api/kokoro-philo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q, mode }),
        });
        if (!res.ok) throw new Error('生成に失敗しました');
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        if (mode === 'multi') setMultiResult(data.data);
        else if (mode === 'eastern') setEasternResult(data.data);
        else if (mode === 'modern') setModernResult(data.data);
        else if (mode === 'socratic') {
          setDialogueHistory([
            { role: 'user', content: q },
            { role: 'assistant', content: data.result ?? '' },
          ]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  }, [question, mode]);

  const handleContinueDialogue = async () => {
    const text = dialogueInput.trim();
    if (!text || dialogueLoading) return;
    const newHistory: DialogueMessage[] = [...dialogueHistory, { role: 'user', content: text }];
    setDialogueHistory(newHistory);
    setDialogueInput('');
    setDialogueLoading(true);

    try {
      const res = await fetch('/api/kokoro-philo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'socratic-continue', messages: newHistory }),
      });
      if (!res.ok) throw new Error('応答の取得に失敗しました');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDialogueHistory([...newHistory, { role: 'assistant', content: data.result ?? '' }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setDialogueLoading(false);
    }
  };

  // 5人格対話: 続けて話しかける
  const handleContinuePersona = async () => {
    const text = personaInput.trim();
    if (!text || personaLoading) return;
    const userMsg: PersonaMessage = { role: 'user', content: text };
    const updated = [...personaMessages, userMsg];
    setPersonaMessages(updated);
    setPersonaInput('');
    setPersonaLoading(true);

    try {
      // 会話履歴を送る
      const history = updated.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        persona: m.persona,
        content: m.content,
      }));

      const res = await fetch('/api/kokoro-philo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'personas-continue', messages: history }),
      });
      if (!res.ok) throw new Error('応答の取得に失敗しました');
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const responses: PersonaMessage[] = (data.responses || []).map(
        (r: { persona: string; content: string }) => {
          const def = PERSONA_DEFS.find(p => p.id === r.persona);
          return {
            role: 'persona' as const,
            persona: r.persona,
            icon: def?.icon || '💬',
            color: def?.color || '#78716c',
            content: r.content,
          };
        }
      );
      setPersonaMessages([...updated, ...responses]);
      setTimeout(() => personaBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setPersonaLoading(false);
    }
  };

  const handleSaveToNote = async () => {
    let body = `Q: ${question}\n\n`;
    if (mode === 'multi' && multiResult) {
      body += multiResult.philosophers.map(p => `[${p.name}]\n${p.response}`).join('\n\n');
      body += `\n\n[統合・深化]\n${multiResult.synthesis}`;
    } else if (mode === 'eastern' && easternResult) {
      body += easternResult.perspectives.map(p => `[${p.tradition}]\n${p.insight}`).join('\n\n');
      body += `\n\n[東洋哲学の統合]\n${easternResult.unified}`;
    } else if (mode === 'modern' && modernResult) {
      body += modernResult.perspectives.map(p => `[${p.school} / ${p.thinker}]\n${p.insight}`).join('\n\n');
      body += `\n\n[問いの残余]\n${modernResult.critique}`;
    } else if (mode === 'socratic') {
      body += dialogueHistory.map(m => `${m.role === 'user' ? 'ユーザー' : 'ソクラテス'}: ${m.content}`).join('\n\n');
    } else if (mode === 'personas') {
      body += personaMessages.map(m => {
        if (m.role === 'user') return `ユーザー: ${m.content}`;
        const def = PERSONA_DEFS.find(p => p.id === m.persona);
        return `${def?.name || m.persona}: ${m.content}`;
      }).join('\n\n');
    } else {
      return;
    }

    await saveToNote(body, 'Philo');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const hasResult =
    (mode === 'multi' && multiResult) ||
    (mode === 'eastern' && easternResult) ||
    (mode === 'modern' && modernResult) ||
    (mode === 'socratic' && dialogueHistory.length > 0) ||
    (mode === 'personas' && personaMessages.length > 0);

  useEffect(() => {
    // 旧ルートからの遷移もサポート
    const raw = sessionStorage.getItem('philosophyFromTalk') || sessionStorage.getItem('philoFromTalk');
    if (!raw) return;
    sessionStorage.removeItem('philosophyFromTalk');
    sessionStorage.removeItem('philoFromTalk');
    let userText = '';
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.userText === 'string') userText = parsed.userText;
    } catch {
      userText = raw;
    }
    if (userText) setQuestion(userText);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#374151' }}>

      {/* ヘッダー */}
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', borderBottom:'1px solid #e5e7eb', position:'sticky', top:0, background:'#fff', zIndex:10 }}>
        <div>
          <span style={{ ...mono, fontSize:13, fontWeight:700 }}>Kokoro</span>
          <span style={{ ...mono, fontSize:13, fontWeight:700, color:'#7c3aed', marginLeft:4 }}>OS</span>
          <span style={{ ...mono, fontSize:9, color:'#9ca3af', marginLeft:8, letterSpacing:'0.15em' }}>// Philo</span>
        </div>
        <div />
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 28px 120px' }}>

        {/* 問い入力 */}
        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="哲学的な問いを入れてください..."
          rows={3}
          style={{
            width: '100%', background: '#f8f9fa',
            border: '1px solid #d1d5db', borderLeft: '2px solid #d1d5db',
            borderRadius: '0 4px 4px 0',
            color: '#111827', fontFamily: "'Noto Serif JP', serif",
            fontSize: 15, fontWeight: 300, padding: '14px 16px',
            lineHeight: 1.8, resize: 'vertical', minHeight: 80,
            outline: 'none', marginBottom: 24, boxSizing: 'border-box',
          }}
          onFocus={e => e.currentTarget.style.borderLeftColor = accentColor}
          onBlur={e => e.currentTarget.style.borderLeftColor = '#d1d5db'}
        />

        {/* モードタブ */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
          {(['multi', 'socratic', 'eastern', 'modern', 'personas'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); clearResults(); }}
              style={{
                ...mono, fontSize: 9, letterSpacing: '.1em',
                padding: '7px 16px',
                border: `1px solid ${mode === m ? accentColor : '#d1d5db'}`,
                borderRadius: 20, cursor: 'pointer',
                color: mode === m ? accentColor : '#9ca3af',
                background: 'transparent', transition: 'all 0.15s',
              }}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* 実行ボタン */}
        <button
          onClick={handleRun}
          disabled={!question.trim() || isLoading}
          title="哲学する"
          style={{
            width: '100%', background: 'transparent',
            border: `1px solid ${(!question.trim() || isLoading) ? '#d1d5db' : accentColor}`,
            color: (!question.trim() || isLoading) ? '#9ca3af' : accentColor,
            ...mono, fontSize: 10, letterSpacing: '.2em',
            padding: 13, cursor: (!question.trim() || isLoading) ? 'not-allowed' : 'pointer',
            borderRadius: 2,
          }}
        >
          {isLoading ? '// 哲学中...' : 'Yoroshiku'}
        </button>

        {/* ローディング */}
        {isLoading && <PersonaLoading />}

        {/* エラー */}
        {error && (
          <div style={{ marginTop: 12, ...mono, fontSize: 11, color: '#ef4444', lineHeight: 1.8 }}>
            // エラー: {error}
          </div>
        )}

        {/* 結果表示 */}
        <div style={{ marginTop: 28 }}>
          {/* 多角視点 */}
          {mode === 'multi' && multiResult && (
            <>
              {multiResult.philosophers.map((p, i) => (
                <div key={i} style={{ background: '#f8f9fa', border: '1px solid #e5e7eb', borderTop: `2px solid ${p.color || accentColor}`, padding: 20, marginBottom: 10, animation: `fadeUp 0.4s ease-out ${i * 0.08}s both` }}>
                  <div style={{ ...mono, fontSize: 9, letterSpacing: '.16em', color: p.color || accentColor, marginBottom: 10 }}>{p.name}</div>
                  <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 14, fontWeight: 300, lineHeight: 1.9, color: '#374151' }}>{p.response}</div>
                </div>
              ))}
              <div style={{ background: '#f8f9fa', border: '1px solid #e5e7eb', borderLeft: `3px solid ${accentColor}`, padding: 24, marginTop: 20, animation: 'fadeUp 0.4s 0.3s ease-out both' }}>
                <div style={{ ...mono, fontSize: 8, letterSpacing: '.2em', color: accentColor, marginBottom: 14 }}>// 統合・深化</div>
                <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 15, fontWeight: 300, lineHeight: 2.1, color: '#111827' }}>{multiResult.synthesis}</div>
              </div>
            </>
          )}

          {/* 東洋哲学 */}
          {mode === 'eastern' && easternResult && (
            <>
              {easternResult.perspectives.map((p, i) => (
                <div key={i} style={{ background: '#f8f9fa', border: '1px solid #e5e7eb', borderTop: `2px solid ${accentColor}`, padding: 20, marginBottom: 10, animation: `fadeUp 0.4s ease-out ${i * 0.08}s both` }}>
                  <div style={{ ...mono, fontSize: 9, letterSpacing: '.16em', color: accentColor, marginBottom: 10 }}>{p.tradition}</div>
                  <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 14, fontWeight: 300, lineHeight: 1.9, color: '#374151' }}>{p.insight}</div>
                </div>
              ))}
              <div style={{ background: '#f8f9fa', border: '1px solid #e5e7eb', borderLeft: `3px solid ${accentColor}`, padding: 24, marginTop: 20, animation: 'fadeUp 0.4s 0.3s ease-out both' }}>
                <div style={{ ...mono, fontSize: 8, letterSpacing: '.2em', color: accentColor, marginBottom: 14 }}>// 東洋哲学の統合</div>
                <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 15, fontWeight: 300, lineHeight: 2.1, color: '#111827' }}>{easternResult.unified}</div>
              </div>
            </>
          )}

          {/* 現代哲学 */}
          {mode === 'modern' && modernResult && (
            <>
              {modernResult.perspectives.map((p, i) => (
                <div key={i} style={{ background: '#f8f9fa', border: '1px solid #e5e7eb', borderTop: '2px solid #6366f1', padding: 20, marginBottom: 10, animation: `fadeUp 0.4s ease-out ${i * 0.08}s both` }}>
                  <div style={{ ...mono, fontSize: 9, letterSpacing: '.16em', color: '#6366f1', marginBottom: 10 }}>{p.school} // {p.thinker}</div>
                  <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 14, fontWeight: 300, lineHeight: 1.9, color: '#374151' }}>{p.insight}</div>
                </div>
              ))}
              <div style={{ background: '#f8f9fa', border: '1px solid #e5e7eb', borderLeft: `3px solid ${accentColor}`, padding: 24, marginTop: 20, animation: 'fadeUp 0.4s 0.3s ease-out both' }}>
                <div style={{ ...mono, fontSize: 8, letterSpacing: '.2em', color: accentColor, marginBottom: 14 }}>// 問いの残余</div>
                <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 15, fontWeight: 300, lineHeight: 2.1, color: '#111827' }}>{modernResult.critique}</div>
              </div>
            </>
          )}

          {/* ソクラテス対話 */}
          {mode === 'socratic' && dialogueHistory.length > 0 && (
            <>
              <div>
                {dialogueHistory.slice(1).map((msg, i) => (
                  <div key={i} style={{ padding: '14px 18px', borderRadius: 8, marginBottom: 10, fontFamily: "'Noto Serif JP', serif", fontSize: 14, fontWeight: 300, lineHeight: 1.9, background: msg.role === 'assistant' ? '#f8f9fa' : '#f1f3f5', border: `1px solid ${msg.role === 'assistant' ? '#e5e7eb' : '#d1d5db'}`, borderLeft: msg.role === 'assistant' ? `2px solid ${accentColor}` : '1px solid #d1d5db', marginLeft: msg.role === 'user' ? 40 : 0, animation: 'fadeUp 0.3s ease-out both', whiteSpace: 'pre-wrap' }}>
                    {msg.role === 'assistant' && (
                      <div style={{ ...mono, fontSize: 8, color: accentColor, letterSpacing: '.1em', marginBottom: 6 }}>// ソクラテス</div>
                    )}
                    {msg.content}
                  </div>
                ))}
                {dialogueLoading && <PersonaLoading />}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <input type="text" value={dialogueInput} onChange={e => setDialogueInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleContinueDialogue(); }}
                  placeholder="答えてみてください..."
                  style={{ flex: 1, background: '#f8f9fa', border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#111827', outline: 'none', fontFamily: "'Noto Serif JP', serif" }}
                />
                <button onClick={handleContinueDialogue} disabled={dialogueLoading || !dialogueInput.trim()} title="返す"
                  style={{ background: accentColor, border: 'none', borderRadius: 8, color: '#fff', padding: '0 16px', cursor: dialogueLoading ? 'not-allowed' : 'pointer', fontSize: 13, whiteSpace: 'nowrap', opacity: dialogueLoading ? 0.6 : 1 }}>
                  ↑
                </button>
              </div>
            </>
          )}

          {/* 5人格対話 */}
          {mode === 'personas' && personaMessages.length > 0 && (
            <>
              <div>
                {personaMessages.map((msg, i) => (
                  <div key={i} style={{
                    padding: '14px 18px', borderRadius: 8, marginBottom: 10,
                    fontFamily: "'Noto Serif JP', serif", fontSize: 14, fontWeight: 300, lineHeight: 1.9,
                    background: msg.role === 'user' ? '#f1f3f5' : '#f8f9fa',
                    border: `1px solid ${msg.role === 'user' ? '#d1d5db' : '#e5e7eb'}`,
                    borderLeft: msg.role === 'persona' ? `2px solid ${msg.color || '#78716c'}` : '1px solid #d1d5db',
                    marginLeft: msg.role === 'user' ? 40 : 0,
                    animation: `fadeUp 0.3s ease-out ${(i % 6) * 0.05}s both`,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {msg.role === 'persona' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <span style={{ fontSize: 14 }}>{msg.icon}</span>
                      </div>
                    )}
                    {msg.content}
                  </div>
                ))}
                {personaLoading && <PersonaLoading />}
                <div ref={personaBottomRef} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <input type="text" value={personaInput} onChange={e => setPersonaInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleContinuePersona(); }}
                  placeholder="続けて話しかける..."
                  style={{ flex: 1, background: '#f8f9fa', border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#111827', outline: 'none', fontFamily: "'Noto Serif JP', serif" }}
                />
                <button onClick={handleContinuePersona} disabled={personaLoading || !personaInput.trim()} title="返す"
                  style={{ background: '#7c3aed', border: 'none', borderRadius: 8, color: '#fff', padding: '0 16px', cursor: personaLoading ? 'not-allowed' : 'pointer', fontSize: 13, whiteSpace: 'nowrap', opacity: personaLoading ? 0.6 : 1 }}>
                  ↑
                </button>
              </div>
            </>
          )}

          {/* Note保存ボタン */}
          {hasResult && (
            <button
              onClick={handleSaveToNote}
              disabled={saved}
              title={saved ? 'Noteに保存しました' : 'Noteに保存'}
              style={{
                marginTop: 16, background: 'transparent',
                border: `1px solid ${saved ? '#10b981' : '#d1d5db'}`,
                color: saved ? '#10b981' : '#9ca3af',
                ...mono, fontSize: 8, letterSpacing: '.12em',
                padding: '8px 16px', cursor: saved ? 'default' : 'pointer',
                borderRadius: 3,
              }}
            >
              {saved ? 'Note ✓' : 'Note +'}
            </button>
          )}
        </div>

        <style>{`
          @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>
      </div>
    </div>
  );
}
