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
// Feasibility Layer: 実現可能性の事前判定
// ==========================
const FEASIBILITY_PROMPT = (subject: string, style: string) =>
  `あなたはSVGベクターイラスト生成の実現可能性判定者です。
以下の主題とスタイルが、800x800の単一SVGファイル（最大3000行程度）で60〜120秒以内に生成可能か判定してください。

【主題】${subject}
【スタイル】${style}

【判定基準】
"infeasible"（突き返す）:
- 写真のようなリアル描写（光彩・質感・毛穴レベルの厳密再現）
- 3DCG・リアルタイムシェーダ・動画・アニメーション
- 大量要素（群衆100人以上、密林全景、都市俯瞰、星図、細胞構造の詳細）
- 実在する特定個人の肖像（著作権・肖像権）
- 長文テキストを含む図表・インフォグラフィック主体
- 複数ページ・絵コンテ全体・漫画の見開き

"risky"（警告付きで続行）:
- 複雑な風景（複数人物+背景+詳細小物が同居）
- 特定のアニメ/マンガ/ゲームキャラクターの忠実再現（著作権懸念）
- 科学的・技術的厳密性が必要な図解（解剖図、回路図、分子構造）
- 非常に細密なディテールを要求するスタイル（点描、極めて緻密な模様全面）

"feasible"（そのまま続行）:
- 単体または少数のモチーフ（動物、人物1〜2名、静物、料理）
- シンプルな風景（1シーン、要素数20以下）
- ロゴ・アイコン・シンボル
- 抽象画・パターン

【出力】JSONのみ（説明・コードブロック不要）：
{"feasibility": "feasible" | "risky" | "infeasible", "reason": "..."}

- reason: infeasibleなら「何が作れないか」を30字以内（例: "写真レベルのリアル描写は不可"）
- risky なら「何が不安か」を30字以内（例: "著作権のあるキャラクターの可能性"）
- feasible は空文字列`;

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
// Critique Layer: SVGを読んで主題適合性・細部品質を批評
// ==========================
const CRITIQUE_PROMPT = (subject: string, style: string, designDoc: string, svg: string) =>
  `あなたはSVGベクターイラストの辛口批評家です。以下の主題・スタイル・設計書に対し、実際に生成されたSVGコードを読み、**主題への見えやすさ**と**細部の実装品質**を評価してください。

【主題】${subject}
【スタイル】${style}
【設計書】
${designDoc}

【生成されたSVGコード】
${svg.length > 12000 ? svg.slice(0, 12000) + '\n...(省略)' : svg}

【評価観点】
A. 主題への整合性
  - 主題の特徴的な要素（例: 顔なら目鼻口・眉、猫なら耳尻尾ひげ）がすべて存在するか
  - 各要素の位置関係・比率が自然か（顔中心に目がある、尻尾が胴から生えている、等）
  - 第一印象で「${subject}」と分かる構成か

B. 設計書の実装忠実度
  - 設計書の要素リストがすべてSVGに含まれるか（g-xxx IDで確認）
  - 指定カラーパレット・レイヤー順序が守られているか

C. 細部の完成度
  - 輪郭が単純な<circle>や<rect>で済まされていないか（jitter済み多角形/pathになっているか）
  - ハッチング（平行線による影）が設計書の指示通り実装されているか
  - ストロークの強弱（閉パスによる入り抜き）が表現されているか

【出力形式】以下のJSONのみ返してください（説明・コードブロック不要）：
{"severity": "ok" | "minor" | "major", "issues": ["具体的な問題1（どの要素がどう不足/ズレているか）", "..."]}

- severity: "ok"=修正不要 / "minor"=細部のみ不満 / "major"=主題が伝わらない・要素欠落
- issues は最大6件、重要度順、各30〜80字の具体的な日本語
- 問題なしなら issues は空配列`;

