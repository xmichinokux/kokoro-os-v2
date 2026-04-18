'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { saveToNote } from '@/lib/saveToNote';
import { saveStrategyInput } from '@/lib/strategyInputs';
import PersonaLoading from '@/components/PersonaLoading';
import {
  getAllSheets, saveSheet, deleteSheet, createEmptySheet,
} from '@/lib/kokoro-kami/sheetStorage';
import type { KamiSheet, KamiColumn } from '@/types/kami';

const mono = { fontFamily: "'Space Mono', monospace" } as const;
const accentColor = '#7c3aed';

type View = 'list' | 'editor';

export default function KokoroKamiPage() {
  const router = useRouter();

  const [view, setView] = useState<View>('list');
  const [sheets, setSheets] = useState<KamiSheet[]>([]);
  const [currentSheet, setCurrentSheet] = useState<KamiSheet | null>(null);

  // エディタ状態
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [strategySaved, setStrategySaved] = useState(false);
  const [addColInput, setAddColInput] = useState('');
  const [addColLoading, setAddColLoading] = useState(false);
  const [addRowInput, setAddRowInput] = useState('');
  const [addRowLoading, setAddRowLoading] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // シート一覧読み込み
  useEffect(() => {
    getAllSheets().then(setSheets);
  }, []);

  // sessionStorage からの受け取り（Talk → Kami）
  useEffect(() => {
    const raw = sessionStorage.getItem('kamiFromTalk');
    if (!raw) return;
    sessionStorage.removeItem('kamiFromTalk');
    let userText = '';
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.userText === 'string') userText = parsed.userText;
    } catch { userText = raw; }
    if (userText) {
      const sheet = createEmptySheet();
      sheet.masterFormula = userText;
      setCurrentSheet(sheet);
      setView('editor');
    }
  }, []);

  // ========================
  // 自動保存（デバウンス）
  // ========================
  const scheduleAutoSave = useCallback((sheet: KamiSheet) => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(async () => {
      await saveSheet(sheet);
      setSheets(await getAllSheets());
    }, 1500);
  }, []);

  const updateSheet = useCallback((updater: (s: KamiSheet) => KamiSheet) => {
    setCurrentSheet(prev => {
      if (!prev) return prev;
      const updated = updater(prev);
      scheduleAutoSave(updated);
      return updated;
    });
  }, [scheduleAutoSave]);

  // ========================
  // フル生成（マスター式 → 表全体）
  // ========================
  const handleGenerate = useCallback(async () => {
    if (!currentSheet?.masterFormula.trim()) return;
    setIsLoading(true); setError('');

    try {
      const res = await fetch('/api/kokoro-kami', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', formula: currentSheet.masterFormula.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const result = data.data as {
        title: string;
        columns: KamiColumn[];
        rows: string[][];
        description: string;
      };

      setCurrentSheet(prev => {
        if (!prev) return prev;
        const updated: KamiSheet = {
          ...prev,
          title: result.title || prev.title,
          columns: result.columns || [],
          rows: result.rows || [],
          description: result.description || '',
        };
        saveSheet(updated).then(() => getAllSheets().then(setSheets));
        return updated;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally { setIsLoading(false); }
  }, [currentSheet?.masterFormula]);

  // ========================
  // 列追加（自然言語で列を追加）
  // ========================
  const handleAddColumn = useCallback(async () => {
    if (!addColInput.trim() || !currentSheet) return;
    setAddColLoading(true); setError('');

    try {
      const res = await fetch('/api/kokoro-kami', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addColumn',
          columns: currentSheet.columns,
          rows: currentSheet.rows,
          columnDescription: addColInput.trim(),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const { column, values } = data.data as { column: KamiColumn; values: string[] };

      updateSheet(s => ({
        ...s,
        columns: [...s.columns, { id: column.id || `col_${Date.now()}`, name: column.name, formula: column.formula }],
        rows: s.rows.map((row, i) => [...row, values[i] ?? '']),
      }));
      setAddColInput('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '列の追加に失敗しました');
    } finally { setAddColLoading(false); }
  }, [addColInput, currentSheet, updateSheet]);

  // ========================
  // 行追加（AI生成）
  // ========================
  const handleAddRows = useCallback(async () => {
    if (!currentSheet) return;
    setAddRowLoading(true); setError('');

    try {
      const res = await fetch('/api/kokoro-kami', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addRows',
          columns: currentSheet.columns,
          rows: currentSheet.rows,
          instruction: addRowInput.trim() || '同じパターンで3行追加してください',
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const { rows: newRows } = data.data as { rows: string[][] };

      updateSheet(s => ({
        ...s,
        rows: [...s.rows, ...newRows],
      }));
      setAddRowInput('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '行の追加に失敗しました');
    } finally { setAddRowLoading(false); }
  }, [currentSheet, addRowInput, updateSheet]);

  // ========================
  // 再計算（formula列だけを現在のデータから再計算）
  // ========================
  const handleRecalculate = useCallback(async () => {
    if (!currentSheet) return;
    const hasFormulaCol = currentSheet.columns.some(c => c.formula && c.formula.trim());
    if (!hasFormulaCol) {
      setError('計算式(formula)を持つ列がありません');
      return;
    }
    setRecalcLoading(true); setError('');

    try {
      const res = await fetch('/api/kokoro-kami', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recalculate',
          columns: currentSheet.columns,
          rows: currentSheet.rows,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const { updates } = data.data as { updates: { columnId: string; values: string[] }[] };

      updateSheet(s => {
        // columnId → カラムインデックスのマップ
        const idToIdx = new Map(s.columns.map((c, i) => [c.id, i]));
        const newRows = s.rows.map(row => [...row]);
        for (const upd of updates) {
          const colIdx = idToIdx.get(upd.columnId);
          if (colIdx === undefined) continue;
          for (let i = 0; i < newRows.length && i < upd.values.length; i++) {
            newRows[i][colIdx] = upd.values[i];
          }
        }
        return { ...s, rows: newRows };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '再計算に失敗しました');
    } finally { setRecalcLoading(false); }
  }, [currentSheet, updateSheet]);

  // ========================
  // セル編集
  // ========================
  const updateCell = useCallback((rowIdx: number, colIdx: number, value: string) => {
    updateSheet(s => ({
      ...s,
      rows: s.rows.map((row, i) =>
        i === rowIdx ? row.map((cell, j) => j === colIdx ? value : cell) : row
      ),
    }));
  }, [updateSheet]);

  // 行削除
  const deleteRow = useCallback((rowIdx: number) => {
    updateSheet(s => ({
      ...s,
      rows: s.rows.filter((_, i) => i !== rowIdx),
    }));
  }, [updateSheet]);

  // 列削除
  const deleteColumn = useCallback((colIdx: number) => {
    updateSheet(s => ({
      ...s,
      columns: s.columns.filter((_, i) => i !== colIdx),
      rows: s.rows.map(row => row.filter((_, i) => i !== colIdx)),
    }));
  }, [updateSheet]);

  // 空行追加
  const addEmptyRow = useCallback(() => {
    updateSheet(s => ({
      ...s,
      rows: [...s.rows, new Array(s.columns.length).fill('')],
    }));
  }, [updateSheet]);

  // ========================
  // エクスポート
  // ========================
  const copyAsTsv = useCallback(async () => {
    if (!currentSheet) return;
    const header = currentSheet.columns.map(c => c.name).join('\t');
    const body = currentSheet.rows.map(r => r.join('\t')).join('\n');
    await navigator.clipboard.writeText(header + '\n' + body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [currentSheet]);

  const handleSaveToNote = useCallback(async () => {
    if (!currentSheet) return;
    const header = currentSheet.columns.map(c => c.name).join('\t');
    const body = currentSheet.rows.map(r => r.join('\t')).join('\n');
    const text = `${currentSheet.title}\n${currentSheet.description}\n\n${header}\n${body}`;
    await saveToNote(text, 'Kami');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [currentSheet]);

  const handleSaveToStrategy = useCallback(() => {
    if (!currentSheet) return;
    const header = currentSheet.columns.map(c => c.name).join('\t');
    const body = currentSheet.rows.map(r => r.join('\t')).join('\n');
    const text = `${currentSheet.title}\n${currentSheet.description}\n\n${header}\n${body}`;
    saveStrategyInput('kami', text);
    setStrategySaved(true);
    setTimeout(() => setStrategySaved(false), 2000);
  }, [currentSheet]);

  // ========================
  // シート操作
  // ========================
  const handleNewSheet = useCallback(() => {
    const sheet = createEmptySheet();
    setCurrentSheet(sheet);
    setView('editor');
    setError('');
  }, []);

  const handleOpenSheet = useCallback((sheet: KamiSheet) => {
    setCurrentSheet(sheet);
    setView('editor');
    setError('');
  }, []);

  const handleDeleteSheet = useCallback(async (id: string) => {
    await deleteSheet(id);
    setSheets(await getAllSheets());
    if (currentSheet?.id === id) {
      setCurrentSheet(null);
      setView('list');
    }
  }, [currentSheet]);

  const handleBackToList = useCallback(async () => {
    // 保存を確実にする
    if (currentSheet) {
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
      await saveSheet(currentSheet);
    }
    setSheets(await getAllSheets());
    setView('list');
    setError('');
  }, [currentSheet]);

  // ========================
  // レンダリング
  // ========================
  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#374151' }}>

      {/* ヘッダー */}
      <header style={{
        padding: '14px 28px', borderBottom: '1px solid #e5e7eb',
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 32, height: 32, border: '1px solid rgba(59,130,246,0.3)',
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(circle at 40% 40%,rgba(59,130,246,0.1) 0%,transparent 70%)',
            fontSize: 16,
          }}>📄</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: accentColor }}>Kami</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>
              {view === 'list' ? 'シート一覧' : '自然言語スプレッドシート'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {view === 'editor' && (
            <button onClick={handleBackToList} style={{
              ...mono, fontSize: 9, letterSpacing: '.12em', color: '#9ca3af',
              background: 'transparent', border: '1px solid #e5e7eb', padding: '5px 14px', borderRadius: 3, cursor: 'pointer',
            }}>← シート一覧</button>
          )}
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 28px 100px' }}>

        {/* ============================================ */}
        {/* シート一覧 */}
        {/* ============================================ */}
        {view === 'list' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: accentColor, textTransform: 'uppercase' }}>
                // シート一覧
              </div>
              <button onClick={handleNewSheet} style={{
                ...mono, fontSize: 10, letterSpacing: '0.14em',
                background: accentColor, border: 'none', color: '#fff',
                padding: '10px 20px', borderRadius: 4, cursor: 'pointer',
              }}>+ 新規シート</button>
            </div>

            {sheets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>📄</div>
                <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>
                  まだシートがありません
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 24 }}>
                  自然言語で「式」を書くだけで、求めたいデータの表が生成されます
                </div>
                <button onClick={handleNewSheet} style={{
                  ...mono, fontSize: 11, letterSpacing: '0.14em',
                  background: accentColor, border: 'none', color: '#fff',
                  padding: '12px 28px', borderRadius: 4, cursor: 'pointer',
                }}>はじめる</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sheets.map(sheet => (
                  <div key={sheet.id} style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    padding: '16px 20px', background: '#f8f9fa',
                    border: '1px solid #e5e7eb', borderRadius: 8,
                    cursor: 'pointer', transition: 'border-color 0.15s',
                  }}
                    onClick={() => handleOpenSheet(sheet)}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = accentColor)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
                        {sheet.title}
                      </div>
                      <div style={{ ...mono, fontSize: 9, color: '#9ca3af' }}>
                        {sheet.columns.length} 列 × {sheet.rows.length} 行
                        {' '}・{' '}
                        {new Date(sheet.updatedAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                      {sheet.masterFormula && (
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>
                          式: {sheet.masterFormula}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteSheet(sheet.id); }}
                      title="削除"
                      style={{ ...mono, fontSize: 9, color: '#d1d5db', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============================================ */}
        {/* シートエディタ */}
        {/* ============================================ */}
        {view === 'editor' && currentSheet && (
          <div>
            {/* タイトル編集 */}
            <input
              value={currentSheet.title}
              onChange={e => updateSheet(s => ({ ...s, title: e.target.value }))}
              style={{
                width: '100%', fontSize: 20, fontWeight: 600, color: '#111827',
                border: 'none', borderBottom: '1px solid transparent', outline: 'none',
                padding: '4px 0', marginBottom: 8, background: 'transparent',
                fontFamily: "'Noto Serif JP', serif",
                boxSizing: 'border-box',
              }}
              onFocus={e => (e.currentTarget.style.borderBottomColor = accentColor)}
              onBlur={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
              placeholder="シートのタイトル"
            />

            {currentSheet.description && (
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16, fontStyle: 'italic' }}>
                {currentSheet.description}
              </div>
            )}

            {/* マスター式（フォーミュラバー） */}
            <div style={{
              marginBottom: 24, padding: '16px',
              background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: 8,
            }}>
              <div style={{ ...mono, fontSize: 9, letterSpacing: '0.16em', color: accentColor, marginBottom: 8 }}>
                // 式 — 求めたいデータを自然言語で記述
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <textarea
                  value={currentSheet.masterFormula}
                  onChange={e => updateSheet(s => ({ ...s, masterFormula: e.target.value }))}
                  placeholder="例: 日本の都道府県トップ10の人口・面積・県庁所在地・人口密度&#10;例: 毎月の売上と経費の管理表。1月〜12月で季節変動を反映&#10;例: プログラミング言語の比較表（用途・難易度・年収）"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isLoading) {
                      e.preventDefault(); handleGenerate();
                    }
                  }}
                  style={{
                    flex: 1, minHeight: 60, resize: 'vertical',
                    fontSize: 13, color: '#111827', padding: '10px 12px',
                    border: '1px solid #d1d5db', borderRadius: 6, outline: 'none',
                    fontFamily: "'Noto Sans JP', sans-serif",
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={handleGenerate}
                  disabled={!currentSheet.masterFormula.trim() || isLoading}
                  style={{
                    ...mono, fontSize: 10, letterSpacing: '0.14em',
                    background: isLoading ? '#9ca3af' : accentColor,
                    border: 'none', color: '#fff', padding: '10px 18px', borderRadius: 4,
                    cursor: currentSheet.masterFormula.trim() && !isLoading ? 'pointer' : 'not-allowed',
                    alignSelf: 'flex-end', whiteSpace: 'nowrap',
                  }}
                >
                  {isLoading ? '...' : currentSheet.columns.length > 0 ? '再計算' : '計算'}
                </button>
              </div>
              <div style={{ ...mono, fontSize: 8, color: '#9ca3af', marginTop: 6 }}>
                ⌘/Ctrl + Enter で実行
              </div>
            </div>

            {isLoading && <PersonaLoading />}

            {error && (
              <div style={{ ...mono, fontSize: 11, color: '#ef4444', lineHeight: 1.8, marginBottom: 16 }}>
                // エラー: {error}
              </div>
            )}

            {/* 表 */}
            {currentSheet.columns.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 500 }}>
                    <thead>
                      <tr>
                        <th style={{
                          width: 32, background: '#f1f3f5', border: '1px solid #d1d5db',
                          padding: '8px 4px', ...mono, fontSize: 8, color: '#d1d5db',
                        }}>#</th>
                        {currentSheet.columns.map((col, i) => (
                          <th key={col.id} style={{
                            background: '#f1f3f5', border: '1px solid #d1d5db',
                            padding: '8px 14px', textAlign: 'left', position: 'relative',
                          }}>
                            <input
                              value={col.name}
                              onChange={e => {
                                const name = e.target.value;
                                updateSheet(s => ({
                                  ...s,
                                  columns: s.columns.map((c, j) => j === i ? { ...c, name } : c),
                                }));
                              }}
                              style={{
                                ...mono, fontSize: 10, letterSpacing: '.08em',
                                color: '#6b7280', background: 'transparent',
                                border: 'none', outline: 'none', width: '100%',
                                textTransform: 'uppercase', fontWeight: 600,
                              }}
                            />
                            {col.formula && (
                              <div style={{ ...mono, fontSize: 7, color: '#9ca3af', marginTop: 2 }} title={col.formula}>
                                f: {col.formula.slice(0, 30)}{col.formula.length > 30 ? '...' : ''}
                              </div>
                            )}
                            <button
                              onClick={() => deleteColumn(i)}
                              title="列を削除"
                              style={{
                                position: 'absolute', top: 2, right: 2,
                                ...mono, fontSize: 8, color: '#d1d5db', background: 'transparent',
                                border: 'none', cursor: 'pointer', padding: '2px 4px',
                              }}
                            >×</button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {currentSheet.rows.map((row, i) => (
                        <tr key={i} style={{ background: i % 2 === 1 ? '#f8f9fa' : 'transparent' }}>
                          <td style={{
                            border: '1px solid #e5e7eb', padding: '6px 4px',
                            ...mono, fontSize: 8, color: '#d1d5db', textAlign: 'center',
                            position: 'relative',
                          }}>
                            {i + 1}
                            <button
                              onClick={() => deleteRow(i)}
                              title="行を削除"
                              style={{
                                position: 'absolute', top: '50%', right: -2,
                                transform: 'translateY(-50%)',
                                ...mono, fontSize: 7, color: 'transparent', background: 'transparent',
                                border: 'none', cursor: 'pointer', padding: '2px',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'transparent')}
                            >×</button>
                          </td>
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
                              onFocus={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.04)')}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* テーブル操作 */}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  {currentSheet.columns.some(c => c.formula && c.formula.trim()) && (
                    <button
                      onClick={handleRecalculate}
                      disabled={recalcLoading}
                      title="数値を編集した後にこれを押すと、計算式を持つ列が再計算されます"
                      style={{
                        ...mono, fontSize: 8, letterSpacing: '.1em', padding: '6px 14px',
                        border: `1px solid ${recalcLoading ? '#9ca3af' : accentColor}`, borderRadius: 3,
                        cursor: recalcLoading ? 'not-allowed' : 'pointer',
                        color: recalcLoading ? '#9ca3af' : accentColor,
                        background: recalcLoading ? '#f3f4f6' : 'transparent',
                      }}
                    >
                      {recalcLoading ? '... 再計算中' : '↻ 再計算'}
                    </button>
                  )}
                  <button onClick={addEmptyRow} style={{
                    ...mono, fontSize: 8, letterSpacing: '.1em', padding: '6px 14px',
                    border: '1px solid #d1d5db', borderRadius: 3, cursor: 'pointer',
                    color: '#9ca3af', background: 'transparent',
                  }}>+ 空行</button>
                  <button onClick={copyAsTsv} style={{
                    ...mono, fontSize: 8, letterSpacing: '.1em', padding: '6px 14px',
                    border: `1px solid ${copied ? accentColor : '#d1d5db'}`, borderRadius: 3, cursor: 'pointer',
                    color: copied ? accentColor : '#9ca3af', background: 'transparent',
                  }}>{copied ? 'Copy ✓' : 'Copy TSV'}</button>
                  <button onClick={handleSaveToNote} style={{
                    ...mono, fontSize: 8, letterSpacing: '.1em', padding: '6px 14px',
                    border: `1px solid ${saved ? '#10b981' : '#d1d5db'}`, borderRadius: 3,
                    cursor: 'pointer', color: saved ? '#10b981' : '#9ca3af', background: 'transparent',
                  }}>{saved ? 'Note ✓' : 'Note +'}</button>
                  <button onClick={handleSaveToStrategy} style={{
                    ...mono, fontSize: 8, letterSpacing: '.1em', padding: '6px 14px',
                    border: `1px solid ${strategySaved ? '#f59e0b' : '#d1d5db'}`, borderRadius: 3,
                    cursor: 'pointer', color: strategySaved ? '#f59e0b' : '#9ca3af', background: 'transparent',
                  }}>{strategySaved ? 'Strategy ✓' : 'Strategy →'}</button>
                </div>
              </div>
            )}

            {/* 列追加（自然言語） */}
            {currentSheet.columns.length > 0 && (
              <div style={{
                marginBottom: 16, padding: '14px 16px',
                background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8,
              }}>
                <div style={{ ...mono, fontSize: 9, letterSpacing: '0.12em', color: '#0284c7', marginBottom: 8 }}>
                  // 列を追加 — 自然言語で新しい列を計算
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={addColInput}
                    onChange={e => setAddColInput(e.target.value)}
                    placeholder="例: 人口密度（人口÷面積）/ 前月比 / 評価（A〜D）"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !addColLoading) handleAddColumn();
                    }}
                    style={{
                      flex: 1, fontSize: 13, padding: '8px 12px',
                      border: '1px solid #bae6fd', borderRadius: 6, outline: 'none',
                      fontFamily: "'Noto Sans JP', sans-serif", color: '#374151',
                    }}
                  />
                  <button onClick={handleAddColumn} disabled={!addColInput.trim() || addColLoading} style={{
                    ...mono, fontSize: 10, background: addColLoading ? '#9ca3af' : '#0284c7',
                    border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 4,
                    cursor: addColInput.trim() && !addColLoading ? 'pointer' : 'not-allowed',
                    whiteSpace: 'nowrap',
                  }}>{addColLoading ? '...' : '+ 列'}</button>
                </div>
              </div>
            )}

            {/* 行追加（AI生成） */}
            {currentSheet.columns.length > 0 && (
              <div style={{
                marginBottom: 16, padding: '14px 16px',
                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
              }}>
                <div style={{ ...mono, fontSize: 9, letterSpacing: '0.12em', color: '#16a34a', marginBottom: 8 }}>
                  // 行を追加 — AIがデータを生成
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={addRowInput}
                    onChange={e => setAddRowInput(e.target.value)}
                    placeholder="追加の指示（空欄なら3行自動追加）"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !addRowLoading) handleAddRows();
                    }}
                    style={{
                      flex: 1, fontSize: 13, padding: '8px 12px',
                      border: '1px solid #bbf7d0', borderRadius: 6, outline: 'none',
                      fontFamily: "'Noto Sans JP', sans-serif", color: '#374151',
                    }}
                  />
                  <button onClick={handleAddRows} disabled={addRowLoading} style={{
                    ...mono, fontSize: 10, background: addRowLoading ? '#9ca3af' : '#16a34a',
                    border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 4,
                    cursor: addRowLoading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                  }}>{addRowLoading ? '...' : '+ 行'}</button>
                </div>
              </div>
            )}

            {/* 列のformula一覧 */}
            {currentSheet.columns.some(c => c.formula) && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ ...mono, fontSize: 9, color: '#6b7280', cursor: 'pointer', padding: '4px 0' }}>
                  列の計算式を見る
                </summary>
                <div style={{ padding: '8px 12px', background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: 6, marginTop: 4 }}>
                  {currentSheet.columns.filter(c => c.formula).map(c => (
                    <div key={c.id} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ ...mono, fontSize: 9, color: accentColor, minWidth: 80 }}>{c.name}</span>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>= {c.formula}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        <style>{`
          @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>
      </div>
    </div>
  );
}
