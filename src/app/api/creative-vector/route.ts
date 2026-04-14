import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 180;

// 感性マップ取得
async function fetchAestheticMap(): Promise<string> {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return '';
    const { data } = await supabase
      .from('user_profiles')
      .select('sensibility_cache, sensibility_thought_cache')
      .eq('user_id', user.id)
      .single();
    const parts: string[] = [];
    if (data?.sensibility_cache) parts.push(data.sensibility_cache.slice(0, 600));
    if (data?.sensibility_thought_cache) parts.push(data.sensibility_thought_cache.slice(0, 400));
    return parts.join('\n');
  } catch { return ''; }
}

// ==========================
// Logic Layer: 意図 → 構造設計
// ==========================
const LOGIC_PROMPT = (subject: string, style: string, aestheticMap: string) =>
  `あなたはベクターイラストの構造設計者です。
以下の主題とスタイルを読み、SVGで描くための**構造設計書**を作成してください。

【主題】${subject}
【スタイル】${style}
${aestheticMap ? `\n【ユーザーの美的感覚】\n${aestheticMap}\n` : ''}

【設計書に含めること（各項目2〜4行で簡潔に）】
1. 分解した要素リスト（例: 顔→楕円、眼鏡→円×2+ブリッジ線、髭→パス群）
   - 各要素にSVGグループID（英数字、例: g-face, g-glasses, g-beard）を付与
2. 各要素の基本形状（circle, ellipse, rect, path のどれか）
3. 相対的な位置関係とサイズ比率（viewBox: 0 0 800 800 を基準）
4. レイヤー順序（背景→体→顔→装飾の順）
5. スタイル適用方針：
   - 輪郭線: 頂点にノイズを加えた多角形近似（jitter量の目安）
   - 線の強弱: 閉パスによるストローク表現（太さ変動の目安）
   - ハッチング: 影部分に平行線グリッドを使用（密度と角度）
6. カラーパレット（#hex 5〜8色）

【絶対に守ること】
・SVGコードは一切書かないでください（コードはClaudeが書きます）
・1500文字以内に収めてください`;

// ==========================
// Styling Layer: 構造 → SVGコード生成
// ==========================
const STYLING_PROMPT = (designDoc: string, subject: string, style: string) =>
  `あなたは精密なSVGコードを書く専門家です。
以下の構造設計書に従い、**完全なSVGコード**を生成してください。

【構造設計書】
${designDoc}

【主題】${subject}
【スタイル】${style}

【SVG生成ルール】

1. **フォーマット**:
   - viewBox="0 0 800 800" の単一SVGファイル
   - xmlns="http://www.w3.org/2000/svg" を必ず含める
   - 背景には <rect> を配置
   - SVGコードのみを返す（<svg>で始まり</svg>で終わる）
   - マークダウンのコードブロックは使わない

2. **サイズ属性**:
   - <svg> タグに必ず width="800" height="800" viewBox="0 0 800 800" を全て含める
   - width/heightが無いとブラウザで表示されないため、絶対に省略しない

3. **グループ構造**:
   - 各要素を <g id="g-xxx"> でグループ化（設計書のID通り）
   - transform属性で位置・回転・スケールを制御
   - 後からTunerで操作できるように、主要な数値をわかりやすく配置

3. **輪郭線のデフォルメ（Jitter）**:
   - 単純な <circle> や <rect> ではなく、<polygon> または <path> で近似する
   - 円なら24〜48頂点の多角形にし、各頂点にランダムなオフセット（半径の1〜5%）を加える
   - これにより「手描きの震え」を再現する
   - 例: 半径100の円 → 36頂点の多角形で、各頂点は半径97〜103の範囲でランダム配置

4. **線の強弱（Variable Stroke Width）**:
   - 重要な輪郭線は単一の stroke ではなく、細長い閉パス（<path d="...Z"/>）として描く
   - パスの幅を始点→中央→終点で変化させ、ペンの入り抜きを表現
   - 例: 始点幅1px → 中央幅3px → 終点幅0.5px

5. **ハッチング（影の表現）**:
   - 影の部分は塗り（fill）ではなく、平行線のグループ <g id="g-hatch-xxx"> として描く
   - 線の間隔（密度）とストローク幅で濃淡を表現
   - clip-path で対象領域にクリップする
   - 線にも微小なjitterを加える

6. **カラー**:
   - 設計書のカラーパレットに従う
   - fill, stroke に直接 #hex を指定（CSSクラスは使わない、Tuner互換のため）

7. **情報密度**:
   - スタイルが「緻密」を要求する場合、ハッチング線を増やし、頂点数を多くする
   - 要素数が多すぎてパフォーマンスに影響しないよう、全体で3000行以下を目安とする`;

// ==========================
// Debug Layer: SVG検証と修正
// ==========================
const DEBUG_PROMPT = (svg: string, designDoc: string, errors: string[]) =>
  `あなたはSVGコードのデバッガーです。
以下のSVGコードに問題があります。修正してください。

【検出された問題】
${errors.join('\n')}

【設計書（参考）】
${designDoc.slice(0, 1500)}

【修正ルール】
・修正後の完全なSVGコードを返す（差分ではなく全体）
・<svg>で始まり</svg>で終わる
・マークダウンのコードブロックは使わない
・既存の構造（グループID、レイヤー順序）を壊さない
・xmlns="http://www.w3.org/2000/svg"を必ず含める

【修正対象のSVGコード】
${svg}`;

// Gemini呼び出し
async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
      }),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.filter((p: { text?: string }) => p.text)
    ?.map((p: { text: string }) => p.text)
    ?.join('') ?? '';
  if (!text) throw new Error('Geminiから応答がありませんでした');
  return text.trim();
}

