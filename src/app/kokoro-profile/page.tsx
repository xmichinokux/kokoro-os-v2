'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  getProfile, createEmptyProfile, PROFILE_FIELDS, PROFILE_STORAGE_KEY,
  type KokoroUserProfile,
} from '@/lib/getProfile';

type ProfileKey = keyof Omit<KokoroUserProfile, 'updatedAt'>;

const AGE_OPTIONS = [
  '10代', '20代前半', '20代後半', '30代前半', '30代後半',
  '40代前半', '40代後半', '50代', '60代以上',
];
const GENDER_OPTIONS = ['男性', '女性', 'ノンバイナリー', '回答しない'];
const BUDGET_OPTIONS = ['〜3,000円', '3,000〜8,000円', '8,000〜15,000円', '15,000〜30,000円', '30,000円〜'];
const FAMILY_SIZE_OPTIONS = ['1人', '2人', '3人', '4人', '5人以上'];
const COOK_SKILL_OPTIONS = ['ほぼしない', '簡単なものだけ', '普通', '得意', '凝ったものも作る'];
const WORK_OPTIONS = ['会社員（出社）', '会社員（リモート）', 'フリーランス', '学生', '自営業', 'その他'];
const LIVING_OPTIONS = ['一人暮らし', 'パートナーと同居', '家族と同居', 'シェアハウス'];

const accentColor = '#6366f1';
const mono = { fontFamily: "'Space Mono', monospace" } as const;

