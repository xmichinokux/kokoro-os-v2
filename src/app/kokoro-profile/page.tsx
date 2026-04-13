'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import {
  getProfile, saveProfile, createEmptyProfile, PROFILE_FIELDS,
  type KokoroUserProfile,
} from '@/lib/getProfile';
import LoginBanner from '@/components/LoginBanner';
import PersonaLoading from '@/components/PersonaLoading';

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

const PREFECTURE_OPTIONS = [
  '北海道',
  '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
  '岐阜県', '静岡県', '愛知県', '三重県',
  '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県',
  '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県',
  '沖縄県',
];

const AREA_RANGE_OPTIONS = [
  { value: 'city', label: '市区町村のみ' },
  { value: 'prefecture', label: '都道府県' },
  { value: 'country', label: '全国' },
];

const accentColor = '#6366f1';
const mono = { fontFamily: "'Space Mono', monospace" } as const;

const LABELS: Record<ProfileKey, string> = {
  p_name: '呼び名（任意）',
  p_age: '年代',
  p_gender: '性別（任意）',
  p_location: '居住地',
  p_prefecture: '都道府県',
  p_city: '市区町村',
  p_area_range: '表示範囲',
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
const highlightStyle = { borderLeftColor: accentColor, background: 'rgba(99,102,241,0.04)' };

/* ── External UI components (defined outside the page so they don't get
      recreated on every render — keeps inputs from losing focus on each keystroke) ── */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ ...mono, fontSize: 8, letterSpacing: '0.16em', color: '#9ca3af', textTransform: 'uppercase' }}>
      {children}
    </label>
  );
}

type FieldProps = {
  k: ProfileKey;
  value: string;
  onChange: (v: string) => void;
  highlighted: boolean;
  placeholder?: string;
  full?: boolean;
};

function TextField({ k, value, onChange, highlighted, placeholder, full = false }: FieldProps) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <Label>// {LABELS[k]}</Label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...fieldBase, ...(highlighted ? highlightStyle : {}) }}
      />
    </div>
  );
}

function SelectField({
  k, value, onChange, highlighted, options, full = false,
}: FieldProps & { options: string[] }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <Label>// {LABELS[k]}</Label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...fieldBase, ...(highlighted ? highlightStyle : {}), cursor: 'pointer', WebkitAppearance: 'none' }}
      >
        <option value="">選択...</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function LabeledSelectField({
  k, value, onChange, highlighted, options, full = false,
}: FieldProps & { options: { value: string; label: string }[] }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <Label>// {LABELS[k]}</Label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...fieldBase, ...(highlighted ? highlightStyle : {}), cursor: 'pointer', WebkitAppearance: 'none' }}
      >
        <option value="">選択...</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function TextArea({ k, value, onChange, highlighted, placeholder, full = true }: FieldProps) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <Label>// {LABELS[k]}</Label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{ ...fieldBase, ...(highlighted ? highlightStyle : {}), minHeight: 65, resize: 'vertical', lineHeight: 1.7 }}
      />
    </div>
  );
}