// Claude呼び出し（Haiku: デバッグ用、Sonnet: 生成用）
async function callClaude(
  apiKey: string,
  prompt: string,
  model: 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-20250514' = 'claude-sonnet-4-20250514',
  maxTokens = 16000,
): Promise<string> {
  const body = JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] });
  let res: Response | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body,
    });
    if (res.status !== 529) break;
    const waitMs = Math.min(3000 * Math.pow(1.5, attempt), 15000);
    await new Promise(r => setTimeout(r, waitMs));
  }
  if (!res || !res.ok) {
    const errBody = await res?.text() ?? '';
    let errMsg = `Claude API error (${res?.status ?? 'unknown'})`;
    try { const err = JSON.parse(errBody); errMsg = err.error?.message || errMsg; } catch { /* */ }
    throw new Error(errMsg);
  }
  const data = await res.json();
  return (data.content[0].text as string).trim();
}

// SVGバリデーション
function validateSvg(svg: string): string[] {
  const errors: string[] = [];
  if (!svg.includes('<svg')) errors.push('SVG開始タグがありません');
  if (!svg.includes('</svg>')) errors.push('SVG終了タグがありません');
  if (!svg.includes('xmlns=')) errors.push('xmlns属性がありません');
  if (!svg.includes('viewBox')) errors.push('viewBox属性がありません');

  // 閉じタグの不一致を簡易チェック
  const openTags = (svg.match(/<(g|path|circle|rect|ellipse|polygon|line|polyline|text|clipPath|defs)\b/g) || []).length;
  const closeTags = (svg.match(/<\/(g|path|circle|rect|ellipse|polygon|line|polyline|text|clipPath|defs)>/g) || []).length;
  const selfClose = (svg.match(/<(path|circle|rect|ellipse|polygon|line|polyline)\b[^>]*\/>/g) || []).length;
  if (openTags - selfClose > closeTags + 2) {
    errors.push(`タグの閉じ忘れの可能性（開: ${openTags}, 閉: ${closeTags}, 自己閉じ: ${selfClose}）`);
  }

  // グループIDの存在確認
  if (!svg.includes('id="g-')) errors.push('グループID（id="g-xxx"）が見つかりません。Tuner連携のためIDが必要です');

  return errors;
}

// SVGコードを抽出
function extractSvg(text: string): string {
  // コードブロック除去
  const codeBlockMatch = text.match(/```(?:svg|xml|html)?\s*\n([\s\S]*?)```/);
  if (codeBlockMatch) text = codeBlockMatch[1].trim();

  // <svg>.....</svg> を抽出
  const svgMatch = text.match(/<svg[\s\S]*<\/svg>/);
  let svg = svgMatch ? svgMatch[0].trim() : text;

  // width/height 属性がない場合に追加（表示サイズ確保）
  if (svg.startsWith('<svg') && !svg.match(/\bwidth\s*=/)) {
    svg = svg.replace('<svg', '<svg width="800" height="800"');
  }

  // viewBox がない場合に追加
  if (svg.startsWith('<svg') && !svg.includes('viewBox')) {
    svg = svg.replace('<svg', '<svg viewBox="0 0 800 800"');
  }

  return svg;
}

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!geminiKey) return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
    if (!anthropicKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 });

    const { subject, style, step, designDoc: inputDesignDoc, svg: inputSvg } = await req.json() as {
      subject: string;
      style: string;
      step: 'logic' | 'styling' | 'debug';
      designDoc?: string;
      svg?: string;
    };

    // Step 1: Logic Layer（Gemini で構造設計）
    if (step === 'logic') {
      if (!subject) return NextResponse.json({ error: '主題が必要です' }, { status: 400 });
      const aestheticMap = await fetchAestheticMap();
      let designDoc = await callGemini(geminiKey, LOGIC_PROMPT(subject, style || '', aestheticMap));

      // コードブロック除去・切り詰め
      designDoc = designDoc.replace(/```[\s\S]*?```/g, '[コード省略]');
      if (designDoc.length > 3000) designDoc = designDoc.slice(0, 3000) + '\n...(省略)';

      return NextResponse.json({ designDoc });
    }

    // Step 2: Styling Layer（Claude Sonnet で SVG生成）
    if (step === 'styling') {
      if (!inputDesignDoc) return NextResponse.json({ error: '設計書が必要です' }, { status: 400 });
      const raw = await callClaude(anthropicKey, STYLING_PROMPT(inputDesignDoc, subject || '', style || ''));
      const svg = extractSvg(raw);

      // バリデーション
      const errors = validateSvg(svg);

      return NextResponse.json({ svg, errors });
    }

    // Step 3: Debug Layer（Claude Haiku で修正）
    if (step === 'debug') {
      if (!inputSvg) return NextResponse.json({ error: 'SVGコードが必要です' }, { status: 400 });

      // 入力SVGを再バリデーション
      const currentErrors = validateSvg(inputSvg);
      if (currentErrors.length === 0) {
        return NextResponse.json({ svg: inputSvg, errors: [], fixed: false });
      }

      const raw = await callClaude(
        anthropicKey,
        DEBUG_PROMPT(inputSvg, inputDesignDoc || '', currentErrors),
        'claude-haiku-4-5-20251001',
        8000,
      );
      const fixedSvg = extractSvg(raw);
      const remainingErrors = validateSvg(fixedSvg);

      return NextResponse.json({ svg: fixedSvg, errors: remainingErrors, fixed: true });
    }

    return NextResponse.json({ error: '無効なstep' }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