export default function KokoroProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<KokoroUserProfile>(createEmptyProfile());
  const [aiFilled, setAiFilled] = useState<Set<ProfileKey>>(new Set());
  const [noteCount, setNoteCount] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisSummary, setAnalysisSummary] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const [filledCount, setFilledCount] = useState(0);
  const [toast, setToast] = useState('');
  const [lastSaved, setLastSaved] = useState('');

  // 初期読み込み
  useEffect(() => {
    const saved = getProfile();
    if (saved) {
      setProfile(saved);
      if (saved.updatedAt) setLastSaved(saved.updatedAt);
    }
    // Note 件数
    try {
      const raw = localStorage.getItem('kokoro_notes');
      const notes = raw ? JSON.parse(raw) : [];
      setNoteCount(Array.isArray(notes) ? notes.length : 0);
    } catch {
      setNoteCount(0);
    }
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  const setField = (key: ProfileKey, value: string) => {
    setProfile(prev => ({ ...prev, [key]: value }));
    // ユーザーが手動編集したらハイライトを消す
    if (aiFilled.has(key)) {
      setAiFilled(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleSave = () => {
    const now = new Date().toLocaleString('ja-JP');
    const toSave: KokoroUserProfile = { ...profile, updatedAt: now };
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(toSave));
    setProfile(toSave);
    setLastSaved(now);
    showToast('// プロフィールを保存しました ✓');
  };

  const handleReset = () => {
    if (!confirm('プロフィールをすべてリセットしますか？')) return;
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    setProfile(createEmptyProfile());
    setLastSaved('');
    setAiFilled(new Set());
    setAnalysisSummary('');
    showToast('// リセットしました');
  };

  const runAnalysis = useCallback(async () => {
    if (noteCount === 0) {
      showToast('// Noteがまだありません');
      return;
    }

    setAnalyzing(true);
    setAnalysisError('');
    setAnalysisSummary('');

    try {
      const raw = localStorage.getItem('kokoro_notes');
      const notes: Array<{ body?: string; text?: string; title?: string; source?: string; createdAt?: string; date?: string; tags?: string[] }> =
        raw ? JSON.parse(raw) : [];

      // 最大50件、各Noteをテキスト化
      const notesText = notes.slice(0, 50).map(n => {
        const src = n.source ?? (n.tags && n.tags[0]) ?? 'Note';
        const date = n.createdAt ?? n.date ?? '';
        const title = n.title ?? '';
        const body = n.body ?? n.text ?? '';
        return `[${src}] ${date}${title ? `\n${title}` : ''}\n${body}`;
      }).join('\n\n---\n\n');

      const res = await fetch('/api/kokoro-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notesText }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const aiProfile = data.profile as Partial<KokoroUserProfile> & { summary?: string };

      const filled = new Set<ProfileKey>();
      const next: KokoroUserProfile = { ...profile };
      let count = 0;
      PROFILE_FIELDS.forEach(k => {
        const v = aiProfile[k];
        if (typeof v === 'string' && v.trim()) {
          next[k] = v.trim();
          filled.add(k);
          count++;
        }
      });
      setProfile(next);
      setAiFilled(filled);
      setFilledCount(count);
      setAnalysisSummary(aiProfile.summary ?? '');
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : '不明なエラー');
    } finally {
      setAnalyzing(false);
    }
  }, [noteCount, profile]);

  /* ── UI components ── */
  const fieldBase = {
    background: '#f8f9fa',
    border: '1px solid #d1d5db',
    borderLeft: '2px solid #d1d5db',
    borderRadius: '0 4px 4px 0',
    padding: '10px 14px',
    fontSize: 13,
    color: '#111827',
    outline: 'none',
    fontFamily: "'Noto Sans JP', sans-serif",
    width: '100%',
    boxSizing: 'border-box' as const,
  };
  const fieldHighlight = (key: ProfileKey) =>
    aiFilled.has(key)
      ? { borderLeftColor: accentColor, background: 'rgba(99,102,241,0.04)' }
      : {};

  const Label = ({ children }: { children: React.ReactNode }) => (
    <label style={{ ...mono, fontSize: 8, letterSpacing: '0.16em', color: '#9ca3af', textTransform: 'uppercase' }}>
      {children}
    </label>
  );

  const TextField = ({
    k, placeholder, full = false,
  }: { k: ProfileKey; placeholder?: string; full?: boolean }) => (
    <div style={{ gridColumn: full ? '1 / -1' : undefined, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <Label>// {LABELS[k]}</Label>
      <input
        type="text"
        value={profile[k]}
        onChange={e => setField(k, e.target.value)}
        placeholder={placeholder}
        style={{ ...fieldBase, ...fieldHighlight(k) }}
      />
    </div>
  );

  const SelectField = ({
    k, options, full = false,
  }: { k: ProfileKey; options: string[]; full?: boolean }) => (
    <div style={{ gridColumn: full ? '1 / -1' : undefined, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <Label>// {LABELS[k]}</Label>
      <select
        value={profile[k]}
        onChange={e => setField(k, e.target.value)}
        style={{ ...fieldBase, ...fieldHighlight(k), cursor: 'pointer', WebkitAppearance: 'none' }}
      >
        <option value="">選択...</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  const TextArea = ({
    k, placeholder, full = true,
  }: { k: ProfileKey; placeholder?: string; full?: boolean }) => (
    <div style={{ gridColumn: full ? '1 / -1' : undefined, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <Label>// {LABELS[k]}</Label>
      <textarea
        value={profile[k]}
        onChange={e => setField(k, e.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{ ...fieldBase, ...fieldHighlight(k), minHeight: 65, resize: 'vertical', lineHeight: 1.7 }}
      />
    </div>
  );

  const Section = ({
    icon, title, apps, children,
  }: { icon: string; title: string; apps?: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 36 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
        paddingBottom: 10, borderBottom: '1px solid #e5e7eb',
      }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ ...mono, fontSize: 9, letterSpacing: '0.2em', color: '#111827', textTransform: 'uppercase', flex: 1 }}>
          {title}
        </span>
        {apps && (
          <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '0.06em' }}>{apps}</span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        {children}
      </div>
    </div>
  );

  const ActionBar = () => (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
      marginBottom: 40, padding: '16px 20px',
      background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: 4,
    }}>
      <button
        onClick={handleSave}
        style={{
          background: accentColor, border: 'none', color: '#fff',
          ...mono, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
          padding: '10px 24px', cursor: 'pointer', borderRadius: 3,
        }}
      >
        ✓ プロフィールを保存
      </button>
      {lastSaved && (
        <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '0.08em' }}>
          // 最終保存: {lastSaved}
        </span>
      )}
      <button
        onClick={handleReset}
        style={{
          background: 'transparent', border: '1px solid #d1d5db', color: '#9ca3af',
          ...mono, fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase',
          padding: '10px 16px', cursor: 'pointer', borderRadius: 3, marginLeft: 'auto',
        }}
      >
        リセット
      </button>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#374151', fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 300 }}>

      {/* ヘッダー */}
      <header style={{
        padding: '14px 28px', borderBottom: '1px solid #e5e7eb',
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 32, height: 32, border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(circle at 40% 40%,rgba(99,102,241,0.1) 0%,transparent 70%)',
            fontSize: 16,
          }}>👤</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', letterSpacing: '.06em' }}>
              Kokoro <span style={{ color: accentColor }}>Profile</span>
            </div>
            <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '.14em' }}>
              あなたのデータ層
            </span>
          </div>
        </div>
        <button
          onClick={() => router.push('/')}
          style={{
            ...mono, fontSize: 9, letterSpacing: '0.12em', color: '#9ca3af',
            background: 'transparent', border: '1px solid #e5e7eb',
            padding: '5px 14px', borderRadius: 3, cursor: 'pointer',
          }}
        >
          ← Home
        </button>
      </header>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '48px 28px 100px', position: 'relative' }}>

        {/* 連携アプリ */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28, alignItems: 'center' }}>
          <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '0.1em' }}>
            // このデータを使うアプリ
          </span>
          <Chip color="#ec4899" bg="rgba(236,72,153,0.1)" border="rgba(236,72,153,0.2)">Fashion</Chip>
          <Chip color="#f97316" bg="rgba(249,115,22,0.1)" border="rgba(249,115,22,0.2)">Recipe</Chip>
          <Chip color="#10b981" bg="rgba(16,185,129,0.1)" border="rgba(16,185,129,0.2)">Plan</Chip>
        </div>

        {/* AI分析ゾーン */}
        <div style={{
          background: '#f8f9fa', border: '1px solid #e5e7eb', borderLeft: `3px solid ${accentColor}`,
          padding: 24, borderRadius: '0 8px 8px 0', marginBottom: 36,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: accentColor, textTransform: 'uppercase', marginBottom: 8 }}>
                // Note から AI がプロフィールを生成
              </div>
              <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.8 }}>
                保存済みのNoteを読み込み、あなたの好み・ライフスタイル・傾向をAIが分析してフォームを自動入力します。
              </div>
              <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginTop: 6 }}>
                // 保存済みNote: <span style={{ color: accentColor }}>{noteCount}件</span>
                {noteCount === 0 ? '　（NoteやTalkから保存してください）' : ' を使って分析します'}
              </div>
              <div style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '0.08em', marginTop: 12, opacity: 0.7 }}>
                // NoteのテキストはAPIリクエストとしてAnthropicに送信されます
              </div>
            </div>
            <button
              onClick={runAnalysis}
              disabled={analyzing || noteCount === 0}
              style={{
                background: accentColor, border: 'none', color: '#fff',
                ...mono, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
                padding: '11px 22px', cursor: analyzing || noteCount === 0 ? 'not-allowed' : 'pointer',
                borderRadius: 3, whiteSpace: 'nowrap', flexShrink: 0,
                opacity: analyzing || noteCount === 0 ? 0.5 : 1,
              }}
            >
              {analyzing ? '// 分析中...' : 'Note を分析する ▸'}
            </button>
          </div>

          {analyzing && (
            <div style={{ marginTop: 16 }}>
              <div style={{ width: '100%', height: 1, background: '#e5e7eb', position: 'relative', overflow: 'hidden', marginBottom: 8 }}>
                <div style={{
                  position: 'absolute', left: '-40%', top: 0, width: '40%', height: '100%',
                  background: accentColor, animation: 'kokoroSweep 1.4s ease-in-out infinite',
                }} />
              </div>
              <div style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '0.1em' }}>
                // AIが分析しています...
              </div>
            </div>
          )}

          {(analysisSummary || analysisError) && (
            <div style={{
              marginTop: 14, padding: 14,
              background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)',
              borderRadius: 4, fontSize: 12, color: '#374151', lineHeight: 1.8,
            }}>
              {analysisError ? (
                <div style={{ color: '#ef4444', ...mono, fontSize: 10 }}>
                  // エラー: {analysisError}
                </div>
              ) : (
                <>
                  <div style={{ ...mono, fontSize: 8, letterSpacing: '0.16em', color: accentColor, textTransform: 'uppercase', marginBottom: 8 }}>
                    // AI分析サマリー
                  </div>
                  <div>{analysisSummary}</div>
                  <div style={{ ...mono, fontSize: 8, color: '#9ca3af', marginTop: 10 }}>
                    {filledCount}項目を自動入力しました。内容を確認して「プロフィールを保存」してください。
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <ActionBar />

        {/* 基本情報 */}
        <Section icon="🙂" title="基本情報">
          <TextField k="p_name" placeholder="例：田中" />
          <SelectField k="p_age" options={AGE_OPTIONS} />
          <SelectField k="p_gender" options={GENDER_OPTIONS} />
          <TextField k="p_location" placeholder="例：東京・岩手" />
        </Section>

        {/* ファッション */}
        <Section icon="👗" title="ファッション設定" apps="→ Fashion が使用">
          <TextField k="p_style" placeholder="例：カジュアル・きれいめ、シンプル、モード系" full />
          <TextField k="p_brands" placeholder="例：ユニクロ、ZARA、無印" />
          <TextField k="p_colors" placeholder="例：白・黒・紺好き、オレンジはNG" />
          <SelectField k="p_budget" options={BUDGET_OPTIONS} />
          <TextField k="p_usage" placeholder="例：普段着、仕事、デート、週末" />
          <TextArea k="p_fashion_memo" placeholder="例：背が低め、なで肩、暑がり、シワになりやすい素材はNG" />
        </Section>

        {/* 食事・料理 */}
        <Section icon="🍳" title="食事・料理設定" apps="→ Recipe が使用">
          <SelectField k="p_family_size" options={FAMILY_SIZE_OPTIONS} />
          <SelectField k="p_cook_skill" options={COOK_SKILL_OPTIONS} />
          <TextField k="p_allergy" placeholder="例：甲殻類アレルギー、パクチーNG" />
          <TextField k="p_diet" placeholder="例：ベジタリアン、低糖質、減塩" />
          <TextField k="p_food_pref" placeholder="例：和食中心、麺類が好き、スパイス系が得意" full />
          <TextArea k="p_recipe_memo" placeholder="例：IHコンロのみ、冷蔵庫小さめ、週末にまとめ買い、時短レシピ優先" />
        </Section>

        {/* ライフスタイル */}
        <Section icon="🌱" title="ライフスタイル" apps="→ Plan・Talk が参照">
          <SelectField k="p_work" options={WORK_OPTIONS} />
          <SelectField k="p_living" options={LIVING_OPTIONS} />
          <TextField k="p_hobbies" placeholder="例：音楽、ゲーム、読書、映画、カフェ巡り" full />
          <TextArea k="p_memo" placeholder="例：夜型、HSP気質、新しいもの好き、完璧主義" />
        </Section>

        <ActionBar />

      </div>

      {/* トースト */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: '#111827', color: '#fff',
          ...mono, fontSize: 9, letterSpacing: '0.14em',
          padding: '10px 22px', borderRadius: 4, zIndex: 300,
        }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes kokoroSweep { 0% { left: -40%; } 100% { left: 140%; } }
        @media (max-width: 540px) {
          .kokoro-profile-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

const LABELS: Record<ProfileKey, string> = {
  p_name: '呼び名（任意）',
  p_age: '年代',
  p_gender: '性別（任意）',
  p_location: '居住地',
  p_style: '好きなスタイル',
  p_brands: 'よく使うブランド',
  p_colors: '好きな色・NGな色',
  p_budget: '予算感（1着あたり）',
  p_usage: '主な用途',
  p_fashion_memo: 'その他のこだわり・メモ',
  p_family_size: '食べる人数',
  p_cook_skill: '料理スキル',
  p_allergy: 'アレルギー・NG食材',
  p_diet: '食の制限',
  p_food_pref: '好きな料理・よく食べるもの',
  p_recipe_memo: '料理環境・その他メモ',
  p_work: '働き方',
  p_living: '住まい',
  p_hobbies: '趣味・興味',
  p_memo: '自由記述（AIへの補足・伝えたいこと）',
};

function Chip({
  color, bg, border, children,
}: { color: string; bg: string; border: string; children: React.ReactNode }) {
  return (
    <span style={{
      ...mono, fontSize: 8, letterSpacing: '0.1em',
      padding: '4px 10px', borderRadius: 12, textTransform: 'uppercase' as const,
      color, background: bg, border: `1px solid ${border}`,
    }}>
      {children}
    </span>
  );
}
