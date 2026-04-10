'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { KokoroNote } from '@/types/note';
import type { KokoroNoteDraft } from '@/types/noteMeta';
import type { NoteImageEntry, PersonaKey, PersonaInterpretation } from '@/types/noteImage';
import { getAllNotes, saveNote, deleteNote, togglePin, createNoteId } from '@/lib/kokoro/noteStorage';
import { searchNotes } from '@/lib/kokoro/noteSearch';
import { setNoteForTalk, setNoteForZen } from '@/lib/kokoro/noteLinkage';
import { generateAutoNoteMeta } from '@/lib/kokoro-note/generateAutoNoteMeta';
import { buildTagCloud }    from '@/lib/kokoro-note/buildTagCloud';
import { findRelatedTags }  from '@/lib/kokoro-note/findRelatedTags';
import { filterNotesByTag } from '@/lib/kokoro-note/filterNotesByTag';
import {
  getAllImageNotes, deleteImageNote,
  addPersonaInterpretation, setSelectedPersona,
} from '@/lib/kokoro-note/imageNoteStorage';
import { createRecipeInputFromNote, setRecipeInput } from '@/lib/kokoro/recipeInput';
import type { KokoroRecipeInput } from '@/types/recipe';
import PersonaLoading from '@/components/PersonaLoading';

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

const IMAGE_SOURCE_LABELS: Record<string, string> = {
  'animal-talk': 'Animal Talk',
  fashion: 'Fashion',
};
const IMAGE_SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  'animal-talk': { bg: '#fef3c7', text: '#92400e' },
  fashion: { bg: '#fce7f3', text: '#9d174d' },
};

const PERSONA_INFO: Record<PersonaKey, { label: string; emoji: string; color: string }> = {
  gnome: { label: 'ノーム', emoji: '🌿', color: '#059669' },
  shin:  { label: 'シン',   emoji: '🔍', color: '#2563eb' },
  canon: { label: 'カノン', emoji: '🎵', color: '#7c3aed' },
  dig:   { label: 'ディグ', emoji: '⚡', color: '#dc2626' },
};

const SUGGESTED_TAGS = [
  'メンタル', '恋愛', '仕事', '生活', '創作',
  '矛盾', '感情', '反復', '欲求', '回避',
  '不安', '迷い', '焦り', '悲しみ', '安心',
];

