'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { KokoroNote } from '@/types/note';
import type { KokoroNoteDraft } from '@/types/noteMeta';
import type { NoteImageEntry, PersonaKey, PersonaInterpretation } from '@/types/noteImage';
import { getAllNotes, saveNote, deleteNote, togglePin, createNoteId } from '@/lib/kokoro/noteStorage';
import LoginBanner from '@/components/LoginBanner';
import { searchNotes } from '@/lib/kokoro/noteSearch';
import { setNoteForTalk, setNoteForZen } from '@/lib/kokoro/noteLinkage';
import { generateAutoNoteMeta } from '@/lib/kokoro-note/generateAutoNoteMeta';
import { buildTagCloud }    from '@/lib/kokoro-note/buildTagCloud';
import { findRelatedTags }  from '@/lib/kokoro-note/findRelatedTags';
import { filterNotesByTag } from '@/lib/kokoro-note/filterNotesByTag';
import {
  getAllImageNotes, deleteImageNote, saveImageNote, createImageNoteId,
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
  manual: '手動',
};
const IMAGE_SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  'animal-talk': { bg: '#fef3c7', text: '#92400e' },
  fashion: { bg: '#fce7f3', text: '#9d174d' },
  manual: { bg: '#f3f4f6', text: '#6b7280' },
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
  const [noteTab, setNoteTab] = useState<'all' | 'text' | 'image'>('all');
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const editImageRef = useRef<HTMLInputElement>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [editImageBase64, setEditImageBase64] = useState<string | null>(null);

  // 商品登録用state
  const [showProductForm, setShowProductForm] = useState(false);
  const [productPrice, setProductPrice] = useState(0);
  const [productDescription, setProductDescription] = useState('');
  const [productExternalUrl, setProductExternalUrl] = useState('');
  const [productType, setProductType] = useState('pdf');
  const [productAuthorName, setProductAuthorName] = useState('');
  const [productRegistering, setProductRegistering] = useState(false);
  const [aiPricing, setAiPricing] = useState<{ suggestedPrice: number; evaluation: string; reason: string; shouldRaise: boolean; raiseMessage: string } | null>(null);
  const [aiPricingLoading, setAiPricingLoading] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);

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
    getAllNotes().then(setNotes);
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
  const refresh = async () => {
    setNotes(await getAllNotes());
    setImageNotes(getAllImageNotes());
  };

  // 選択中のnote
  const selectedNote = notes.find(n => n.id === selectedId) ?? null;

  // 検索ヒットID
  const [searchHitIds, setSearchHitIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchHitIds(null); return; }
    searchNotes(searchQuery).then(hits => setSearchHitIds(new Set(hits.map(h => h.noteId))));
  }, [searchQuery]);

  // 一覧: タグフィルタ + 検索 + ピン上位ソート
  const displayNotes = useMemo(() => {
    let list: KokoroNote[];
    if (searchHitIds) {
      list = filteredNotes.filter(n => searchHitIds.has(n.id));
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
    setEditImagePreview(null);
    setEditImageBase64(null);
    setView('edit');
    setTimeout(() => bodyRef.current?.focus(), 100);
  };

  const handleEditImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1024;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = (h / w) * MAX; w = MAX; }
          else { w = (w / h) * MAX; h = MAX; }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setEditImagePreview(dataUrl);
        setEditImageBase64(dataUrl.split(',')[1]);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const openEdit = (note: KokoroNote) => {
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditBody(note.body);
    setEditTags(note.tags.join(', '));
    setView('edit');
    setTimeout(() => bodyRef.current?.focus(), 100);
  };

  const handleSave = async () => {
    const now = new Date().toISOString();
    const tags = editTags.split(/[,、]/).map(t => t.trim()).filter(Boolean);

    if (editingId) {
      // 更新
      const existing = notes.find(n => n.id === editingId);
      if (existing) {
        await saveNote({
          ...existing,
          title: editTitle || editBody.slice(0, 20) || '無題',
          body: editBody,
          tags,
          updatedAt: now,
        });
      }
    } else {
      // 新規テキストNote
      await saveNote({
        id: createNoteId(),
        createdAt: now,
        updatedAt: now,
        source: 'manual',
        title: editTitle || editBody.slice(0, 20) || '無題',
        body: editBody,
        tags,
        pinned: false,
        isPublic: editIsPublic,
      });

      // 画像が添付されていれば画像Noteも作成
      if (editImageBase64 && editImagePreview) {
        const imgEntry = {
          id: createImageNoteId(),
          createdAt: now,
          sourceType: 'manual' as const,
          imageUrl: editImagePreview,
          autoTitle: editTitle || editBody.slice(0, 20) || '画像メモ',
          result: { emotionText: editBody },
        } satisfies NoteImageEntry;
        saveImageNote(imgEntry);
      }
    }
    setEditImagePreview(null);
    setEditImageBase64(null);
    await refresh();
    setView('list');
  };

  const handleDelete = async (id: string) => {
    await deleteNote(id);
    await refresh();
    setView('list');
  };

  const handleTogglePin = async (id: string) => {
    await togglePin(id);
    await refresh();
  };

  const handleTogglePublic = async (id: string) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    // 商品は常に公開（非公開にできない）
    if (note.isProduct && note.isPublic) return;
    const updated = { ...note, isPublic: !note.isPublic, updatedAt: new Date().toISOString() };
    await saveNote(updated);
    await refresh();
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
      <div style={{ display:'flex', gap:0, marginBottom:24, borderBottom:'1px solid #e5e7eb' }}>
        {([
          { key: 'all' as const, label: `全てのNote (${notes.length + imageNotes.length})` },
          { key: 'text' as const, label: `テキスト (${notes.length})` },
          { key: 'image' as const, label: `画像 (${imageNotes.length})` },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => { setNoteTab(tab.key); setDeleteMode(false); setSelectedForDelete(new Set()); }}
            style={{
              fontFamily:"'Space Mono', monospace", fontSize:10, fontWeight:700,
              padding:'8px 16px', background:'transparent', border:'none', cursor:'pointer',
              color: noteTab === tab.key ? '#7c3aed' : '#9ca3af',
              borderBottom: noteTab === tab.key ? '2px solid #7c3aed' : '2px solid transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 削除モードコントロール */}
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12, gap:8 }}>
        {deleteMode ? (
          <>
            <button
              onClick={async () => {
                if (selectedForDelete.size === 0) return;
                if (!confirm(`${selectedForDelete.size}件のNoteを削除しますか？`)) return;
                for (const id of selectedForDelete) {
                  await deleteNote(id);
                  deleteImageNote(id);
                }
                setSelectedForDelete(new Set());
                setDeleteMode(false);
                await refresh();
              }}
              disabled={selectedForDelete.size === 0}
              style={{ fontFamily:"'Space Mono', monospace", fontSize:9, padding:'4px 12px', borderRadius:4, background: selectedForDelete.size > 0 ? '#fef2f2' : '#f3f4f6', color: selectedForDelete.size > 0 ? '#dc2626' : '#9ca3af', border:'1px solid #e5e7eb', cursor:'pointer' }}
            >
              {selectedForDelete.size > 0 ? `${selectedForDelete.size}件を削除` : '削除'}
            </button>
            <button
              onClick={() => { setDeleteMode(false); setSelectedForDelete(new Set()); }}
              style={{ fontFamily:"'Space Mono', monospace", fontSize:9, padding:'4px 12px', borderRadius:4, background:'#f3f4f6', color:'#6b7280', border:'1px solid #e5e7eb', cursor:'pointer' }}
            >
              キャンセル
            </button>
          </>
        ) : (
          <button
            onClick={() => setDeleteMode(true)}
            style={{ fontFamily:"'Space Mono', monospace", fontSize:9, padding:'4px 12px', borderRadius:4, background:'transparent', color:'#9ca3af', border:'1px solid #e5e7eb', cursor:'pointer' }}
          >
            選択して削除
          </button>
        )}
      </div>

      {/* 画像ノート一覧（image タブのみ） */}
      {noteTab === 'image' && (
        imageNotes.length === 0 ? (
          <div style={{ textAlign:'center', padding:'80px 20px' }}>
            <div style={{ fontSize:36, marginBottom:16, opacity:0.3 }}>🖼️</div>
            <p style={{ fontSize:13, color:'#9ca3af' }}>画像noteはまだありません</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {imageNotes.map(note => (
              <div key={note.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
                {deleteMode && (
                  <input type="checkbox" checked={selectedForDelete.has(note.id)}
                    onChange={() => { const s = new Set(selectedForDelete); s.has(note.id) ? s.delete(note.id) : s.add(note.id); setSelectedForDelete(s); }}
                    style={{ width:16, height:16, flexShrink:0, cursor:'pointer' }} />
                )}
                <button
                  onClick={() => !deleteMode && openImageDetail(note.id)}
                  style={{ flex:1, textAlign:'left', border:'1px solid #e5e7eb', borderRadius:12, padding:16, background:'#fff', cursor: deleteMode ? 'default' : 'pointer' }}
                >
                  <div style={{ display:'flex', alignItems:'start', gap:12 }}>
                    {note.imageUrl && (
                      <img src={note.imageUrl} alt="" style={{ width:48, height:48, borderRadius:8, objectFit:'cover', flexShrink:0 }} />
                    )}
                    <div style={{ minWidth:0, flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                        <span style={{ fontSize:10, color:'#9ca3af' }}>{formatDate(note.createdAt)}</span>
                      </div>
                      <span style={{ fontSize:13, fontWeight:700, color:'#1a1a1a', display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {note.autoTitle}
                      </span>
                    </div>
                  </div>
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {(noteTab === 'text' || noteTab === 'all') && (
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

      {/* ノート一覧（allタブ時は画像noteも混在） */}
      {(() => {
        // allタブ時は画像noteも混ぜて時間順ソート
        type UnifiedItem = { type: 'text'; note: KokoroNote } | { type: 'image'; note: NoteImageEntry };
        let unifiedList: UnifiedItem[] = displayNotes.map(n => ({ type: 'text' as const, note: n }));
        if (noteTab === 'all') {
          const imgItems: UnifiedItem[] = imageNotes.map(n => ({ type: 'image' as const, note: n }));
          unifiedList = [...unifiedList, ...imgItems];
          // ピン留めテキストを上に、それ以外は時間降順
          unifiedList.sort((a, b) => {
            const aPinned = a.type === 'text' && a.note.pinned;
            const bPinned = b.type === 'text' && b.note.pinned;
            if (aPinned && !bPinned) return -1;
            if (!aPinned && bPinned) return 1;
            return new Date(b.note.createdAt).getTime() - new Date(a.note.createdAt).getTime();
          });
        }

        if (unifiedList.length === 0) {
          return (
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
          );
        }

        return (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {unifiedList.map(item => {
              if (item.type === 'image') {
                const imgNote = item.note;
                return (
                  <div key={imgNote.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {deleteMode && (
                      <input type="checkbox" checked={selectedForDelete.has(imgNote.id)}
                        onChange={() => { const s = new Set(selectedForDelete); s.has(imgNote.id) ? s.delete(imgNote.id) : s.add(imgNote.id); setSelectedForDelete(s); }}
                        style={{ width:16, height:16, flexShrink:0, cursor:'pointer' }} />
                    )}
                    <button
                      onClick={() => !deleteMode && openImageDetail(imgNote.id)}
                      style={{ flex:1, textAlign:'left', border:'1px solid #e5e7eb', borderRadius:12, padding:16, background:'#fff', cursor: deleteMode ? 'default' : 'pointer' }}
                    >
                      <div style={{ display:'flex', alignItems:'start', gap:12 }}>
                        {imgNote.imageUrl && (
                          <img src={imgNote.imageUrl} alt="" style={{ width:48, height:48, borderRadius:8, objectFit:'cover', flexShrink:0 }} />
                        )}
                        <div style={{ minWidth:0, flex:1 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                            <span style={{ fontSize:10, color:'#9ca3af' }}>{formatDate(imgNote.createdAt)}</span>
                          </div>
                          <span style={{ fontSize:13, fontWeight:700, color:'#1a1a1a', display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {imgNote.autoTitle}
                          </span>
                        </div>
                      </div>
                    </button>
                  </div>
                );
              }

              const note = item.note;
              return (
                <div key={note.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  {deleteMode && (
                    <input type="checkbox" checked={selectedForDelete.has(note.id)}
                      onChange={() => { const s = new Set(selectedForDelete); s.has(note.id) ? s.delete(note.id) : s.add(note.id); setSelectedForDelete(s); }}
                      style={{ width:16, height:16, flexShrink:0, cursor:'pointer' }} />
                  )}
                  <button
                    onClick={() => !deleteMode && openDetail(note.id)}
                    style={{ flex:1, textAlign:'left', border:'1px solid #e5e7eb', borderRadius:12, padding:16, background:'#fff', cursor: deleteMode ? 'default' : 'pointer' }}
                  >
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                      {note.pinned && <span style={{ fontSize:12, color:'#f59e0b' }}>📌</span>}
                      <span style={{ fontSize:13, fontWeight:700, color:'#1a1a1a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {note.title}
                      </span>
                    </div>

                    {note.body && (
                      <p style={{ fontSize:12, color:'#6b7280', lineHeight:1.6, marginBottom:8, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
                        {note.body}
                      </p>
                    )}

                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <span style={{ fontSize:10, color:'#9ca3af' }}>{formatDate(note.createdAt)}</span>
                      {note.tags.map(tag => (
                        <span key={tag} style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:'#f3f4f6', color:'#6b7280' }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        );
      })()}
    </>
    )}
    </>
  );

  /* ── 画像note詳細画面 ── */
  const renderImageDetail = () => {
    if (!selectedImageNote) return null;
    const isAnimal = selectedImageNote.sourceType === 'animal-talk';
    const isFashion = selectedImageNote.sourceType === 'fashion';
    const isManual = selectedImageNote.sourceType === 'manual';
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
        ) : isFashion && selectedImageNote.sourceType === 'fashion' ? (
          <div className="mb-6 space-y-4">
            <div className="text-center mb-4">
              <div className="text-lg font-medium" style={{ color: '#1a1a1a' }}>
                {selectedImageNote.result.styleName}
              </div>
              <div className="flex flex-wrap gap-1.5 justify-center mt-2">
                {selectedImageNote.result.tags.map((tag: string, i: number) => (
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
        ) : isManual && selectedImageNote.sourceType === 'manual' ? (
          <div className="mb-6">
            {selectedImageNote.result.emotionText && (
              <div style={{ borderLeft: '2px solid #9ca3af', paddingLeft: 16 }}>
                <div className="text-sm leading-relaxed" style={{ color: '#374151', fontFamily: 'var(--font-noto-serif-jp), serif', whiteSpace: 'pre-wrap' }}>
                  {selectedImageNote.result.emotionText}
                </div>
              </div>
            )}
          </div>
        ) : null}

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
                : selectedImageNote.sourceType === 'fashion'
                  ? `${selectedImageNote.result.styleName}: ${selectedImageNote.result.summary}`
                  : selectedImageNote.autoTitle;

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
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
          <span style={{ fontSize:10, color:'#9ca3af' }}>{formatDate(selectedNote.createdAt)}</span>
          {selectedNote.updatedAt !== selectedNote.createdAt && (
            <span style={{ fontSize:10, color:'#9ca3af' }}>(更新: {formatDate(selectedNote.updatedAt)})</span>
          )}
        </div>

        {/* タイトル */}
        <h2 style={{ fontSize:18, fontWeight:700, color:'#1a1a1a', marginBottom:16 }}>
          {selectedNote.pinned && <span style={{ marginRight:4 }}>📌</span>}
          {selectedNote.title}
        </h2>

        {/* 本文 */}
        <div style={{ fontSize:14, lineHeight:2, color:'#374151', marginBottom:24, whiteSpace:'pre-wrap' }}>
          {selectedNote.body || '（本文なし）'}
        </div>

        {/* タグ */}
        {selectedNote.tags.length > 0 && (
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:24 }}>
            {selectedNote.tags.map(tag => (
              <span key={tag} style={{ fontSize:11, padding:'3px 10px', borderRadius:8, background:'#f3f4f6', color:'#6b7280' }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* 公開/非公開トグル */}
        <div style={{ paddingTop:16, borderTop:'1px solid #e5e7eb', marginBottom:16 }}>
          {selectedNote.isProduct ? (
            <span style={{
              fontFamily:"'Space Mono', monospace", fontSize:10, fontWeight:700,
              padding:'8px 16px', borderRadius:6, display:'inline-block',
              background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0',
            }}>
              🌐 商品は常に公開されます
            </span>
          ) : (
            <button
              onClick={() => handleTogglePublic(selectedNote.id)}
              style={{
                fontFamily:"'Space Mono', monospace", fontSize:10, fontWeight:700,
                padding:'8px 16px', borderRadius:6, cursor:'pointer',
                background: selectedNote.isPublic ? '#f0fdf4' : '#f3f4f6',
                color: selectedNote.isPublic ? '#16a34a' : '#6b7280',
                border: `1px solid ${selectedNote.isPublic ? '#bbf7d0' : '#e5e7eb'}`,
              }}
            >
              {selectedNote.isPublic ? '🌐 公開中 → 非公開にする' : '🌐 Browserに公開する'}
            </button>
          )}

          {/* 商品として登録 / 商品設定を編集 */}
          <button
            onClick={() => {
              if (selectedNote.isProduct) {
                // 既存値をプリフィル
                setProductPrice(selectedNote.productPrice || 0);
                setProductDescription(selectedNote.productDescription || '');
                setProductExternalUrl(selectedNote.productExternalUrl || '');
                setProductType(selectedNote.productType || 'pdf');
                setProductAuthorName(selectedNote.authorName || '');
              } else {
                setProductPrice(0);
                setProductDescription('');
                setProductExternalUrl('');
                setProductType('pdf');
                setProductAuthorName('');
              }
              setAiPricing(null);
              setShowProductForm(true);
            }}
            style={{
              fontFamily:"'Space Mono', monospace", fontSize:10, fontWeight:700,
              padding:'8px 16px', borderRadius:6, cursor:'pointer', marginLeft:8,
              background:'#fef3c7', color:'#92400e', border:'1px solid #fde68a',
            }}
          >
            {selectedNote.isProduct
              ? `🏷 商品設定を編集 (¥${selectedNote.productPrice?.toLocaleString()})`
              : '🏷 商品として登録する'}
          </button>
        </div>

        {/* AI鑑定バッジ表示トグル */}
        {selectedNote.isProduct && selectedNote.aiPricedAmount && (
          <div style={{
            display:'flex', alignItems:'center', gap:10, marginBottom:16,
            padding:'10px 14px', background: selectedNote.showAiBadge ? '#fef3c7' : '#f9fafb',
            border: `1px solid ${selectedNote.showAiBadge ? '#fde68a' : '#e5e7eb'}`,
            borderRadius:8,
          }}>
            <span style={{
              fontFamily:"'Space Mono', monospace", fontSize:10,
              color: selectedNote.showAiBadge ? '#92400e' : '#6b7280',
              background: selectedNote.showAiBadge ? '#f59e0b' : '#e5e7eb',
              padding:'2px 8px', borderRadius:4, fontWeight:700,
              letterSpacing:'0.05em',
              ...(selectedNote.showAiBadge ? { color:'#fff' } : {}),
            }}>
              AI鑑定 ¥{selectedNote.aiPricedAmount.toLocaleString()}
            </span>
            <button
              onClick={async () => {
                const newVal = !selectedNote.showAiBadge;
                // Supabase を直接更新
                try {
                  const res = await fetch('/api/kokoro-products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      noteId: selectedNote.id,
                      productPrice: selectedNote.productPrice,
                      productDescription: selectedNote.productDescription || '',
                      productExternalUrl: selectedNote.productExternalUrl || '',
                      productType: selectedNote.productType || 'text',
                      authorName: selectedNote.authorName || '匿名',
                      aiPricedAmount: selectedNote.aiPricedAmount,
                      showAiBadge: newVal,
                    }),
                  });
                  const data = await res.json();
                  if (data.error) throw new Error(data.error);
                  const all = await getAllNotes();
                  setNotes(all);
                } catch (e) {
                  console.error(e);
                }
              }}
              style={{
                fontFamily:"'Space Mono', monospace", fontSize:9, cursor:'pointer',
                padding:'4px 10px', borderRadius:4,
                background: selectedNote.showAiBadge ? '#fff' : '#f59e0b',
                color: selectedNote.showAiBadge ? '#6b7280' : '#fff',
                border: selectedNote.showAiBadge ? '1px solid #e5e7eb' : 'none',
              }}
            >
              {selectedNote.showAiBadge ? 'バッジを非表示にする' : 'Browserにバッジを表示する'}
            </button>
          </div>
        )}

        {/* 商品登録・編集フォーム */}
        {showProductForm && (
          <div style={{
            padding:'20px', background:'#fffbeb', border:'1px solid #fde68a',
            borderRadius:8, marginBottom:16,
          }}>
            <div style={{ fontFamily:"'Space Mono', monospace", fontSize:9, letterSpacing:'0.12em', color:'#92400e', marginBottom:16 }}>
              // {selectedNote.isProduct ? '商品設定の編集' : '商品として登録'}
            </div>

            {/* AI値付け */}
            <div style={{ marginBottom:16, padding:'12px', background:'#fff', border:'1px solid #e5e7eb', borderRadius:6 }}>
              <button
                onClick={async () => {
                  setAiPricingLoading(true);
                  try {
                    const res = await fetch('/api/kokoro-product-pricing', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        title: selectedNote.title,
                        body: selectedNote.body,
                        productType,
                        userPrice: productPrice || undefined,
                      }),
                    });
                    const data = await res.json();
                    if (data.error) throw new Error(data.error);
                    setAiPricing(data.data);
                    if (data.data.suggestedPrice && (!productPrice || data.data.suggestedPrice > productPrice)) {
                      setProductPrice(data.data.suggestedPrice);
                    }
                  } catch (e) {
                    console.error(e);
                  } finally { setAiPricingLoading(false); }
                }}
                disabled={aiPricingLoading}
                style={{
                  fontFamily:"'Space Mono', monospace", fontSize:10,
                  padding:'8px 16px', borderRadius:4, cursor: aiPricingLoading ? 'not-allowed' : 'pointer',
                  background: aiPricingLoading ? '#9ca3af' : '#f59e0b', color:'#fff', border:'none',
                  marginBottom: aiPricing ? 8 : 0,
                }}
              >
                {aiPricingLoading ? '査定中...' : '🤖 AI値付け'}
              </button>
              {aiPricing && (
                <div style={{ marginTop:8 }}>
                  <div style={{ fontSize:13, color:'#374151', lineHeight:1.8, marginBottom:4 }}>
                    {aiPricing.evaluation}
                  </div>
                  <div style={{ fontSize:12, color:'#6b7280', marginBottom:4 }}>{aiPricing.reason}</div>
                  {aiPricing.shouldRaise && aiPricing.raiseMessage && (
                    <div style={{
                      fontSize:12, color:'#b45309', fontWeight:600,
                      padding:'6px 10px', background:'#fef3c7', borderRadius:4, marginTop:4,
                    }}>
                      💡 {aiPricing.raiseMessage}
                    </div>
                  )}
                  <div style={{ fontFamily:"'Space Mono', monospace", fontSize:11, color:'#f59e0b', fontWeight:700, marginTop:4 }}>
                    提案価格: ¥{aiPricing.suggestedPrice.toLocaleString()}
                  </div>
                </div>
              )}
            </div>

            {/* フォーム */}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div>
                <label style={{ fontFamily:"'Space Mono', monospace", fontSize:8, color:'#92400e', display:'block', marginBottom:4 }}>価格（円）</label>
                <input type="number" value={productPrice} onChange={e => setProductPrice(Math.max(0, parseInt(e.target.value) || 0))}
                  style={{ width:'100%', padding:'8px 12px', border:'1px solid #fde68a', borderRadius:4, fontSize:14, outline:'none', boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ fontFamily:"'Space Mono', monospace", fontSize:8, color:'#92400e', display:'block', marginBottom:4 }}>商品の説明</label>
                <textarea value={productDescription} onChange={e => setProductDescription(e.target.value)}
                  placeholder="この作品について一言"
                  style={{ width:'100%', padding:'8px 12px', border:'1px solid #fde68a', borderRadius:4, fontSize:13, outline:'none', minHeight:60, resize:'vertical', boxSizing:'border-box', fontFamily:"'Noto Sans JP', sans-serif" }} />
              </div>
              <div>
                <label style={{ fontFamily:"'Space Mono', monospace", fontSize:8, color:'#92400e', display:'block', marginBottom:4 }}>外部決済URL</label>
                <input type="url" value={productExternalUrl} onChange={e => setProductExternalUrl(e.target.value)}
                  placeholder="https://..."
                  style={{ width:'100%', padding:'8px 12px', border:'1px solid #fde68a', borderRadius:4, fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:"'Space Mono', monospace", marginBottom:6 }} />
                <div style={{ fontSize:10, color:'#92400e', lineHeight:1.8, padding:'6px 8px', background:'#fff8e1', borderRadius:4 }}>
                  有料販売する場合: <strong>BOOTH</strong> → booth.pm で商品ページを作成しURLを貼る / <strong>Stripe Payment Links</strong> → dashboard.stripe.com で決済リンクを作成しURLを貼る。空欄の場合、登録後に「PDF を生成する」で無料ダウンロードリンクを設定できます。
                </div>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <div style={{ flex:1 }}>
                  <label style={{ fontFamily:"'Space Mono', monospace", fontSize:8, color:'#92400e', display:'block', marginBottom:4 }}>商品タイプ</label>
                  <select value={productType} onChange={e => setProductType(e.target.value)}
                    style={{ width:'100%', padding:'8px 12px', border:'1px solid #fde68a', borderRadius:4, fontSize:13, outline:'none', background:'#fff' }}>
                    <option value="pdf">PDF（文章）</option>
                    <option value="data">データ（表・CSV）</option>
                    <option value="svg">SVG（ベクター）</option>
                    <option value="html">HTML（Web作品）</option>
                    <option value="text">テキスト</option>
                    <option value="other">その他</option>
                  </select>
                </div>
                <div style={{ flex:1 }}>
                  <label style={{ fontFamily:"'Space Mono', monospace", fontSize:8, color:'#92400e', display:'block', marginBottom:4 }}>出品者名</label>
                  <input type="text" value={productAuthorName} onChange={e => setProductAuthorName(e.target.value)}
                    placeholder="表示名"
                    style={{ width:'100%', padding:'8px 12px', border:'1px solid #fde68a', borderRadius:4, fontSize:13, outline:'none', boxSizing:'border-box' }} />
                </div>
              </div>
            </div>

            {/* PDF生成セクション */}
            <div style={{ marginTop:16, padding:'12px', background:'#fff', border:'1px solid #e5e7eb', borderRadius:6 }}>
              <div style={{ fontFamily:"'Space Mono', monospace", fontSize:8, color:'#6b7280', marginBottom:8, letterSpacing:'0.1em' }}>
                // PDF生成
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                <button
                  onClick={async () => {
                    setPdfGenerating(true);
                    try {
                      // まだ商品登録されていない場合は先に登録
                      if (!selectedNote.isProduct) {
                        const regRes = await fetch('/api/kokoro-products', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            noteId: selectedNote.id,
                            productPrice: productPrice || 0,
                            productDescription,
                            productExternalUrl,
                            productType,
                            authorName: productAuthorName || '匿名',
                            aiPricedAmount: aiPricing?.suggestedPrice || undefined,
                            showAiBadge: !!aiPricing,
                          }),
                        });
                        const regData = await regRes.json();
                        if (regData.error) throw new Error(regData.error);
                      }
                      const res = await fetch('/api/kokoro-pdf', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ noteId: selectedNote.id }),
                      });
                      const data = await res.json();
                      if (data.error) throw new Error(data.error);
                      setProductExternalUrl(data.url);
                      const all = await getAllNotes();
                      setNotes(all);
                    } catch (e) {
                      alert(e instanceof Error ? e.message : 'PDF 生成に失敗しました');
                    } finally { setPdfGenerating(false); }
                  }}
                  disabled={pdfGenerating}
                  style={{
                    fontFamily:"'Space Mono', monospace", fontSize:10, fontWeight:700,
                    padding:'8px 16px', borderRadius:4, cursor: pdfGenerating ? 'not-allowed' : 'pointer',
                    background: pdfGenerating ? '#9ca3af' : '#7c3aed', color:'#fff', border:'none',
                  }}
                >
                  {pdfGenerating ? 'PDF生成中...' : 'PDF を生成する'}
                </button>
                <span style={{ fontFamily:"'Space Mono', monospace", fontSize:8, color:'#9ca3af' }}>
                  Note の内容から A4 PDF を自動生成します
                </span>
              </div>
              {/* PDF URL表示 + ダウンロード */}
              {(productExternalUrl && productExternalUrl.includes('kokoro-pdfs')) && (
                <div style={{ marginTop:10, padding:'10px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:6 }}>
                  <div style={{ fontFamily:"'Space Mono', monospace", fontSize:8, color:'#16a34a', marginBottom:6, letterSpacing:'0.1em' }}>
                    // 生成済み PDF
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                    <a
                      href={productExternalUrl}
                      download
                      style={{
                        fontFamily:"'Space Mono', monospace", fontSize:10, fontWeight:700,
                        padding:'6px 14px', borderRadius:4, textDecoration:'none',
                        background:'#16a34a', color:'#fff',
                      }}
                    >
                      PDF をダウンロード
                    </a>
                    <a
                      href={productExternalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontFamily:"'Space Mono', monospace", fontSize:9, color:'#7c3aed',
                        textDecoration:'underline',
                      }}
                    >
                      プレビュー →
                    </a>
                  </div>
                  <div style={{ marginTop:6, display:'flex', gap:4, alignItems:'center' }}>
                    <input
                      type="text"
                      readOnly
                      value={productExternalUrl}
                      onClick={e => { (e.target as HTMLInputElement).select(); navigator.clipboard.writeText(productExternalUrl); }}
                      style={{
                        flex:1, fontFamily:"'Space Mono', monospace", fontSize:9, padding:'4px 8px',
                        border:'1px solid #bbf7d0', borderRadius:4, background:'#fff', color:'#374151',
                        outline:'none', cursor:'pointer', boxSizing:'border-box',
                      }}
                    />
                    <span style={{ fontFamily:"'Space Mono', monospace", fontSize:7, color:'#9ca3af' }}>
                      クリックでコピー
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 登録/更新 + キャンセル */}
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <button
                onClick={async () => {
                  setProductRegistering(true);
                  try {
                    const res = await fetch('/api/kokoro-products', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        noteId: selectedNote.id,
                        productPrice,
                        productDescription,
                        productExternalUrl,
                        productType,
                        authorName: productAuthorName || '匿名',
                        aiPricedAmount: aiPricing?.suggestedPrice || selectedNote.aiPricedAmount || undefined,
                        showAiBadge: aiPricing ? true : (selectedNote.showAiBadge ?? false),
                      }),
                    });
                    const data = await res.json();
                    if (data.error) throw new Error(data.error);
                    const all = await getAllNotes();
                    setNotes(all);
                    setShowProductForm(false);
                  } catch (e) {
                    alert(e instanceof Error ? e.message : '登録に失敗しました');
                  } finally { setProductRegistering(false); }
                }}
                disabled={productRegistering || !productPrice}
                style={{
                  fontFamily:"'Space Mono', monospace", fontSize:10, letterSpacing:'0.1em',
                  padding:'10px 24px', borderRadius:4, cursor: productRegistering || !productPrice ? 'not-allowed' : 'pointer',
                  background: productRegistering ? '#9ca3af' : '#f59e0b', color:'#fff', border:'none',
                  opacity: productPrice ? 1 : 0.5,
                }}
              >
                {productRegistering ? '保存中...' : selectedNote.isProduct ? '🏷 商品設定を保存' : '🏷 商品として登録'}
              </button>
              <button onClick={() => setShowProductForm(false)}
                style={{ fontFamily:"'Space Mono', monospace", fontSize:10, padding:'10px 16px', borderRadius:4, cursor:'pointer', background:'transparent', color:'#9ca3af', border:'1px solid #e5e7eb' }}>
                閉じる
              </button>
            </div>
          </div>
        )}

        {/* AI自動判定の誘導ボタン（1つだけ） */}
        <div style={{ marginBottom:16 }}>
          {(() => {
            const body = (selectedNote.body || '').toLowerCase();
            // 内容からベストな誘導先を1つだけ選ぶ
            if (/不安|つらい|悲しい|しんどい|疲れ|怖い|落ち込/.test(body)) {
              return (
                <button onClick={() => { setNoteForZen(selectedNote); router.push('/kokoro-zen'); }}
                  style={{ fontFamily:"'Space Mono', monospace", fontSize:10, padding:'8px 16px', borderRadius:6, cursor:'pointer', background:'#dbeafe', color:'#2563eb', border:'none' }}>
                  Zen で深掘りする →
                </button>
              );
            }
            if (/やりたい|目標|計画|始め|動きたい|変えたい/.test(body)) {
              return (
                <button onClick={() => { const ri = createRecipeInputFromNote({ title: selectedNote.title, body: selectedNote.body, topic: selectedNote.topic }); setRecipeInput(ri); router.push('/kokoro-recipe'); }}
                  style={{ fontFamily:"'Space Mono', monospace", fontSize:10, padding:'8px 16px', borderRadius:6, cursor:'pointer', background:'#fff7ed', color:'#f97316', border:'none' }}>
                  Recipe を作る →
                </button>
              );
            }
            // デフォルト: Talkで続ける
            return (
              <button onClick={() => { setNoteForTalk(selectedNote); router.push('/kokoro-chat'); }}
                style={{ fontFamily:"'Space Mono', monospace", fontSize:10, padding:'8px 16px', borderRadius:6, cursor:'pointer', background:'#ede9fe', color:'#7c3aed', border:'none' }}>
                Talk で続ける →
              </button>
            );
          })()}
        </div>
      </>
    );
  };

  /* ── 作成・編集画面 ── */
  const [editIsPublic, setEditIsPublic] = useState(false);

  const renderEdit = () => (
    <>
      {/* 戻る */}
      <button
        onClick={() => setView(editingId ? 'detail' : 'list')}
        style={{ fontFamily:"'Space Mono', monospace", fontSize:11, color:'#7c3aed', background:'transparent', border:'none', cursor:'pointer', marginBottom:24, display:'flex', alignItems:'center', gap:4 }}
      >
        ← {editingId ? '詳細へ戻る' : '一覧へ戻る'}
      </button>

      {/* AI生成済みタイトル表示（本文の上） */}
      {editTitle && (
        <div style={{ marginBottom:12 }}>
          <span style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#9ca3af', letterSpacing:'0.1em' }}>TITLE</span>
          <div style={{ fontSize:15, fontWeight:700, color:'#1a1a1a', marginTop:4 }}>{editTitle}</div>
        </div>
      )}

      {/* 本文 */}
      <textarea
        ref={bodyRef}
        value={editBody}
        onChange={e => setEditBody(e.target.value)}
        placeholder="思ったこと、気づいたことを書く..."
        rows={10}
        style={{
          width:'100%', padding:'12px 16px', fontSize:14, borderRadius:8,
          border:'1px solid #e5e7eb', color:'#1a1a1a', outline:'none', resize:'vertical',
          fontFamily: 'var(--font-noto-serif-jp), serif', lineHeight:2, marginBottom:12,
        }}
      />

      {/* 画像アップロード（新規作成時のみ） */}
      {!editingId && (
        <div style={{ marginBottom:12 }}>
          {editImagePreview ? (
            <div style={{ position:'relative', display:'inline-block', marginBottom:8 }}>
              <img src={editImagePreview} alt="添付画像" style={{ maxHeight:120, borderRadius:8, display:'block', objectFit:'cover' }} />
              <button
                onClick={() => { setEditImagePreview(null); setEditImageBase64(null); }}
                style={{ position:'absolute', top:-6, right:-6, width:20, height:20, borderRadius:'50%', background:'#1a1a1a', color:'#fff', border:'none', cursor:'pointer', fontSize:10, display:'flex', alignItems:'center', justifyContent:'center' }}
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => editImageRef.current?.click()}
              style={{
                fontFamily:"'Space Mono', monospace", fontSize:10, color:'#9ca3af',
                background:'transparent', border:'1px dashed #d1d5db', borderRadius:6,
                padding:'8px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap:6,
              }}
            >
              📷 画像を追加
            </button>
          )}
          <input ref={editImageRef} type="file" accept="image/*" style={{ display:'none' }}
            onChange={e => { if (e.target.files?.[0]) handleEditImageFile(e.target.files[0]); e.target.value = ''; }} />
        </div>
      )}

      {/* AI生成済みタグ表示（本文の下） */}
      {editTags && (
        <div style={{ marginBottom:16, display:'flex', gap:6, flexWrap:'wrap' }}>
          {editTags.split(/[,、]/).map(t => t.trim()).filter(Boolean).map(tag => (
            <span key={tag} style={{ fontSize:10, padding:'2px 8px', borderRadius:12, background:'#f3f4f6', color:'#6b7280' }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* AIでタイトル・タグを生成 */}
      <button
        onClick={handleAiSuggest}
        disabled={aiLoading || !editBody.trim()}
        style={{
          fontFamily:"'Space Mono', monospace", fontSize:11, fontWeight:700,
          padding:'10px 20px', borderRadius:6, cursor:'pointer', marginBottom:8,
          background: aiLoading ? '#f3f4f6' : '#7c3aed', color: aiLoading ? '#9ca3af' : '#fff',
          border:'none', opacity: !editBody.trim() ? 0.4 : 1, width:'100%',
        }}
      >
        {aiLoading ? 'AI生成中...' : 'AIでタイトル・タグを生成'}
      </button>
      {aiLoading && <PersonaLoading />}

      {/* 公開設定 */}
      <div style={{ marginTop:16, padding:'12px 16px', borderRadius:8, background:'#f9fafb', border:'1px solid #e5e7eb', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontFamily:"'Space Mono', monospace", fontSize:10, color:'#6b7280' }}>
          {editIsPublic ? '🌐 Browserに公開' : '🔒 非公開'}
        </span>
        <button
          onClick={() => setEditIsPublic(v => !v)}
          style={{
            fontFamily:"'Space Mono', monospace", fontSize:9, padding:'4px 12px', borderRadius:4, cursor:'pointer',
            background: editIsPublic ? '#f0fdf4' : '#f3f4f6',
            color: editIsPublic ? '#16a34a' : '#9ca3af',
            border: `1px solid ${editIsPublic ? '#bbf7d0' : '#e5e7eb'}`,
          }}
        >
          {editIsPublic ? '公開中' : '非公開'}
        </button>
      </div>

      {/* 保存・キャンセル */}
      <div style={{ display:'flex', gap:12, paddingTop:20, marginTop:20, borderTop:'1px solid #e5e7eb' }}>
        <button
          onClick={() => {
            handleSave();
          }}
          disabled={!editBody.trim() && !editTitle.trim()}
          style={{
            fontFamily:"'Space Mono', monospace", fontSize:11, fontWeight:700,
            padding:'10px 24px', borderRadius:6, cursor:'pointer',
            background:'#7c3aed', color:'#fff', border:'none',
            opacity: (!editBody.trim() && !editTitle.trim()) ? 0.4 : 1,
          }}
        >
          保存
        </button>
        <button
          onClick={() => setView(editingId ? 'detail' : 'list')}
          style={{
            fontFamily:"'Space Mono', monospace", fontSize:11,
            padding:'10px 16px', borderRadius:6, cursor:'pointer',
            background:'#f3f4f6', color:'#6b7280', border:'none',
          }}
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
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', borderBottom:'1px solid #e5e7eb', position:'sticky', top:0, background:'#fff', zIndex:10 }}>
        <div>
          <span style={{ fontFamily:"'Space Mono', monospace", fontSize:13, fontWeight:700 }}>Kokoro</span>
          <span style={{ fontFamily:"'Space Mono', monospace", fontSize:13, fontWeight:700, color:'#7c3aed', marginLeft:4 }}>OS</span>
          <span style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#9ca3af', marginLeft:8, letterSpacing:'0.15em' }}>// Note</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {view === 'list' && (
            <button
              onClick={openNew}
              style={{ fontFamily:"'Space Mono', monospace", fontSize:10, fontWeight:700, padding:'6px 12px', borderRadius:4, background:'#7c3aed', color:'#fff', border:'none', cursor:'pointer' }}
            >
              + 新規 Note
            </button>
          )}
          <button
            onClick={() => router.push('/kokoro-chat')}
            title="Talk に戻る"
            style={{ fontFamily:"'Space Mono', monospace", fontSize:9, color:'#6b7280', background:'transparent', border:'1px solid #e5e7eb', borderRadius:2, padding:'6px 12px', cursor:'pointer' }}
          >
            ← Talk
          </button>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="flex-1 px-6 py-6 max-w-2xl mx-auto w-full">
        <LoginBanner message="ログインするとNoteがクラウドに保存されます。" />
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
