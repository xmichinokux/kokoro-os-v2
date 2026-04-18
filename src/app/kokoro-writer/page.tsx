'use client';

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { saveToNote } from '@/lib/saveToNote';
import { saveStrategyInput } from '@/lib/strategyInputs';
import PersonaLoading from '@/components/PersonaLoading';

type WriterMode = 'lite' | 'deep' | 'spark' | 'michi' | 'trip';

const MODE_CONFIG: Record<WriterMode, { label: string; placeholder: string }> = {
  lite: {
    label: 'Lite',
    placeholder: 'レイアウトしたい文章を入力してください...\n内容はそのまま、Medium風の美しいレイアウトに整形します。',
  },
  deep: {
    label: 'Deep',
    placeholder: 'リライト＋レイアウトしたい文章を入力してください...\nあなたの感性マップを使って、あなたらしい文章に仕上げます。',
  },
  spark: {
    label: 'Spark',
    placeholder: 'キーワードや断片的なメモを並べてください。\n例：シューティング スクロール 駆け引き スコア 緊張感',
  },
  michi: {
    label: 'Michi',
    placeholder: '',
  },
  trip: {
    label: 'Trip',
    placeholder: '変換したい文章を入力してください...\nトリップした文体で宇宙的スケールに昇華します。',
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

/* A4ページ分割コンポーネント */
const A4_CONTENT_HEIGHT = 960; // A4比率の内容領域高さ（px） padding除く

type A4PagesHandle = { getContainer: () => HTMLDivElement | null };

const A4Pages = forwardRef<A4PagesHandle, { html: string; plainText: string }>(
  function A4Pages({ html, plainText }, ref) {
  const measureRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<string[]>([]);

  useImperativeHandle(ref, () => ({
    getContainer: () => containerRef.current,
  }));

  useEffect(() => {
    if (!html && !plainText) { setPages([]); return; }

    // hrタグを除去してフラットなHTMLにする
    const cleanHtml = html
      ? html.replace(/<hr\s+class="whr"\s*\/?>/gi, '')
      : `<p class="wp">${plainText.replace(/\n/g, '<br>')}</p>`;

    // 非表示の計測コンテナにHTMLを流し込み、子要素ごとの高さを取得してページ分割
    const container = measureRef.current;
    if (!container) { setPages([cleanHtml]); return; }

    container.innerHTML = cleanHtml;

    // requestAnimationFrameで描画完了を待つ
    requestAnimationFrame(() => {
      const children = Array.from(container.children) as HTMLElement[];
      if (children.length === 0) { setPages([cleanHtml]); return; }

      const pageList: string[] = [];
      let currentPageHtml = '';
      let currentHeight = 0;

      for (const child of children) {
        const h = child.offsetHeight + parseInt(getComputedStyle(child).marginTop || '0') + parseInt(getComputedStyle(child).marginBottom || '0');

        if (currentHeight + h > A4_CONTENT_HEIGHT && currentPageHtml) {
          pageList.push(currentPageHtml);
          currentPageHtml = '';
          currentHeight = 0;
        }

        currentPageHtml += child.outerHTML;
        currentHeight += h;
      }
      if (currentPageHtml) pageList.push(currentPageHtml);

      setPages(pageList.length > 0 ? pageList : [cleanHtml]);
      container.innerHTML = '';
    });
  }, [html, plainText]);

  return (
    <>
      {/* 非表示の計測用コンテナ */}
      <div
        ref={measureRef}
        className="edited-text"
        style={{
          position: 'absolute', visibility: 'hidden', width: 520, // A4ページ内のコンテンツ幅 (600 - padding 80)
          left: -9999, top: 0,
        }}
      />
      <div ref={containerRef} className="writer-pages-container">
        {pages.map((pageHtml, idx) => (
          <div key={idx} className="writer-page">
            <div className="edited-text" dangerouslySetInnerHTML={{ __html: pageHtml }} />
            <div className="writer-page-number">{idx + 1} / {pages.length}</div>
          </div>
        ))}
      </div>
    </>
  );
});

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

  const [hasTripCache, setHasTripCache] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const a4Ref = useRef<A4PagesHandle>(null);

  // Googleアクセストークン・キャッシュ有無を確認
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setHasGoogleToken(!!session?.provider_token);
      if (session?.user) {
        try {
          const res = await fetch('/api/drive-cache');
          const data = await res.json();
          setHasTripCache(!!data.tripCache);
        } catch { /* ignore */ }
      }
    })();
  }, []);

  const canSubmit = inputText.trim().length > 0 && !isLoading
    && (mode !== 'trip' || hasTripCache);

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
      // 全モード: XMLパース → HTML描画
      const parsed = parseWriterXml(raw);
      setOutputHtml(parsed.html);
      setOutputText(parsed.plain);
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

  const handlePdfDownload = async () => {
    const container = a4Ref.current?.getContainer();
    if (!container) return;
    setPdfExporting(true);
    try {
      const html2canvas = (await import('html2canvas-pro')).default;
      const { jsPDF } = await import('jspdf');
      const pageEls = container.querySelectorAll('.writer-page') as NodeListOf<HTMLElement>;
      if (pageEls.length === 0) return;

      // A4: 210mm × 297mm
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = 210;
      const pdfH = 297;

      for (let i = 0; i < pageEls.length; i++) {
        if (i > 0) pdf.addPage();
        const canvas = await html2canvas(pageEls[i], {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
        });
        const imgData = canvas.toDataURL('image/png');
        const imgW = canvas.width;
        const imgH = canvas.height;
        const ratio = Math.min(pdfW / imgW, pdfH / imgH);
        const w = imgW * ratio;
        const h = imgH * ratio;
        const x = (pdfW - w) / 2;
        const y = (pdfH - h) / 2;
        pdf.addImage(imgData, 'PNG', x, y, w, h);
      }
      pdf.save(`kokoro-writer-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error('PDF export failed:', e);
    } finally {
      setPdfExporting(false);
    }
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

  const accentColor = '#7c3aed';

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#374151' }}>

      {/* ヘッダー */}
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', borderBottom:'1px solid #e5e7eb', position:'sticky', top:0, background:'#fff', zIndex:10 }}>
        <div>
          <span style={{ ...mono, fontSize:13, fontWeight:700 }}>Kokoro</span>
          <span style={{ ...mono, fontSize:13, fontWeight:700, color:'#7c3aed', marginLeft:4 }}>OS</span>
          <span style={{ ...mono, fontSize:9, color:'#9ca3af', marginLeft:8, letterSpacing:'0.15em' }}>// Writer</span>
        </div>
        <div />
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 28px 100px' }}>

        {/* モード切替タブ */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          {(Object.keys(MODE_CONFIG) as WriterMode[]).filter(m => m !== 'michi').map(m => {
            const isTrip = m === 'trip';
            const isDisabled = (isTrip && !hasTripCache);
            const activeColor = isTrip ? '#e11d48' : accentColor;
            const isActive = mode === m;
            return (
              <button
                key={m}
                onClick={() => {
                  if (isDisabled) return;
                  setMode(m);
                  setOutputText(''); setOutputHtml(''); setError('');
                  setDriveFiles([]); setDriveContextLen(null);
                }}
                title={isDisabled
                  ? 'ProfileページでTripスキャンを実行してください'
                  : MODE_CONFIG[m].label}
                style={{
                  ...mono, fontSize: 10, letterSpacing: '.1em',
                  padding: '8px 20px', borderRadius: 2,
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  border: `1px solid ${isActive ? activeColor : isDisabled ? '#e5e7eb' : '#d1d5db'}`,
                  color: isActive ? '#fff' : isDisabled ? '#d1d5db' : '#9ca3af',
                  background: isActive ? activeColor : 'transparent',
                  fontWeight: isActive ? 600 : 400,
                  opacity: isDisabled ? 0.6 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {MODE_CONFIG[m].label}
              </button>
            );
          })}
        </div>

        {/* Tripモード: キャッシュ未検出の注意 */}
        {mode === 'trip' && !hasTripCache && (
          <div style={{ marginBottom: 16, ...mono, fontSize: 9, color: '#9ca3af', lineHeight: 1.6 }}>
            // Tripキャッシュがありません →{' '}
            <a href="/kokoro-profile" style={{ color: '#e11d48' }}>Profileページ</a>でScan Tripを実行してください
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
            {/* Michi/Tripモード: キャッシュ情報バナー */}
            {(mode === 'michi' || mode === 'trip') && (usedCache || driveFiles.length > 0) && (
              <div style={{
                background: mode === 'trip' ? '#fff1f2' : '#ecfdf5',
                border: `1px solid ${mode === 'trip' ? '#fda4af' : '#a7f3d0'}`,
                borderRadius: 4,
                padding: '8px 12px', marginBottom: 12, fontSize: 11,
                color: mode === 'trip' ? '#9f1239' : '#065f46', lineHeight: 1.6,
              }}>
                {mode === 'trip' ? '🚀 Tripキャッシュを使用' : usedCache ? '🧠 感性キャッシュを使用' : '📁 zineフォルダ参照中'}
                <div style={{ ...mono, fontSize: 9, color: '#6b7280', marginTop: 4 }}>
                  {usedCache ? (
                    <div>// {mode === 'trip' ? 'トリップ設計図' : '感性ベクター'}（{driveContextLen?.toLocaleString() ?? '?'} 文字）</div>
                  ) : (
                    <>
                      {driveFiles.map((f, i) => <div key={i}>• {f}</div>)}
                      {driveContextLen !== null && <div style={{ marginTop: 4 }}>// {driveContextLen.toLocaleString()} 文字読み込み</div>}
                    </>
                  )}
                </div>
              </div>
            )}
            {/* HTML描画（A4ページ区切りレイアウト） */}
            <A4Pages ref={a4Ref} html={outputHtml} plainText={outputText} />
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
            {(mode === 'michi' || mode === 'trip') && (
              <div style={{ marginTop: 12, ...mono, fontSize: 10, color: mode === 'trip' ? '#e11d48' : '#0f9d58', letterSpacing: '.08em' }}>
                {mode === 'trip' ? '// トリップモードで変換中...' : '// zineフォルダを読み込んでいます...'}
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

            {/* PDF ダウンロード */}
            <button
              onClick={handlePdfDownload}
              disabled={pdfExporting}
              title="PDFとしてダウンロード"
              style={{
                background: 'transparent',
                border: `1px solid ${pdfExporting ? '#a855f7' : '#d1d5db'}`,
                color: pdfExporting ? '#a855f7' : '#9ca3af',
                ...mono, fontSize: 9, letterSpacing: '.12em',
                padding: '8px 16px', cursor: pdfExporting ? 'wait' : 'pointer',
                borderRadius: 2,
              }}
            >
              {pdfExporting ? 'PDF...' : 'PDF ↓'}
            </button>

          </div>
        )}
      </div>
    </div>
  );
}
