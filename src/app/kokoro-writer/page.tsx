'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { saveToNote } from '@/lib/saveToNote';
import { saveStrategyInput } from '@/lib/strategyInputs';
import PersonaLoading from '@/components/PersonaLoading';

type WriterMode = 'lite' | 'deep' | 'spark' | 'michi';

const MODE_CONFIG: Record<WriterMode, { label: string; placeholder: string }> = {
  lite: {
    label: 'Lite',
    placeholder: '整えたい文章を入力してください...',
  },
  deep: {
    label: 'Deep',
    placeholder: '構造化・リライトしたい文章を入力してください...',
  },
  spark: {
    label: 'Spark',
    placeholder: 'キーワードや断片的なメモを並べてください。\n例：シューティング スクロール 駆け引き スコア 緊張感',
  },
  michi: {
    label: 'Michi',
    placeholder: 'あなたの文体で整形したい文章を入力してください...\nzineフォルダの内容を参考にして、あなたらしい文章に仕上げます。',
  },
};

/**
 * Deep/Spark モードのXMLフォーマット出力をパースして、
 * 描画用HTML・コピー/保存用プレーンテキスト・memos/suggestionを取り出す
 */
function parseWriterXml(raw: string): {
  html: string;
  plain: string;
  memos: string;
  suggestion: string;
} {
  const editedMatch = raw.match(/<edited>([\s\S]*?)<\/edited>/);
  const memosMatch = raw.match(/<memos>([\s\S]*?)<\/memos>/);
  const suggestionMatch = raw.match(/<suggestion>([\s\S]*?)<\/suggestion>/);

  let html: string;
  if (editedMatch) {
    html = editedMatch[1].trim();
  } else {
    const escaped = raw
      .trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    html = `<p class="wp">${escaped.replace(/\n/g, '<br>')}</p>`;
  }

  const plain = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|h2|h3|h4|li|blockquote|ul|ol|hr|div)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    html,
    plain,
    memos: memosMatch ? memosMatch[1].trim() : '',
    suggestion: suggestionMatch ? suggestionMatch[1].trim() : '',
  };
}

