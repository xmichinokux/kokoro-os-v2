'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { KokoroNote } from '@/types/note';
import { getAllNotes, saveNote, deleteNote, togglePin, createNoteId } from '@/lib/kokoro/noteStorage';
import { searchNotes } from '@/lib/kokoro/noteSearch';
import { setNoteForTalk, setNoteForZen } from '@/lib/kokoro/noteLinkage';

/* ── 定数 ── */
const SOURCE_LABELS: Record<string, string> = {
  manual: '手動',
  talk: 'Talk',
  zen: 'Zen',
  emi: 'Emi',
};
const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  manual: { bg: '#f3f4f6', text: '#6b7280' },
  talk:   { bg: '#ede9fe', text: '#7c3aed' },
  zen:    { bg: '#dbeafe', text: '#2563eb' },
  emi:    { bg: '#fce7f3', text: '#db2777' },
};

const SUGGESTED_TAGS = [
  'メンタル', '恋愛', '仕事', '生活', '創作',
  '矛盾', '感情', '反復', '欲求', '回避',
  '不安', '迷い', '焦り', '悲しみ', '安心',
];

/* ── 型定義 ── */
type View = 'list' | 'detail' | 'edit';

/* ── ヘルパー ── */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ── メインコンポーネント ── */
export default function KokoroNotePage() {
  const router = useRouter();
  const [view, setView] = useState<View>('list');
  const [notes, setNotes] = useState<KokoroNote[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 編集用state
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null); // null = 新規
  const [aiLoading, setAiLoading] = useState(false);

  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // マウント時にnotes読み込み
  useEffect(() => {
    setNotes(getAllNotes());
  }, []);

  // notes再読み込みヘルパー
  const refresh = () => setNotes(getAllNotes());

  // 選択中のnote
  const selectedNote = notes.find(n => n.id === selectedId) ?? null;

  // 一覧: 検索 + ピン上位ソート
  const displayNotes = (() => {
    let list = searchQuery.trim()
      ? searchNotes(searchQuery).map(h => notes.find(n => n.id === h.noteId)!).filter(Boolean)
      : [...notes];
    // ピン留めを上に
    list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return list;
  })();

  /* ── アクション ── */
  const openDetail = (id: string) => {
    setSelectedId(id);
    setView('detail');
  };

  const openNew = () => {
    setEditingId(null);
    setEditTitle('');
    setEditBody('');
    setEditTags('');
    setView('edit');
    setTimeout(() => bodyRef.current?.focus(), 100);
  };

  const openEdit = (note: KokoroNote) => {
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditBody(note.body);
    setEditTags(note.tags.join(', '));
    setView('edit');
    setTimeout(() => bodyRef.current?.focus(), 100);
  };

  const handleSave = () => {
    const now = new Date().toISOString();
    const tags = editTags.split(/[,、]/).map(t => t.trim()).filter(Boolean);

    if (editingId) {
      // 更新
      const existing = notes.find(n => n.id === editingId);
      if (existing) {
        saveNote({
          ...existing,
          title: editTitle || editBody.slice(0, 20) || '無題',
          body: editBody,
          tags,
          updatedAt: now,
        });
      }
    } else {
      // 新規
      saveNote({
        id: createNoteId(),
        createdAt: now,
        updatedAt: now,
        source: 'manual',
        title: editTitle || editBody.slice(0, 20) || '無題',
        body: editBody,
        tags,
        pinned: false,
      });
    }
    refresh();
    setView('list');
  };

  const handleDelete = (id: string) => {
    deleteNote(id);
    refresh();
    setView('list');
  };

  const handleTogglePin = (id: string) => {
    togglePin(id);
    refresh();
  };

  const handleAiSuggest = async () => {
    if (!editBody.trim()) return;
    setAiLoading(true);
    try {
      const apiKey = typeof window !== 'undefined'
        ? localStorage.getItem('anthropicApiKey') ?? ''
        : '';
      const res = await fetch('/api/kokoro-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editBody, apiKey }),
      });
      const data = await res.json();
      if (data.title) setEditTitle(data.title);
      if (data.tags?.length) setEditTags(data.tags.join(', '));
    } catch { /* ignore */ }
    setAiLoading(false);
  };

  const addSuggestedTag = (tag: string) => {
    const current = editTags.split(/[,、]/).map(t => t.trim()).filter(Boolean);
    if (!current.includes(tag)) {
      setEditTags([...current, tag].join(', '));
    }
  };

  /* ── 一覧画面 ── */
  const renderList = () => (
    <>
      {/* 検索バー */}
      <div className="mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="キーワードで検索..."
          className="w-full px-4 py-2.5 text-sm rounded-xl border outline-none transition-colors"
          style={{
            borderColor: '#e5e7eb',
            color: '#1a1a1a',
            fontFamily: 'var(--font-noto-serif-jp), serif',
          }}
        />
      </div>

      {/* ノート一覧 */}
      {displayNotes.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-4 opacity-30">📓</div>
          <p className="text-sm" style={{ color: '#9ca3af' }}>
            {searchQuery ? '検索結果がありません' : 'まだメモがありません'}
          </p>
          {!searchQuery && (
            <button
              onClick={openNew}
              className="mt-4 text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              style={{ background: '#ede9fe', color: '#7c3aed' }}
            >
              最初のメモを書く
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {displayNotes.map(note => (
            <button
              key={note.id}
              onClick={() => openDetail(note.id)}
              className="w-full text-left border rounded-xl p-4 transition-colors hover:border-purple-300"
              style={{ borderColor: '#e5e7eb', background: '#ffffff' }}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  {note.pinned && (
                    <span className="text-xs" style={{ color: '#f59e0b' }}>📌</span>
                  )}
                  <span
                    className="text-sm font-bold truncate"
                    style={{ color: '#1a1a1a', fontFamily: 'var(--font-noto-serif-jp), serif' }}
                  >
                    {note.title}
                  </span>
                </div>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
                  style={{
                    background: SOURCE_COLORS[note.source]?.bg ?? '#f3f4f6',
                    color: SOURCE_COLORS[note.source]?.text ?? '#6b7280',
                  }}
                >
                  {SOURCE_LABELS[note.source] ?? note.source}
                </span>
              </div>

              {note.body && (
                <p
                  className="text-xs leading-relaxed mb-2 line-clamp-2"
                  style={{ color: '#6b7280', fontFamily: 'var(--font-noto-serif-jp), serif' }}
                >
                  {note.body}
                </p>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px]" style={{ color: '#9ca3af' }}>
                  {formatDate(note.createdAt)}
                </span>
                {note.tags.map(tag => (
                  <span
                    key={tag}
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: '#f3f4f6', color: '#6b7280' }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );

  /* ── 詳細画面 ── */
  const renderDetail = () => {
    if (!selectedNote) return null;
    return (
      <>
        {/* 戻るリンク */}
        <button
          onClick={() => setView('list')}
          className="text-xs mb-6 flex items-center gap-1 transition-colors"
          style={{ color: '#7c3aed' }}
        >
          ← 一覧へ戻る
        </button>

        {/* メタ情報 */}
        <div className="flex items-center gap-2 mb-4">
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              background: SOURCE_COLORS[selectedNote.source]?.bg ?? '#f3f4f6',
              color: SOURCE_COLORS[selectedNote.source]?.text ?? '#6b7280',
            }}
          >
            {SOURCE_LABELS[selectedNote.source] ?? selectedNote.source}
          </span>
          <span className="text-[10px]" style={{ color: '#9ca3af' }}>
            {formatDate(selectedNote.createdAt)}
          </span>
          {selectedNote.updatedAt !== selectedNote.createdAt && (
            <span className="text-[10px]" style={{ color: '#9ca3af' }}>
              (更新: {formatDate(selectedNote.updatedAt)})
            </span>
          )}
        </div>

        {/* タイトル */}
        <h2
          className="text-lg font-bold mb-4"
          style={{ color: '#1a1a1a', fontFamily: 'var(--font-noto-serif-jp), serif' }}
        >
          {selectedNote.pinned && <span className="mr-1">📌</span>}
          {selectedNote.title}
        </h2>

        {/* 本文 */}
        <div
          className="text-sm leading-relaxed mb-6 whitespace-pre-wrap"
          style={{ color: '#374151', fontFamily: 'var(--font-noto-serif-jp), serif' }}
        >
          {selectedNote.body || '（本文なし）'}
        </div>

        {/* タグ */}
        {selectedNote.tags.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-6">
            {selectedNote.tags.map(tag => (
              <span
                key={tag}
                className="text-xs px-2 py-1 rounded-lg"
                style={{ background: '#f3f4f6', color: '#6b7280' }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* アクションボタン */}
        <div className="flex gap-3 pt-4 border-t" style={{ borderColor: '#e5e7eb' }}>
          <button
            onClick={() => openEdit(selectedNote)}
            className="text-xs font-bold px-4 py-2 rounded-lg transition-colors"
            style={{ background: '#ede9fe', color: '#7c3aed' }}
          >
            編集
          </button>
          <button
            onClick={() => handleTogglePin(selectedNote.id)}
            className="text-xs font-bold px-4 py-2 rounded-lg transition-colors"
            style={{ background: '#f3f4f6', color: '#6b7280' }}
          >
            {selectedNote.pinned ? 'ピン解除' : 'ピン留め'}
          </button>
          <button
            onClick={() => {
              if (confirm('このメモを削除しますか？')) handleDelete(selectedNote.id);
            }}
            className="text-xs font-bold px-4 py-2 rounded-lg transition-colors ml-auto"
            style={{ background: '#fef2f2', color: '#dc2626' }}
          >
            削除
          </button>
        </div>

        {/* 連携ボタン */}
        <div className="flex gap-3 pt-3">
          <button
            onClick={() => {
              setNoteForTalk(selectedNote);
              router.push('/kokoro-chat');
            }}
            className="text-xs font-bold px-4 py-2 rounded-lg transition-colors"
            style={{ background: '#ede9fe', color: '#7c3aed' }}
          >
            💬 Talkで続ける
          </button>
          <button
            onClick={() => {
              setNoteForZen(selectedNote);
              router.push('/kokoro-zen');
            }}
            className="text-xs font-bold px-4 py-2 rounded-lg transition-colors"
            style={{ background: '#dbeafe', color: '#2563eb' }}
          >
            🧘 Zenで整理する
          </button>
        </div>
      </>
    );
  };

  /* ── 作成・編集画面 ── */
  const renderEdit = () => (
    <>
      {/* 戻る */}
      <button
        onClick={() => setView(editingId ? 'detail' : 'list')}
        className="text-xs mb-6 flex items-center gap-1 transition-colors"
        style={{ color: '#7c3aed' }}
      >
        ← {editingId ? '詳細へ戻る' : '一覧へ戻る'}
      </button>

      <h2
        className="text-sm font-bold mb-6"
        style={{ color: '#1a1a1a' }}
      >
        {editingId ? 'メモを編集' : '新しいメモ'}
      </h2>

      {/* タイトル */}
      <div className="mb-4">
        <label className="text-[10px] font-bold mb-1 block" style={{ color: '#6b7280' }}>
          タイトル
        </label>
        <input
          type="text"
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          placeholder="タイトルを入力（空ならAI生成可）"
          className="w-full px-3 py-2 text-sm rounded-lg border outline-none"
          style={{
            borderColor: '#e5e7eb',
            color: '#1a1a1a',
            fontFamily: 'var(--font-noto-serif-jp), serif',
          }}
        />
      </div>

      {/* 本文 */}
      <div className="mb-4">
        <label className="text-[10px] font-bold mb-1 block" style={{ color: '#6b7280' }}>
          本文
        </label>
        <textarea
          ref={bodyRef}
          value={editBody}
          onChange={e => setEditBody(e.target.value)}
          placeholder="思ったこと、気づいたことを書く..."
          rows={8}
          className="w-full px-3 py-2 text-sm rounded-lg border outline-none resize-y"
          style={{
            borderColor: '#e5e7eb',
            color: '#1a1a1a',
            fontFamily: 'var(--font-noto-serif-jp), serif',
          }}
        />
      </div>

      {/* タグ */}
      <div className="mb-4">
        <label className="text-[10px] font-bold mb-1 block" style={{ color: '#6b7280' }}>
          タグ（カンマ区切り）
        </label>
        <input
          type="text"
          value={editTags}
          onChange={e => setEditTags(e.target.value)}
          placeholder="メンタル, 恋愛, 不安..."
          className="w-full px-3 py-2 text-sm rounded-lg border outline-none"
          style={{ borderColor: '#e5e7eb', color: '#1a1a1a' }}
        />
        <div className="flex gap-1.5 flex-wrap mt-2">
          {SUGGESTED_TAGS.map(tag => (
            <button
              key={tag}
              onClick={() => addSuggestedTag(tag)}
              className="text-[10px] px-2 py-0.5 rounded-full border transition-colors hover:border-purple-300"
              style={{ borderColor: '#e5e7eb', color: '#6b7280' }}
            >
              + {tag}
            </button>
          ))}
        </div>
      </div>

      {/* AI補完ボタン */}
      <button
        onClick={handleAiSuggest}
        disabled={aiLoading || !editBody.trim()}
        className="text-xs font-bold px-4 py-2 rounded-lg transition-colors mb-6 disabled:opacity-40"
        style={{ background: '#f3f4f6', color: '#6b7280' }}
      >
        {aiLoading ? 'AI生成中...' : 'AIでタイトル・タグを補完'}
      </button>

      {/* 保存・キャンセル */}
      <div className="flex gap-3 pt-4 border-t" style={{ borderColor: '#e5e7eb' }}>
        <button
          onClick={handleSave}
          disabled={!editBody.trim() && !editTitle.trim()}
          className="text-xs font-bold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-40"
          style={{ background: '#7c3aed', color: '#ffffff' }}
        >
          保存
        </button>
        <button
          onClick={() => setView(editingId ? 'detail' : 'list')}
          className="text-xs font-bold px-4 py-2.5 rounded-lg transition-colors"
          style={{ background: '#f3f4f6', color: '#6b7280' }}
        >
          キャンセル
        </button>
      </div>
    </>
  );

  /* ── レイアウト ── */
  return (
    <div
      className="min-h-screen flex flex-col bg-white"
      style={{ fontFamily: 'var(--font-space-mono), monospace' }}
    >
      {/* ヘッダー */}
      <header
        className="px-6 py-4 flex items-center justify-between border-b"
        style={{ borderColor: '#e5e7eb' }}
      >
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-xs transition-colors"
            style={{ color: '#9ca3af' }}
          >
            ← HOME
          </Link>
          <span
            className="text-xs font-bold tracking-widest"
            style={{ color: '#7c3aed' }}
          >
            // Kokoro Note
          </span>
        </div>
        {view === 'list' && (
          <button
            onClick={openNew}
            className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: '#7c3aed', color: '#ffffff' }}
          >
            + 新規メモ
          </button>
        )}
      </header>

      {/* メインコンテンツ */}
      <main className="flex-1 px-6 py-6 max-w-2xl mx-auto w-full">
        {view === 'list' && renderList()}
        {view === 'detail' && renderDetail()}
        {view === 'edit' && renderEdit()}
      </main>

      {/* フッター */}
      <footer
        className="px-6 py-4 text-center border-t"
        style={{ borderColor: '#e5e7eb' }}
      >
        <span className="text-[10px]" style={{ color: '#9ca3af' }}>
          {notes.length} notes
        </span>
      </footer>
    </div>
  );
}
