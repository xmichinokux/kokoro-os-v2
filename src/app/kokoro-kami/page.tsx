'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { saveToNote } from '@/lib/saveToNote';
import PersonaLoading from '@/components/PersonaLoading';

type KamiResult = {
  title: string;
  columns: string[];
  rows: string[][];
  description: string;
};

export default function KokoroKamiPage() {
  const router = useRouter();
  const mono = { fontFamily: "'Space Mono', monospace" };
  const accentColor = '#3b82f6';

  const [inputText, setInputText] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const canSubmit = inputText.trim().length > 0 && !isLoading;
  const hasTable = columns.length > 0;

  const handleRun = useCallback(async () => {
    if (!inputText.trim()) return;
    setIsLoading(true);
    setError('');
    setTitle('');
    setDescription('');
    setColumns([]);
    setRows([]);
    setSaved(false);
    setCopied(false);

    try {
      const res = await fetch('/api/kokoro-kami', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText.trim() }),
      });
      if (!res.ok) throw new Error('表の生成に失敗しました');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const result = data.data as KamiResult;
      setTitle(result.title ?? '');
      setDescription(result.description ?? '');
      setColumns(result.columns ?? []);
      setRows(result.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  }, [inputText]);

  const updateCell = (rowIdx: number, colIdx: number, value: string) => {
    setRows(prev => prev.map((row, i) =>
      i === rowIdx ? row.map((cell, j) => j === colIdx ? value : cell) : row
    ));
  };

  const addRow = () => {
    setRows(prev => [...prev, new Array(columns.length).fill('')]);
  };

  const copyAsTsv = async () => {
    const header = columns.join('\t');
    const body = rows.map(r => r.join('\t')).join('\n');
    const tsv = header + '\n' + body;
    await navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSaveToNote = () => {
    if (!hasTable) return;
    const header = columns.join('\t');
    const bodyRows = rows.map(r => r.join('\t')).join('\n');
    const text = `${title}\n${description}\n\n${header}\n${bodyRows}`;
    saveToNote(text, 'Kami');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  useEffect(() => {
    const raw = sessionStorage.getItem('kamiFromTalk');
    if (!raw) return;
    sessionStorage.removeItem('kamiFromTalk');
    let userText = '';
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.userText === 'string') userText = parsed.userText;
    } catch {
      userText = raw;
    }
    if (userText) setInputText(userText);
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
            width: 32, height: 32, border: `1px solid rgba(59,130,246,0.3)`,
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(circle at 40% 40%,rgba(59,130,246,0.1) 0%,transparent 70%)',
            fontSize: 16,
          }}>📄</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: accentColor }}>Kami</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>AIデータ整理ツール</span>
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

        <p style={{
          fontSize: 13, color: '#9ca3af', lineHeight: 1.9,
          marginBottom: 28, padding: '14px 18px',
          borderLeft: '2px solid #d1d5db', fontStyle: 'italic',
        }}>
          データの整理・表の生成・分析をAIに任せます。何を整理したいか話しかけてください。
        </p>

        <label style={{ ...mono, fontSize: 8, letterSpacing: '.18em', color: '#9ca3af', display: 'block', marginBottom: 10 }}>
          // 何を整理・表にしたいか
        </label>
        <textarea
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder={'例：毎月の売上と経費を管理したい\n例：プロジェクトのタスクと担当者と期限を整理したい\n例：商品の在庫と価格と仕入れ先をまとめたい'}
          style={{
            width: '100%', background: '#f8f9fa',
            border: '1px solid #d1d5db', borderLeft: '2px solid #d1d5db',
            borderRadius: '0 4px 4px 0',
            padding: 14, fontSize: 14, color: '#111827',
            resize: 'vertical', outline: 'none', minHeight: 80,
            fontFamily: "'Noto Sans JP', sans-serif",
            boxSizing: 'border-box',
          }}
          onFocus={e => e.currentTarget.style.borderLeftColor = accentColor}
          onBlur={e => e.currentTarget.style.borderLeftColor = '#d1d5db'}
        />

        <button
          onClick={handleRun}
          disabled={!canSubmit}
          title="表を生成する"
          style={{
            width: '100%', background: 'transparent',
            border: `1px solid ${canSubmit ? accentColor : '#d1d5db'}`,
            color: canSubmit ? accentColor : '#9ca3af',
            ...mono, fontSize: 10, letterSpacing: '.2em',
            padding: 13, cursor: canSubmit ? 'pointer' : 'not-allowed',
            borderRadius: 2, marginTop: 12,
          }}
        >
          {isLoading ? '// 生成中...' : 'Yoroshiku'}
        </button>

        {isLoading && <PersonaLoading />}

        {error && (
          <div style={{ marginTop: 12, ...mono, fontSize: 11, color: '#ef4444', lineHeight: 1.8 }}>
            // エラー: {error}
          </div>
        )}

        {/* 表の表示 */}
        {hasTable && (
          <div style={{ marginTop: 28, animation: 'fadeUp 0.4s ease-out both' }}>
            <div style={{ ...mono, fontSize: 8, color: accentColor, letterSpacing: '.16em', marginBottom: 12 }}>
              {title}
            </div>
            {description && (
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12, fontStyle: 'italic' }}>
                {description}
              </div>
            )}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {columns.map((col, i) => (
                      <th
                        key={i}
                        style={{
                          background: '#f1f3f5', border: '1px solid #d1d5db',
                          padding: '10px 14px', textAlign: 'left',
                          ...mono, fontSize: 9, letterSpacing: '.1em',
                          color: '#9ca3af', textTransform: 'uppercase', fontWeight: 400,
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} style={{ background: i % 2 === 1 ? '#f8f9fa' : 'transparent' }}>
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={e => updateCell(i, j, e.currentTarget.textContent ?? '')}
                          style={{
                            border: '1px solid #e5e7eb', padding: '10px 14px',
                            color: '#374151', lineHeight: 1.6, outline: 'none',
                            transition: 'background 0.15s',
                          }}
                          onFocus={e => e.currentTarget.style.background = 'rgba(59,130,246,0.04)'}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                onClick={addRow}
                title="行を追加"
                style={{
                  ...mono, fontSize: 8, letterSpacing: '.1em',
                  padding: '6px 14px', border: '1px solid #d1d5db',
                  borderRadius: 3, cursor: 'pointer',
                  color: '#9ca3af', background: 'transparent',
                }}
              >
                Row +
              </button>
              <button
                onClick={copyAsTsv}
                title={copied ? 'コピーしました' : 'CSVでコピー'}
                style={{
                  ...mono, fontSize: 8, letterSpacing: '.1em',
                  padding: '6px 14px',
                  border: `1px solid ${copied ? accentColor : '#d1d5db'}`,
                  borderRadius: 3, cursor: 'pointer',
                  color: copied ? accentColor : '#9ca3af', background: 'transparent',
                }}
              >
                {copied ? 'Copy ✓' : 'Copy ↗'}
              </button>
              <button
                onClick={handleSaveToNote}
                disabled={saved}
                title={saved ? 'Noteに保存しました' : 'Noteに保存'}
                style={{
                  ...mono, fontSize: 8, letterSpacing: '.1em',
                  padding: '6px 14px',
                  border: `1px solid ${saved ? '#10b981' : '#d1d5db'}`,
                  borderRadius: 3, cursor: saved ? 'default' : 'pointer',
                  color: saved ? '#10b981' : '#9ca3af', background: 'transparent',
                }}
              >
                {saved ? 'Note ✓' : 'Note +'}
              </button>
            </div>
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