export default function KokoroWriterPage() {
  const router = useRouter();
  const mono = { fontFamily: "'Space Mono', monospace" };

  const [mode, setMode] = useState<WriterMode>('deep');
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [outputHtml, setOutputHtml] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [strategySaved, setStrategySaved] = useState(false);
  const [hasGoogleToken, setHasGoogleToken] = useState(false);
  const [driveFiles, setDriveFiles] = useState<string[]>([]);
  const [driveContextLen, setDriveContextLen] = useState<number | null>(null);
  const [usedCache, setUsedCache] = useState(false);

  // Googleアクセストークンの有無を確認
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasGoogleToken(!!session?.provider_token);
    });
  }, []);

  const canSubmit = inputText.trim().length > 0 && !isLoading && (mode !== 'michi' || hasGoogleToken);

  const handleRun = useCallback(async (text?: string, overrideMode?: WriterMode) => {
    const t = text ?? inputText;
    const m = overrideMode ?? mode;
    if (!t.trim()) return;
    setIsLoading(true);
    setError('');
    setOutputText('');
    setOutputHtml('');
    setSaved(false);
    setDriveFiles([]);
    setDriveContextLen(null);
    setUsedCache(false);

    try {
      // Michiモード: アクセストークンを取得して送信
      let accessToken: string | undefined;
      if (m === 'michi') {
        const { data: { session } } = await supabase.auth.getSession();
        accessToken = session?.provider_token ?? undefined;
        if (!accessToken) throw new Error('Googleアクセストークンがありません。Googleでログインし直してください。');
      }

      const res = await fetch('/api/kokoro-writer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t, mode: m, ...(accessToken ? { accessToken } : {}) }),
      });
      if (!res.ok) throw new Error('編集に失敗しました');
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Drive情報を保存
      if (data.filesLoaded) setDriveFiles(data.filesLoaded);
      if (data.contextLength != null) setDriveContextLen(data.contextLength);
      if (data.usedCache) setUsedCache(true);

      const raw = (data.result ?? '') as string;
      if (m === 'lite') {
        setOutputText(raw);
        setOutputHtml('');
      } else {
        // Deep / Spark / Michi: XMLパース → HTML描画
        const parsed = parseWriterXml(raw);
        setOutputHtml(parsed.html);
        setOutputText(parsed.plain);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  }, [inputText, mode]);

  const handleCopy = async () => {
    if (!outputText) return;
    await navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSaveToNote = async () => {
    if (!outputText) return;
    await saveToNote(outputText, 'Writer');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveToStrategy = () => {
    if (!outputText) return;
    saveStrategyInput('writer', outputHtml || outputText);
    setStrategySaved(true);
    setTimeout(() => setStrategySaved(false), 2000);
  };

  // sessionStorage から writerFromTalk を読み取り
  useEffect(() => {
    const raw = sessionStorage.getItem('writerFromTalk');
    if (!raw) return;
    sessionStorage.removeItem('writerFromTalk');
    let userText = '';
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.userText === 'string') userText = parsed.userText;
    } catch {
      userText = raw;
    }
    if (!userText || !userText.trim()) return;
    const navOnly = /^(writer|ライター).{0,8}(開|行|使|起動|見|やり)/i.test(userText.trim());
    if (navOnly) return;
    setInputText(userText);
    setTimeout(() => {
      handleRun(userText, 'deep');
    }, 300);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const accentColor = '#a855f7';

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#374151' }}>

      {/* ヘッダー */}
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', borderBottom:'1px solid #e5e7eb', position:'sticky', top:0, background:'#fff', zIndex:10 }}>
        <div>
          <span style={{ ...mono, fontSize:13, fontWeight:700 }}>Kokoro</span>
          <span style={{ ...mono, fontSize:13, fontWeight:700, color:'#7c3aed', marginLeft:4 }}>OS</span>
          <span style={{ ...mono, fontSize:9, color:'#9ca3af', marginLeft:8, letterSpacing:'0.15em' }}>// Writer</span>
        </div>
        <button onClick={() => router.push('/kokoro-chat')} title="Talk に戻る"
          style={{ ...mono, fontSize:9, color:'#6b7280', background:'transparent', border:'1px solid #e5e7eb', borderRadius:2, padding:'6px 12px', cursor:'pointer' }}>
          ← Talk
        </button>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 28px 100px' }}>

        {/* モード切替タブ */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          {(Object.keys(MODE_CONFIG) as WriterMode[]).map(m => {
            const isMichi = m === 'michi';
            const michiDisabled = isMichi && !hasGoogleToken;
            const activeColor = isMichi ? '#0f9d58' : accentColor;
            const isActive = mode === m;
            return (
              <button
                key={m}
                onClick={() => {
                  if (michiDisabled) return;
                  setMode(m);
                  setOutputText(''); setOutputHtml(''); setError('');
                  setDriveFiles([]); setDriveContextLen(null);
                }}
                title={michiDisabled ? 'Googleログインが必要です' : MODE_CONFIG[m].label}
                style={{
                  ...mono, fontSize: 10, letterSpacing: '.1em',
                  padding: '8px 20px', borderRadius: 2,
                  cursor: michiDisabled ? 'not-allowed' : 'pointer',
                  border: `1px solid ${isActive ? activeColor : michiDisabled ? '#e5e7eb' : '#d1d5db'}`,
                  color: isActive ? '#fff' : michiDisabled ? '#d1d5db' : '#9ca3af',
                  background: isActive ? activeColor : 'transparent',
                  fontWeight: isActive ? 600 : 400,
                  opacity: michiDisabled ? 0.6 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {MODE_CONFIG[m].label}
              </button>
            );
          })}
        </div>

        {/* Michiモード: Googleログイン未検出の注意 */}
        {mode === 'michi' && !hasGoogleToken && (
          <div style={{ marginBottom: 16, ...mono, fontSize: 9, color: '#9ca3af', lineHeight: 1.6 }}>
            // Googleログインが必要です →{' '}
            <a href="/auth" style={{ color: '#0f9d58' }}>ログイン</a>
          </div>
        )}

        {/* 入力 */}
        <textarea
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder={MODE_CONFIG[mode].placeholder}
          style={{
            width: '100%', minHeight: mode === 'spark' ? 120 : 200, background: '#f8f9fa',
            border: '1px solid #d1d5db', borderLeft: '2px solid #d1d5db',
            padding: 16, fontSize: 14, color: '#111827',
            resize: 'vertical', outline: 'none', lineHeight: 1.8,
            fontFamily: "'Noto Serif JP', serif",
            boxSizing: 'border-box', borderRadius: '0 4px 4px 0',
          }}
          onFocus={e => e.currentTarget.style.borderLeftColor = accentColor}
          onBlur={e => e.currentTarget.style.borderLeftColor = '#d1d5db'}
        />

        {/* 出力 */}
        {(outputHtml || outputText) && (
          <div style={{ marginTop: 24 }}>
            {/* Michiモード: 感性情報バナー */}
            {mode === 'michi' && (usedCache || driveFiles.length > 0) && (
              <div style={{
                background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 4,
                padding: '8px 12px', marginBottom: 12, fontSize: 11, color: '#065f46', lineHeight: 1.6,
              }}>
                {usedCache ? '🧠 感性キャッシュを使用' : '📁 zineフォルダ参照中'}
                <div style={{ ...mono, fontSize: 9, color: '#6b7280', marginTop: 4 }}>
                  {usedCache ? (
                    <div>// 感性ベクター（{driveContextLen?.toLocaleString() ?? '?'} 文字）</div>
                  ) : (
                    <>
                      {driveFiles.map((f, i) => <div key={i}>• {f}</div>)}
                      {driveContextLen !== null && <div style={{ marginTop: 4 }}>// {driveContextLen.toLocaleString()} 文字読み込み</div>}
                    </>
                  )}
                </div>
              </div>
            )}
            {mode === 'lite' ? (
              /* Lite: readOnly テキストエリア */
              <textarea
                readOnly
                value={outputText}
                style={{
                  width: '100%', minHeight: 200, background: '#f9fafb',
                  border: '1px solid #e5e7eb', borderLeft: '2px solid #d1d5db',
                  padding: 16, fontSize: 14, color: '#374151',
                  resize: 'vertical', outline: 'none', lineHeight: 1.8,
                  fontFamily: "'Noto Serif JP', serif",
                  boxSizing: 'border-box', borderRadius: '0 4px 4px 0',
                }}
              />
            ) : (
              /* Deep / Spark: HTML描画 */
              <div
                className="edited-text-zone"
                style={{
                  minHeight: 200,
                  border: '1px solid #e5e7eb',
                  borderLeft: '2px solid #d1d5db',
                  borderRadius: 2,
                }}
              >
                {outputHtml ? (
                  <div
                    className="edited-text"
                    dangerouslySetInnerHTML={{ __html: outputHtml }}
                  />
                ) : (
                  <div style={{ padding: 24, fontSize: 14, lineHeight: 1.8, color: '#374151', whiteSpace: 'pre-wrap' }}>
                    {outputText}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 実行ボタン */}
        <button
          onClick={() => handleRun()}
          disabled={!canSubmit}
          title="編集する"
          style={{
            width: '100%', background: 'transparent',
            border: `1px solid ${canSubmit ? accentColor : '#d1d5db'}`,
            color: canSubmit ? accentColor : '#9ca3af',
            ...mono, fontSize: 10, letterSpacing: '.2em',
            padding: 13, cursor: canSubmit ? 'pointer' : 'not-allowed',
            borderRadius: 2, marginTop: 8,
          }}
        >
          Yoroshiku
        </button>

        {/* ローディング */}
        {isLoading && (
          <>
            {mode === 'michi' && (
              <div style={{ marginTop: 12, ...mono, fontSize: 10, color: '#0f9d58', letterSpacing: '.08em' }}>
                // zineフォルダを読み込んでいます...
              </div>
            )}
            <PersonaLoading />
          </>
        )}

        {/* エラー */}
        {error && (
          <div style={{ marginTop: 12, ...mono, fontSize: 11, color: '#ef4444', lineHeight: 1.8 }}>
            // エラー: {error}
          </div>
        )}

        {/* アクションボタン行 */}
        {outputText && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {/* Note保存 */}
            <button
              onClick={handleSaveToNote}
              disabled={saved}
              title="Noteに保存"
              style={{
                background: 'transparent',
                border: `1px solid ${saved ? '#10b981' : '#d1d5db'}`,
                color: saved ? '#10b981' : '#9ca3af',
                ...mono, fontSize: 8, letterSpacing: '.12em',
                padding: '8px 16px', cursor: saved ? 'default' : 'pointer',
                borderRadius: 3,
              }}
            >
              {saved ? 'Note ✓' : 'Note +'}
            </button>

            {/* コピー */}
            <button
              onClick={handleCopy}
              title="クリップボードにコピー"
              style={{
                background: 'transparent',
                border: `1px solid ${copied ? accentColor : '#d1d5db'}`,
                color: copied ? accentColor : '#9ca3af',
                ...mono, fontSize: 9, letterSpacing: '.12em',
                padding: '8px 16px', cursor: 'pointer',
                borderRadius: 2,
              }}
            >
              {copied ? 'Copy ✓' : 'Copy ↗'}
            </button>

            {/* ダウンロード */}
            <button
              onClick={() => {
                const blob = new Blob([outputText], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `kokoro-writer-${new Date().toISOString().slice(0,10)}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              title="テキストファイルとしてダウンロード"
              style={{
                background: 'transparent',
                border: '1px solid #d1d5db',
                color: '#9ca3af',
                ...mono, fontSize: 9, letterSpacing: '.12em',
                padding: '8px 16px', cursor: 'pointer',
                borderRadius: 2,
              }}
            >
              ↓
            </button>

            {/* Strategy保存 */}
            <button
              onClick={handleSaveToStrategy}
              disabled={strategySaved}
              title="Strategyに送る"
              style={{
                background: 'transparent',
                border: `1px solid ${strategySaved ? '#f59e0b' : '#d1d5db'}`,
                color: strategySaved ? '#f59e0b' : '#9ca3af',
                ...mono, fontSize: 9, letterSpacing: '.12em',
                padding: '8px 16px', cursor: strategySaved ? 'default' : 'pointer',
                borderRadius: 2,
              }}
            >
              {strategySaved ? 'Strategy ✓' : 'Strategy →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