function Section({
  icon, title, apps, children,
}: { icon: string; title: string; apps?: string; children: React.ReactNode }) {
  return (
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
}

function ActionBar({
  onSave, onReset, lastSaved,
}: { onSave: () => void; onReset: () => void; lastSaved: string }) {
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
      marginBottom: 40, padding: '16px 20px',
      background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: 4,
    }}>
      <button
        onClick={onSave}
        title="プロフィールを保存"
        style={{
          background: accentColor, border: 'none', color: '#fff',
          ...mono, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
          padding: '10px 24px', cursor: 'pointer', borderRadius: 3,
        }}
      >
        Save ✓
      </button>
      {lastSaved && (
        <span style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '0.08em' }}>
          // 最終保存: {lastSaved}
        </span>
      )}
      <button
        onClick={onReset}
        title="リセット"
        style={{
          background: 'transparent', border: '1px solid #d1d5db', color: '#9ca3af',
          ...mono, fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase',
          padding: '10px 16px', cursor: 'pointer', borderRadius: 3, marginLeft: 'auto',
        }}
      >
        Reset ×
      </button>
    </div>
  );
}

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

  // 感性キャッシュ関連
  const [hasGoogleToken, setHasGoogleToken] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanFolder, setScanFolder] = useState('Scan Data');
  const [scanResult, setScanResult] = useState<{
    totalFound?: number;
    loadedFiles?: string[];
    skippedFiles?: string[];
  } | null>(null);
  const [cacheInfo, setCacheInfo] = useState<{
    exists: boolean;
    updatedAt: string | null;
    fileCount: number;
  }>({ exists: false, updatedAt: null, fileCount: 0 });

  // 初期読み込み
  useEffect(() => {
    const init = async () => {
      const saved = await getProfile();
      if (saved) {
        setProfile(saved);
        if (saved.updatedAt) setLastSaved(saved.updatedAt);
      }
      // Note 件数
      const { getAllNotes } = await import('@/lib/kokoro/noteStorage');
      const notes = await getAllNotes();
      setNoteCount(notes.length);

      // Googleトークン・ユーザーID確認
      const { data: { session } } = await supabase.auth.getSession();
      setHasGoogleToken(!!session?.provider_token);
      setUserId(session?.user?.id ?? null);

      // 感性キャッシュ情報を取得
      if (session?.user) {
        try {
          const cacheRes = await fetch('/api/drive-cache');
          const cacheData = await cacheRes.json();
          if (cacheData.cache) {
            setCacheInfo({
              exists: true,
              updatedAt: cacheData.updatedAt,
              fileCount: cacheData.fileCount,
            });
          }
        } catch {
          // キャッシュ取得失敗は無視
        }
      }
    };
    init();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  const setField = useCallback((key: ProfileKey, value: string) => {
    setProfile(prev => ({ ...prev, [key]: value }));
    setAiFilled(prev => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const handleSave = async () => {
    const now = new Date().toLocaleString('ja-JP');
    const toSave: KokoroUserProfile = { ...profile, updatedAt: now };
    await saveProfile(toSave);
    setProfile(toSave);
    setLastSaved(now);
    showToast('// プロフィールを保存しました ✓');
  };

  const handleReset = async () => {
    if (!confirm('プロフィールをすべてリセットしますか？')) return;
    await saveProfile(createEmptyProfile());
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
      const { getAllNotes: fetchAllNotes } = await import('@/lib/kokoro/noteStorage');
      const allNotes = await fetchAllNotes();
      const notes = allNotes as Array<{ body?: string; text?: string; title?: string; source?: string; createdAt?: string; date?: string; tags?: string[] }>;

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

  const runDriveScan = useCallback(async () => {
    setScanLoading(true);
    setScanError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.provider_token;
      if (!accessToken || !userId) {
        throw new Error('Googleアクセストークンがありません。ログアウトしてGoogleで再ログインしてください。');
      }

      const res = await fetch('/api/drive-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, userId, folderName: scanFolder }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setCacheInfo({
        exists: true,
        updatedAt: new Date().toISOString(),
        fileCount: data.fileCount,
      });
      setScanResult({
        totalFound: data.totalFound,
        loadedFiles: data.loadedFiles,
        skippedFiles: data.skippedFiles,
      });
      showToast(`// スキャン完了 ✓ ${data.fileCount}/${data.totalFound}ファイル読み込み`);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'スキャンに失敗しました');
    } finally {
      setScanLoading(false);
    }
  }, [userId]);

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
          title="Homeに戻る"
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

        <LoginBanner message="ログインするとプロフィールがクラウドに保存されます。" />

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
              title="Noteを分析する"
              style={{
                background: accentColor, border: 'none', color: '#fff',
                ...mono, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
                padding: '11px 22px', cursor: analyzing || noteCount === 0 ? 'not-allowed' : 'pointer',
                borderRadius: 3, whiteSpace: 'nowrap', flexShrink: 0,
                opacity: analyzing || noteCount === 0 ? 0.5 : 1,
              }}
            >
              {analyzing ? '// 分析中...' : 'Yoroshiku'}
            </button>
          </div>

          {analyzing && <PersonaLoading />}

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

        {/* 感性キャッシュセクション */}
        <div style={{
          background: '#f8f9fa', border: '1px solid #e5e7eb', borderLeft: '3px solid #0f9d58',
          padding: 24, borderRadius: '0 8px 8px 0', marginBottom: 36,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ ...mono, fontSize: 10, letterSpacing: '0.2em', color: '#0f9d58', textTransform: 'uppercase', marginBottom: 8 }}>
                // 感性キャッシュ（Google Drive スキャン）
              </div>
              <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.8 }}>
                Googleドライブの文章を全スキャンし、あなたの文体・センス・価値観を「感性ベクター」として保存します。
                Writer Michiモードなどで使用されます。
              </div>

              {cacheInfo.exists ? (
                <div style={{ ...mono, fontSize: 9, color: '#0f9d58', marginTop: 8 }}>
                  ✓ 最終スキャン：{cacheInfo.updatedAt ? new Date(cacheInfo.updatedAt).toLocaleString('ja-JP') : '不明'}
                  {' / '}{cacheInfo.fileCount}ファイル読み込み済み
                </div>
              ) : (
                <div style={{ ...mono, fontSize: 9, color: '#9ca3af', marginTop: 8 }}>
                  ✗ まだスキャンしていません
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <span style={{ ...mono, fontSize: 8, color: '#6b7280', whiteSpace: 'nowrap' }}>// 対象フォルダ:</span>
                <input
                  type="text"
                  value={scanFolder}
                  onChange={e => setScanFolder(e.target.value)}
                  style={{
                    ...mono, fontSize: 11, color: '#111827',
                    background: '#fff', border: '1px solid #d1d5db',
                    borderRadius: 3, padding: '4px 8px', width: 160, outline: 'none',
                  }}
                />
              </div>
              <div style={{ ...mono, fontSize: 8, color: '#9ca3af', letterSpacing: '0.08em', marginTop: 8, opacity: 0.7 }}>
                // 週1回の更新を推奨。スキャンには数十秒〜数分かかります
              </div>
            </div>
            <button
              onClick={runDriveScan}
              disabled={scanLoading || !hasGoogleToken}
              title={!hasGoogleToken ? 'Googleでログインすると使えます' : 'Googleドライブをスキャンする'}
              style={{
                background: hasGoogleToken ? '#0f9d58' : '#e5e7eb',
                border: 'none',
                color: hasGoogleToken ? '#fff' : '#9ca3af',
                ...mono, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
                padding: '11px 22px', cursor: (scanLoading || !hasGoogleToken) ? 'not-allowed' : 'pointer',
                borderRadius: 3, whiteSpace: 'nowrap', flexShrink: 0,
                opacity: scanLoading ? 0.5 : 1,
              }}
            >
              {scanLoading ? '// スキャン中...' : cacheInfo.exists ? 'スキャンを更新' : 'スキャン開始'}
            </button>
          </div>

          {!hasGoogleToken && (
            <div style={{ marginTop: 12, ...mono, fontSize: 9, color: '#9ca3af', lineHeight: 1.6 }}>
              // Googleログインが必要です →{' '}
              <a href="/auth" style={{ color: '#0f9d58' }}>ログイン</a>
            </div>
          )}

          {scanLoading && (
            <div style={{ marginTop: 12, ...mono, fontSize: 10, color: '#0f9d58' }}>
              // Googleドライブを読み込んでいます...（数十秒〜数分かかります）
            </div>
          )}

          {scanError && (
            <div style={{ marginTop: 12, ...mono, fontSize: 10, color: '#ef4444', lineHeight: 1.6 }}>
              // エラー: {scanError}
            </div>
          )}

          {/* スキャン結果の詳細 */}
          {scanResult && (
            <div style={{
              marginTop: 14, padding: 14,
              background: 'rgba(15,157,88,0.06)', border: '1px solid rgba(15,157,88,0.15)',
              borderRadius: 4, maxHeight: 300, overflowY: 'auto',
            }}>
              <div style={{ ...mono, fontSize: 9, color: '#0f9d58', letterSpacing: '0.12em', marginBottom: 8 }}>
                // 検出: {scanResult.totalFound}件 / 読み込み: {scanResult.loadedFiles?.length ?? 0}件
              </div>
              {scanResult.loadedFiles && scanResult.loadedFiles.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ ...mono, fontSize: 8, color: '#6b7280', marginBottom: 4 }}>読み込み済み:</div>
                  {scanResult.loadedFiles.map((f, i) => (
                    <div key={i} style={{ ...mono, fontSize: 9, color: '#374151', lineHeight: 1.8 }}>
                      ✓ {f}
                    </div>
                  ))}
                </div>
              )}
              {scanResult.skippedFiles && scanResult.skippedFiles.length > 0 && (
                <div>
                  <div style={{ ...mono, fontSize: 8, color: '#9ca3af', marginBottom: 4 }}>スキップ:</div>
                  {scanResult.skippedFiles.map((f, i) => (
                    <div key={i} style={{ ...mono, fontSize: 9, color: '#9ca3af', lineHeight: 1.8 }}>
                      ✗ {f}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <ActionBar onSave={handleSave} onReset={handleReset} lastSaved={lastSaved} />

        {/* 基本情報 */}
        <Section icon="🙂" title="基本情報">
          <TextField k="p_name" value={profile.p_name} onChange={v => setField('p_name', v)} highlighted={aiFilled.has('p_name')} placeholder="例：田中" />
          <SelectField k="p_age" value={profile.p_age} onChange={v => setField('p_age', v)} highlighted={aiFilled.has('p_age')} options={AGE_OPTIONS} />
          <SelectField k="p_gender" value={profile.p_gender} onChange={v => setField('p_gender', v)} highlighted={aiFilled.has('p_gender')} options={GENDER_OPTIONS} />
          <TextField k="p_location" value={profile.p_location} onChange={v => setField('p_location', v)} highlighted={aiFilled.has('p_location')} placeholder="例:東京・岩手" />
          <SelectField k="p_prefecture" value={profile.p_prefecture} onChange={v => setField('p_prefecture', v)} highlighted={aiFilled.has('p_prefecture')} options={PREFECTURE_OPTIONS} />
          <TextField k="p_city" value={profile.p_city} onChange={v => setField('p_city', v)} highlighted={aiFilled.has('p_city')} placeholder="例:奥州市" />
          <LabeledSelectField
            k="p_area_range"
            value={profile.p_area_range}
            onChange={v => setField('p_area_range', v)}
            highlighted={aiFilled.has('p_area_range')}
            options={AREA_RANGE_OPTIONS}
            full
          />
        </Section>

        {/* ファッション */}
        <Section icon="👗" title="ファッション設定" apps="→ Fashion が使用">
          <TextField k="p_style" value={profile.p_style} onChange={v => setField('p_style', v)} highlighted={aiFilled.has('p_style')} placeholder="例:カジュアル・きれいめ、シンプル、モード系" full />
          <TextField k="p_brands" value={profile.p_brands} onChange={v => setField('p_brands', v)} highlighted={aiFilled.has('p_brands')} placeholder="例:ユニクロ、ZARA、無印" />
          <TextField k="p_colors" value={profile.p_colors} onChange={v => setField('p_colors', v)} highlighted={aiFilled.has('p_colors')} placeholder="例:白・黒・紺好き、オレンジはNG" />
          <SelectField k="p_budget" value={profile.p_budget} onChange={v => setField('p_budget', v)} highlighted={aiFilled.has('p_budget')} options={BUDGET_OPTIONS} />
          <TextField k="p_usage" value={profile.p_usage} onChange={v => setField('p_usage', v)} highlighted={aiFilled.has('p_usage')} placeholder="例:普段着、仕事、デート、週末" />
          <TextArea k="p_fashion_memo" value={profile.p_fashion_memo} onChange={v => setField('p_fashion_memo', v)} highlighted={aiFilled.has('p_fashion_memo')} placeholder="例:背が低め、なで肩、暑がり、シワになりやすい素材はNG" />
        </Section>

        {/* 食事・料理 */}
        <Section icon="🍳" title="食事・料理設定" apps="→ Recipe が使用">
          <SelectField k="p_family_size" value={profile.p_family_size} onChange={v => setField('p_family_size', v)} highlighted={aiFilled.has('p_family_size')} options={FAMILY_SIZE_OPTIONS} />
          <SelectField k="p_cook_skill" value={profile.p_cook_skill} onChange={v => setField('p_cook_skill', v)} highlighted={aiFilled.has('p_cook_skill')} options={COOK_SKILL_OPTIONS} />
          <TextField k="p_allergy" value={profile.p_allergy} onChange={v => setField('p_allergy', v)} highlighted={aiFilled.has('p_allergy')} placeholder="例:甲殻類アレルギー、パクチーNG" />
          <TextField k="p_diet" value={profile.p_diet} onChange={v => setField('p_diet', v)} highlighted={aiFilled.has('p_diet')} placeholder="例:ベジタリアン、低糖質、減塩" />
          <TextField k="p_food_pref" value={profile.p_food_pref} onChange={v => setField('p_food_pref', v)} highlighted={aiFilled.has('p_food_pref')} placeholder="例:和食中心、麺類が好き、スパイス系が得意" full />
          <TextArea k="p_recipe_memo" value={profile.p_recipe_memo} onChange={v => setField('p_recipe_memo', v)} highlighted={aiFilled.has('p_recipe_memo')} placeholder="例:IHコンロのみ、冷蔵庫小さめ、週末にまとめ買い、時短レシピ優先" />
        </Section>

        {/* ライフスタイル */}
        <Section icon="🌱" title="ライフスタイル" apps="→ Plan・Talk が参照">
          <SelectField k="p_work" value={profile.p_work} onChange={v => setField('p_work', v)} highlighted={aiFilled.has('p_work')} options={WORK_OPTIONS} />
          <SelectField k="p_living" value={profile.p_living} onChange={v => setField('p_living', v)} highlighted={aiFilled.has('p_living')} options={LIVING_OPTIONS} />
          <TextField k="p_hobbies" value={profile.p_hobbies} onChange={v => setField('p_hobbies', v)} highlighted={aiFilled.has('p_hobbies')} placeholder="例:音楽、ゲーム、読書、映画、カフェ巡り" full />
          <TextArea k="p_memo" value={profile.p_memo} onChange={v => setField('p_memo', v)} highlighted={aiFilled.has('p_memo')} placeholder="例:夜型、HSP気質、新しいもの好き、完璧主義" />
        </Section>

        <ActionBar onSave={handleSave} onReset={handleReset} lastSaved={lastSaved} />

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