/* ── 型定義 ── */
type View = 'list' | 'detail' | 'edit' | 'imageDetail';

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
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // 画像note関連
  const [imageNotes, setImageNotes] = useState<NoteImageEntry[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [personaLoading, setPersonaLoading] = useState<PersonaKey | null>(null);
  const [noteTab, setNoteTab] = useState<'text' | 'image'>('text');

  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const tagCloud = useMemo(
    () => buildTagCloud(notes, { maxItems: 20 }),
    [notes]
  );

  const relatedTags = useMemo(
    () => selectedTag ? findRelatedTags({ notes, selectedTag, limit: 6 }) : [],
    [notes, selectedTag]
  );

  const filteredNotes = useMemo(
    () => selectedTag ? filterNotesByTag(notes, selectedTag) : notes,
    [notes, selectedTag]
  );

  // マウント時にnotes読み込み
  useEffect(() => {
    setNotes(getAllNotes());
    setImageNotes(getAllImageNotes());
  }, []);

  // Talkからのdraft引き継ぎ / 空で新規作成
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');

    if (mode !== 'create') return;

    const raw = localStorage.getItem('kokoro_note_draft');

    if (raw) {
      // draftがある場合のみ内容をセット（Talk「noteに残す」経由）
      localStorage.removeItem('kokoro_note_draft');
      try {
        const draft = JSON.parse(raw);
        setEditTitle(draft.title ?? '');
        setEditBody(draft.body ?? '');
      } catch { /* ignore */ }
    }
    // draftがない場合（「書きたい」系ワード経由）は空のまま編集画面を開く
    setView('edit');
  }, []);

  // notes再読み込みヘルパー
  const refresh = () => {
    setNotes(getAllNotes());
    setImageNotes(getAllImageNotes());
  };

  // 選択中のnote
  const selectedNote = notes.find(n => n.id === selectedId) ?? null;

  // 一覧: タグフィルタ + 検索 + ピン上位ソート
  const displayNotes = useMemo(() => {
    let list: KokoroNote[];
    if (searchQuery.trim()) {
      const hits = searchNotes(searchQuery).map(h => h.noteId);
      const hitSet = new Set(hits);
      list = filteredNotes.filter(n => hitSet.has(n.id));
    } else {
      list = [...filteredNotes];
    }
    // ピン留めを上に
    list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return list;
  }, [filteredNotes, searchQuery]);

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

  const handleTogglePublic = (id: string) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const updated = { ...note, isPublic: !note.isPublic, updatedAt: new Date().toISOString() };
    saveNote(updated);
    refresh();
  };

  const handleAiSuggest = async () => {
    if (!editBody.trim()) return;
    setAiLoading(true);
    try {
      // まずローカルルールで即時生成
      const draft: KokoroNoteDraft = {
        source: 'manual',
        body: editBody,
      };
      const localMeta = generateAutoNoteMeta(draft);
      if (!editTitle.trim()) setEditTitle(localMeta.title);
      if (!editTags.trim()) setEditTags(localMeta.tags.join(', '));

      // 次にAPIでさらに精度の高いタイトル・タグを取得
      const res = await fetch('/api/kokoro-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editBody }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.title) setEditTitle(data.title);
        if (data.tags?.length) setEditTags(data.tags.join(', '));
      }
    } catch {
      // ローカル生成結果をそのまま使う（エラー時のフォールバック済み）
    } finally {
      setAiLoading(false);
    }
  };

  const addSuggestedTag = (tag: string) => {
    const current = editTags.split(/[,、]/).map(t => t.trim()).filter(Boolean);
    if (!current.includes(tag)) {
      setEditTags([...current, tag].join(', '));
    }
  };

  // 選択中の画像note
  const selectedImageNote = imageNotes.find(n => n.id === selectedImageId) ?? null;

  const openImageDetail = (id: string) => {
    setSelectedImageId(id);
    setView('imageDetail');
  };

  const handleDeleteImageNote = (id: string) => {
    deleteImageNote(id);
    refresh();
    setView('list');
  };

  const handleRequestPersona = async (persona: PersonaKey) => {
    if (!selectedImageNote || personaLoading) return;
    setPersonaLoading(persona);
    try {
      const res = await fetch('/api/kokoro-note-persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona,
          sourceType: selectedImageNote.sourceType,
          resultData: selectedImageNote.result,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const interp: PersonaInterpretation = {
        id: `pi_${Date.now()}`,
        persona,
        createdAt: new Date().toISOString(),
        focus: data.focus || [],
        interpretation: data.interpretation || '',
        highlights: data.highlights || [],
        mood: data.mood || '',
      };
      addPersonaInterpretation(selectedImageNote.id, interp);
      refresh();
      // refresh後にselectedImageIdをキープ
      setSelectedImageId(selectedImageNote.id);
    } catch {
      // silent fail
    } finally {
      setPersonaLoading(null);
    }
  };

  const handleSelectPersona = (persona: PersonaKey) => {
    if (!selectedImageNote) return;
    setSelectedPersona(selectedImageNote.id, persona);
    refresh();
    setSelectedImageId(selectedImageNote.id);
  };

  /* ── 一覧画面 ── */
  const renderList = () => (
    <>
      {/* タブ切り替え */}
      <div className="flex gap-0 mb-6" style={{ borderBottom: '1px solid #e5e7eb' }}>
        <button
          onClick={() => setNoteTab('text')}
          className="px-4 py-2 text-xs font-bold transition-colors"
          style={{
            color: noteTab === 'text' ? '#7c3aed' : '#9ca3af',
            borderBottom: noteTab === 'text' ? '2px solid #7c3aed' : '2px solid transparent',
            background: 'transparent',
          }}
        >
          テキストNote ({notes.length})
        </button>
        <button
          onClick={() => setNoteTab('image')}
          className="px-4 py-2 text-xs font-bold transition-colors"
          style={{
            color: noteTab === 'image' ? '#7c3aed' : '#9ca3af',
            borderBottom: noteTab === 'image' ? '2px solid #7c3aed' : '2px solid transparent',
            background: 'transparent',
          }}
        >
          画像Note ({imageNotes.length})
        </button>
      </div>

      {noteTab === 'image' ? (
        /* 画像ノート一覧 */
        imageNotes.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-4 opacity-30">🖼️</div>
            <p className="text-sm" style={{ color: '#9ca3af' }}>
              画像noteはまだありません
            </p>
            <p className="text-xs mt-2" style={{ color: '#d1d5db' }}>
              Animal Talk や Fashion で結果を保存すると表示されます
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {imageNotes.map(note => (
              <button
                key={note.id}
                onClick={() => openImageDetail(note.id)}
                className="w-full text-left border rounded-xl p-4 transition-colors hover:border-purple-300"
                style={{ borderColor: '#e5e7eb', background: '#ffffff' }}
              >
                <div className="flex items-start gap-3">
                  {note.imageUrl && (
                    <img
                      src={note.imageUrl}
                      alt=""
                      className="rounded-lg flex-shrink-0"
                      style={{ width: 56, height: 56, objectFit: 'cover' }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: IMAGE_SOURCE_COLORS[note.sourceType]?.bg ?? '#f3f4f6',
                          color: IMAGE_SOURCE_COLORS[note.sourceType]?.text ?? '#6b7280',
                        }}
                      >
                        {IMAGE_SOURCE_LABELS[note.sourceType] ?? note.sourceType}
                      </span>
                      <span className="text-[10px]" style={{ color: '#9ca3af' }}>
                        {formatDate(note.createdAt)}
                      </span>
                      {note.selectedPersona && (
                        <span className="text-[10px]" style={{ color: PERSONA_INFO[note.selectedPersona].color }}>
                          {PERSONA_INFO[note.selectedPersona].emoji} {PERSONA_INFO[note.selectedPersona].label}
                        </span>
                      )}
                    </div>
                    <span
                      className="text-sm font-bold truncate block"
                      style={{ color: '#1a1a1a', fontFamily: 'var(--font-noto-serif-jp), serif' }}
                    >
                      {note.autoTitle}
                    </span>
                    {note.sourceType === 'animal-talk' && (
                      <p className="text-xs mt-1 line-clamp-1" style={{ color: '#6b7280' }}>
                        {note.result.emotionText}
                      </p>
                    )}
                    {note.sourceType === 'fashion' && (
                      <p className="text-xs mt-1 line-clamp-1" style={{ color: '#6b7280' }}>
                        {note.result.summary}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )
      ) : (
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

      {/* タグクラウド */}
      {tagCloud.length > 0 && (
        <div className="mb-4 p-4 rounded-xl" style={{ background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.1)' }}>
          <div className="text-xs font-mono tracking-widest mb-3" style={{ color: '#9ca3af' }}>
            // タグで探す
          </div>
          <div className="flex flex-wrap gap-2">
            {tagCloud.map(item => (
              <button
                key={item.tag}
                onClick={() => setSelectedTag(selectedTag === item.tag ? null : item.tag)}
                className="rounded-full transition-all"
                style={{
                  padding: item.size === 'xl' ? '4px 14px' : item.size === 'lg' ? '3px 12px' : '2px 10px',
                  fontSize: item.size === 'xl' ? 15 : item.size === 'lg' ? 13 : item.size === 'md' ? 12 : 11,
                  background: selectedTag === item.tag ? '#7c3aed' : 'rgba(124,58,237,0.08)',
                  color: selectedTag === item.tag ? '#ffffff' : '#7c3aed',
                  border: `1px solid ${selectedTag === item.tag ? '#7c3aed' : 'rgba(124,58,237,0.2)'}`,
                  fontWeight: item.size === 'xl' || item.size === 'lg' ? 600 : 400,
                }}
              >
                {item.tag}
                <span className="ml-1 opacity-60" style={{ fontSize: 10 }}>{item.count}</span>
              </button>
            ))}
          </div>

          {/* 関連タグ */}
          {selectedTag && relatedTags.length > 0 && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(124,58,237,0.1)' }}>
              <span className="text-xs mr-2" style={{ color: '#9ca3af' }}>関連：</span>
              {relatedTags.map(r => (
                <button
                  key={r.tag}
                  onClick={() => setSelectedTag(r.tag)}
                  className="mr-2 mb-1 text-xs px-2.5 py-1 rounded-full transition-all"
                  style={{
                    background: 'rgba(124,58,237,0.05)',
                    color: '#9ca3af',
                    border: '1px solid rgba(124,58,237,0.15)',
                  }}
                >
                  {r.tag}
                </button>
              ))}
            </div>
          )}

          {/* 選択中タグのヘッダ */}
          {selectedTag && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs" style={{ color: '#7c3aed' }}>
                「{selectedTag}」 — {filterNotesByTag(notes, selectedTag).length}件
              </span>
              <button
                onClick={() => setSelectedTag(null)}
                className="text-xs px-2 py-0.5 rounded"
                style={{ color: '#9ca3af', background: 'rgba(0,0,0,0.05)' }}
              >
                ✕ 解除
              </button>
            </div>
          )}
        </div>
      )}

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
    )}
    </>
  );

  /* ── 画像note詳細画面 ── */
  const renderImageDetail = () => {
    if (!selectedImageNote) return null;
    const isAnimal = selectedImageNote.sourceType === 'animal-talk';
    const interpretations = selectedImageNote.personaInterpretations || [];

    return (
      <>
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
              background: IMAGE_SOURCE_COLORS[selectedImageNote.sourceType]?.bg ?? '#f3f4f6',
              color: IMAGE_SOURCE_COLORS[selectedImageNote.sourceType]?.text ?? '#6b7280',
            }}
          >
            {IMAGE_SOURCE_LABELS[selectedImageNote.sourceType]}
          </span>
          <span className="text-[10px]" style={{ color: '#9ca3af' }}>
            {formatDate(selectedImageNote.createdAt)}
          </span>
        </div>

        {/* タイトル */}
        <h2
          className="text-lg font-bold mb-4"
          style={{ color: '#1a1a1a', fontFamily: 'var(--font-noto-serif-jp), serif' }}
        >
          {selectedImageNote.autoTitle}
        </h2>

        {/* 画像 */}
        {selectedImageNote.imageUrl && (
          <div className="mb-6">
            <img
              src={selectedImageNote.imageUrl}
              alt=""
              className="w-full rounded-xl"
              style={{ maxHeight: 300, objectFit: 'cover' }}
            />
          </div>
        )}

        {/* 結果データ */}
        {isAnimal ? (
          <div className="mb-6 space-y-4">
            <div style={{ borderLeft: '2px solid #1a1a1a', paddingLeft: 16 }}>
              <div className="text-[9px] font-mono tracking-widest mb-2" style={{ color: '#9ca3af' }}>// 情念</div>
              <div className="text-sm leading-relaxed" style={{ color: '#374151', fontFamily: 'var(--font-noto-serif-jp), serif' }}>
                {selectedImageNote.result.emotionText}
              </div>
            </div>
            {selectedImageNote.result.trueVoice && (
              <div style={{ borderLeft: '2px solid #c4b5fd', paddingLeft: 16 }}>
                <div className="text-[9px] font-mono tracking-widest mb-2" style={{ color: '#9ca3af' }}>// 本音</div>
                <div className="text-sm leading-relaxed" style={{ color: '#374151', fontFamily: 'var(--font-noto-serif-jp), serif' }}>
                  {selectedImageNote.result.trueVoice}
                </div>
              </div>
            )}
            {selectedImageNote.result.question && (
              <div style={{ borderLeft: '2px solid #7c3aed', paddingLeft: 16 }}>
                <div className="text-[9px] font-mono tracking-widest mb-2" style={{ color: '#7c3aed' }}>// 問い</div>
                <div className="text-sm" style={{ color: '#7c3aed', fontStyle: 'italic', fontFamily: 'var(--font-noto-serif-jp), serif' }}>
                  「{selectedImageNote.result.question}」
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mb-6 space-y-4">
            <div className="text-center mb-4">
              <div className="text-lg font-medium" style={{ color: '#1a1a1a' }}>
                {selectedImageNote.result.styleName}
              </div>
              <div className="flex flex-wrap gap-1.5 justify-center mt-2">
                {selectedImageNote.result.tags.map((tag, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ border: '1px solid #e5e7eb', color: '#6b7280' }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ borderLeft: '2px solid #7c3aed', paddingLeft: 16 }}>
              <div className="text-sm leading-relaxed" style={{ color: '#374151', fontFamily: 'var(--font-noto-serif-jp), serif' }}>
                {selectedImageNote.result.summary}
              </div>
            </div>
          </div>
        )}

        {/* 人格解釈セクション */}
        <div className="mb-6 p-4 rounded-xl" style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
          <div className="text-[9px] font-mono tracking-widest mb-4" style={{ color: '#9ca3af' }}>
            // 人格の視点で読む
          </div>

          {/* 人格ボタン */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {(Object.keys(PERSONA_INFO) as PersonaKey[]).map(key => {
              const info = PERSONA_INFO[key];
              const hasInterp = interpretations.some(i => i.persona === key);
              const isLoading = personaLoading === key;
              return (
                <button
                  key={key}
                  onClick={() => handleRequestPersona(key)}
                  disabled={isLoading}
                  className="text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                  style={{
                    background: hasInterp ? info.color + '15' : 'transparent',
                    color: hasInterp ? info.color : '#9ca3af',
                    border: `1px solid ${hasInterp ? info.color + '40' : '#e5e7eb'}`,
                  }}
                >
                  {isLoading ? '...' : `${info.emoji} ${info.label}`}
                </button>
              );
            })}
          </div>

          {/* 解釈結果 */}
          {interpretations.length > 0 && (
            <div className="space-y-4">
              {interpretations.map(interp => {
                const info = PERSONA_INFO[interp.persona];
                const isSelected = selectedImageNote.selectedPersona === interp.persona;
                return (
                  <div
                    key={interp.id}
                    className="rounded-lg p-3 transition-all"
                    style={{
                      borderLeft: `3px solid ${info.color}`,
                      background: isSelected ? info.color + '08' : '#ffffff',
                      border: isSelected ? `1px solid ${info.color}40` : '1px solid #e5e7eb',
                      borderLeftWidth: 3,
                      borderLeftColor: info.color,
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 14 }}>{info.emoji}</span>
                        <span className="text-xs font-bold" style={{ color: info.color }}>
                          {info.label}
                        </span>
                        {interp.mood && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: info.color + '10', color: info.color }}>
                            {interp.mood}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleSelectPersona(interp.persona)}
                        className="text-[10px] px-2 py-1 rounded transition-all"
                        style={{
                          background: isSelected ? info.color : 'transparent',
                          color: isSelected ? '#fff' : '#9ca3af',
                          border: isSelected ? 'none' : '1px solid #e5e7eb',
                        }}
                      >
                        {isSelected ? '✓ 刺さった' : '刺さった？'}
                      </button>
                    </div>

                    <div
                      className="text-sm leading-relaxed mb-2"
                      style={{ color: '#374151', fontFamily: 'var(--font-noto-serif-jp), serif' }}
                    >
                      {interp.interpretation}
                    </div>

                    {interp.focus.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap mb-1">
                        {interp.focus.map((f, i) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#f3f4f6', color: '#6b7280' }}>
                            {f}
                          </span>
                        ))}
                      </div>
                    )}

                    {interp.highlights.length > 0 && (
                      <div className="mt-2">
                        {interp.highlights.map((h, i) => (
                          <div key={i} className="text-xs" style={{ color: '#9ca3af' }}>
                            — {h}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recipe導線 */}
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => {
              const summary = selectedImageNote.sourceType === 'animal-talk'
                ? `${selectedImageNote.result.emotionText} / ${selectedImageNote.result.trueVoice}`
                : `${selectedImageNote.result.styleName}: ${selectedImageNote.result.summary}`;

              const recipeInput: KokoroRecipeInput = {
                source: 'note',
                relatedSummary: summary,
                currentTheme: [selectedImageNote.sourceType === 'animal-talk' ? '感情' : '自己表現'],
              };
              setRecipeInput(recipeInput);
              router.push('/kokoro-recipe');
            }}
            className="text-xs font-bold px-3 py-2 rounded-lg transition-colors"
            style={{ background: '#fff7ed', color: '#f97316' }}
          >
            🍳 このnoteからRecipeを作る
          </button>
        </div>

        {/* アクションボタン */}
        <div className="flex gap-3 pt-4 border-t" style={{ borderColor: '#e5e7eb' }}>
          <button
            onClick={() => {
              if (confirm('この画像noteを削除しますか？')) handleDeleteImageNote(selectedImageNote.id);
            }}
            className="text-xs font-bold px-4 py-2 rounded-lg transition-colors ml-auto"
            style={{ background: '#fef2f2', color: '#dc2626' }}
          >
            削除
          </button>
        </div>
      </>
    );
  };

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
          <button
            onClick={() => {
              if (!selectedNote) return;
              const recipeInput = createRecipeInputFromNote({
                title: selectedNote.title,
                body: selectedNote.body,
                topic: selectedNote.topic,
                emotionTone: selectedNote.emotionTone ? [selectedNote.emotionTone] : undefined,
              });
              setRecipeInput(recipeInput);
              router.push('/kokoro-recipe');
            }}
            className="text-xs font-bold px-3 py-2 rounded-lg transition-colors"
            style={{ background: '#fff7ed', color: '#f97316' }}
          >
            🍳 このnoteからRecipeを作る
          </button>
        </div>

        {/* Browser公開ボタン */}
        <div className="pt-3">
          <button
            onClick={() => handleTogglePublic(selectedNote.id)}
            className="text-xs font-bold px-3 py-2 rounded-lg transition-colors"
            style={{
              background: selectedNote.isPublic ? '#f0fdf4' : '#f3f4f6',
              color: selectedNote.isPublic ? '#16a34a' : '#6b7280',
              border: `1px solid ${selectedNote.isPublic ? '#bbf7d0' : '#e5e7eb'}`,
            }}
          >
            {selectedNote.isPublic ? '🌐 Browserに公開中　→ 非公開にする' : '🌐 Browserに公開する'}
          </button>
          {selectedNote.isPublic && (
            <div className="text-xs mt-2" style={{ color: '#9ca3af', fontFamily: "'Space Mono', monospace" }}>
              // Kokoro Browser のタイムラインに表示されます
            </div>
          )}
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
        className="text-xs font-bold px-4 py-2 rounded-lg transition-colors mb-2 disabled:opacity-40"
        style={{ background: '#f3f4f6', color: '#6b7280' }}
      >
        {aiLoading ? 'AI生成中...' : 'AIでタイトル・タグを補完'}
      </button>
      {aiLoading && <PersonaLoading />}

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
            href="/kokoro-chat"
            className="text-xs transition-colors"
            style={{ color: '#9ca3af' }}
          >
            ← Talkへ戻る
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
        {view === 'imageDetail' && renderImageDetail()}
        {view === 'edit' && renderEdit()}
      </main>

      {/* フッター */}
      <footer
        className="px-6 py-4 text-center border-t"
        style={{ borderColor: '#e5e7eb' }}
      >
        <span className="text-[10px]" style={{ color: '#9ca3af' }}>
          {notes.length} notes · {imageNotes.length} image notes
        </span>
      </footer>
    </div>
  );
}