// ==========================
// Refine Layer: 批評を受けて精緻化
// ==========================
const REFINE_PROMPT = (subject: string, style: string, designDoc: string, svg: string, issues: string[]) =>
  `あなたはSVGコードの精緻化担当です。以下のSVGに対し、批評で指摘された問題を解消してください。

【主題】${subject}
【スタイル】${style}
【設計書（参考）】
${designDoc.slice(0, 1500)}

【批評で指摘された問題（優先度順）】
${issues.map((s, i) => `${i + 1}. ${s}`).join('\n')}

【修正ルール】
・修正後の**完全なSVGコード**を返す（差分ではなく全体）
・<svg>で始まり</svg>で終わる。マークダウンコードブロックは使わない
・width, height, viewBox="0 0 800 800", xmlns="http://www.w3.org/2000/svg" を必ず含める
・既存の構造（グループID g-xxx、レイヤー順序）を壊さず、指摘された部分のみ変更・追加
・要素欠落の指摘があれば、該当要素を新規 <g id="g-xxx"> として追加
・「輪郭が単純」系の指摘は、対象を24〜48頂点のjitter済み<polygon>/<path>に置き換える
・「ハッチング不足」系の指摘は、該当部分に平行線グループを追加（<g id="g-hatch-xxx">）
・「ストローク強弱不足」系の指摘は、重要輪郭を細長い閉<path>に置き換える

【修正対象のSVG】
${svg}`;

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
  model: 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6' = 'claude-sonnet-4-6',
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

    const { subject, style, step, designDoc: inputDesignDoc, svg: inputSvg, issues: inputIssues } = await req.json() as {
      subject: string;
      style: string;
      step: 'feasibility' | 'logic' | 'styling' | 'critique' | 'refine' | 'debug';
      designDoc?: string;
      svg?: string;
      issues?: string[];
    };

    // Step 0: Feasibility Layer（Gemini で実現可能性判定）
    if (step === 'feasibility') {
      if (!subject) return NextResponse.json({ error: '主題が必要です' }, { status: 400 });
      const raw = await callGemini(geminiKey, FEASIBILITY_PROMPT(subject, style || ''));
      const jsonMatch = raw.match(/\{[\s\S]*?\}/);
      let feasibility: 'feasible' | 'risky' | 'infeasible' = 'feasible';
      let reason = '';
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          const rawF = parsed.feasibility;
          feasibility = rawF === 'infeasible' ? 'infeasible' : rawF === 'risky' ? 'risky' : 'feasible';
          reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 60) : '';
        } catch { /* fallthrough: feasible */ }
      }
      return NextResponse.json({ feasibility, reason });
    }

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
      const raw = await callClaude(
        anthropicKey,
        STYLING_PROMPT(inputDesignDoc, subject || '', style || ''),
        'claude-sonnet-4-6',
        20000,
      );
      const svg = extractSvg(raw);

      // バリデーション
      const errors = validateSvg(svg);

      return NextResponse.json({ svg, errors });
    }

    // Step 2.5: Critique Layer（Gemini で批評）
    if (step === 'critique') {
      if (!inputSvg) return NextResponse.json({ error: 'SVGコードが必要です' }, { status: 400 });
      const raw = await callGemini(
        geminiKey,
        CRITIQUE_PROMPT(subject || '', style || '', inputDesignDoc || '', inputSvg),
      );
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      let severity: 'ok' | 'minor' | 'major' = 'ok';
      let issues: string[] = [];
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          const rawSev = parsed.severity;
          severity = rawSev === 'major' ? 'major' : rawSev === 'minor' ? 'minor' : 'ok';
          if (Array.isArray(parsed.issues)) {
            issues = parsed.issues
              .filter((s: unknown): s is string => typeof s === 'string')
              .slice(0, 6)
              .map((s: string) => s.slice(0, 120));
          }
        } catch { /* fallthrough: ok */ }
      }
      return NextResponse.json({ severity, issues });
    }

    // Step 2.6: Refine Layer（Claude Sonnet で批評に基づき修正）
    if (step === 'refine') {
      if (!inputSvg) return NextResponse.json({ error: 'SVGコードが必要です' }, { status: 400 });
      if (!inputIssues || inputIssues.length === 0) {
        return NextResponse.json({ svg: inputSvg });
      }
      const raw = await callClaude(
        anthropicKey,
        REFINE_PROMPT(subject || '', style || '', inputDesignDoc || '', inputSvg, inputIssues),
        'claude-sonnet-4-6',
        20000,
      );
      const svg = extractSvg(raw);
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
