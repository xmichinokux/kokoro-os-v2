import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 180;

// Supabaseから感性マップを取得
async function fetchAestheticMap(): Promise<string> {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return '';

    const { data } = await supabase
      .from('user_profiles')
      .select('sensibility_cache, sensibility_thought_cache, sensibility_structure_cache')
      .eq('user_id', user.id)
      .single();

    const parts: string[] = [];
    if (data?.sensibility_cache) {
      parts.push(`【文章の感性】\n${data.sensibility_cache}`);
    }
    if (data?.sensibility_thought_cache) {
      parts.push(`【思想・価値観】\n${data.sensibility_thought_cache}`);
    }
    if (data?.sensibility_structure_cache) {
      parts.push(`【構造化の傾向】\n${data.sensibility_structure_cache}`);
    }

    const combined = parts.join('\n\n');
    // Creative用は1500文字に制限（設計プロンプトが長くなりすぎ防止）
    return combined.length > 1500 ? combined.slice(0, 1500) + '...(省略)' : combined;
  } catch {
    return '';
  }
}

// Step 1: Gemini設計（ビジュアル技法・パラメータ設計）
const DESIGN_PROMPT = (spec: string, aestheticMap: string) =>
  `あなたはビジュアルアート・ジェネラティブデザインの専門家です。
以下の仕様を読んで、SVG/Canvas/p5.jsで実装するための**簡潔な**設計書を作成してください。

【仕様】
${spec}
${aestheticMap ? `
【ユーザーの美意識・感性マップ】
色彩・構図・動きに以下の傾向を反映してください（要約的に取り入れること）。

${aestheticMap}
` : ''}
【設計書に含めること（各項目3〜5行以内で簡潔に）】
1. 表現技法（SVG / Canvas 2D / p5.js）とCDN URL
2. カラーパレット（#hex値を5〜8色、1行で列挙）
3. 構図の方針（1〜2文）
4. アニメーション（動きの種類と速度を箇条書き）
5. configオブジェクトのキー一覧（名前と型のみ、コード不要）
6. 実装上の注意点（3項目以内）

【絶対に守ること】
・設計書は**2000文字以内**に収めてください
・HTMLコード、JavaScript、CSSは**一切書かないでください**（コードはClaudeが書きます）
・configオブジェクトは**キー名と説明**だけ書いてください（値やコードブロックは不要）
・冗長な解説・感性マップの引用・背景説明は省いてください

【制約】
・シングルHTMLファイル、ブラウザで直接動作、CDN読み込み
・パラメータはconfigオブジェクトに集約（Tunerで調整可能にするため）
・出力はCanvasまたはSVG要素（PNG/SVGエクスポート可能）`;

// Step 2: Claude実装
const IMPLEMENT_PROMPT = (instruction: string, spec: string) =>
  `あなたは優秀なクリエイティブコーダーです。
以下の設計書に従って、完全に動作するシングルHTMLファイルを生成してください。

【設計書】
${instruction}

【元の仕様】
${spec}

【ルール】
・HTMLコードのみを返す（説明文・マークダウン不要）
・<!DOCTYPE html>から始めて</html>で終わる完全なHTMLを出力する
・外部ライブラリはすべて設計書で指定されたCDNから読み込む
・サーバーなしでブラウザで直接開いて動作すること
・調整可能なパラメータはconfigオブジェクトに集約する（例: const config = { particleCount: 100, speed: 2.5, ... }）
・各パラメータには意味のある名前を付ける（a, b, x ではなく colorPrimary, density, animSpeed 等）
・メインのビジュアル出力はcanvasまたはSVG要素にする
・右下に小さなエクスポートボタンを配置:
  - Canvas の場合: PNG保存ボタン（canvas.toDataURL('image/png') を使用）
  - SVG の場合: SVG保存ボタン（SVGソースをBlobで保存）
・レスポンシブ対応（viewportメタタグ必須、画面いっぱいに表示）
・背景色もconfigに含める
・日本語フォントが必要な場合はNoto Sans JP / Noto Serif JPをGoogle Fontsから読み込む
・document.readyStateを確認してから初期化する
・コメントを適切に入れる`;

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          thinkingConfig: { thinkingBudget: 0 },
        },
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

async function callClaude(apiKey: string, prompt: string): Promise<string> {
  const body = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    messages: [{ role: 'user', content: prompt }],
  });

  // 529 Overloaded 自動リトライ（指数バックオフ）
  let res: Response | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body,
    });
    if (res.status !== 529) break;
    const waitMs = Math.min(3000 * Math.pow(1.5, attempt), 15000);
    await new Promise(r => setTimeout(r, waitMs));
  }

  if (!res || !res.ok) {
    const errBody = await res?.text() ?? '';
    let errMsg = `Claude API error (${res?.status ?? 'unknown'})`;
    try {
      const err = JSON.parse(errBody);
      errMsg = err.error?.message || errMsg;
    } catch { /* non-JSON */ }
    throw new Error(errMsg);
  }

  const data = await res.json();
  let code = (data.content[0].text as string).trim();

  // コードブロック除去
  const codeBlockMatch = code.match(/```(?:html|HTML)?\s*\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    code = codeBlockMatch[1].trim();
  }

  // <!DOCTYPE html>より前を除去
  const doctypeIndex = code.indexOf('<!DOCTYPE');
  if (doctypeIndex > 0) code = code.substring(doctypeIndex);
  const doctypeLower = code.indexOf('<!doctype');
  if (doctypeLower > 0 && (doctypeIndex < 0 || doctypeLower < doctypeIndex)) {
    code = code.substring(doctypeLower);
  }

  return code;
}

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
    }
    if (!anthropicKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 });
    }

    const { spec, step, instruction } = await req.json() as {
      spec: string;
      step: 'design' | 'implement';
      instruction?: string;
    };

    // Step 1: Gemini設計
    if (step === 'design') {
      if (!spec) {
        return NextResponse.json({ error: '仕様が必要です' }, { status: 400 });
      }
      // 感性マップを取得（失敗しても続行）
      const aestheticMap = await fetchAestheticMap();
      let designDoc = await callGemini(geminiKey, DESIGN_PROMPT(spec, aestheticMap));

      // Geminiがコードを含めてしまった場合、コードブロックを除去
      designDoc = designDoc.replace(/```[\s\S]*?```/g, '[コード省略]');
      // 設計書が長すぎる場合は切り詰め（Claudeへの入力を制限）
      if (designDoc.length > 4000) {
        designDoc = designDoc.slice(0, 4000) + '\n...(設計書省略)';
      }

      return NextResponse.json({ instruction: designDoc, hasAestheticMap: !!aestheticMap });
    }

    // Step 2: Claude実装
    if (step === 'implement') {
      if (!instruction) {
        return NextResponse.json({ error: '設計書が必要です' }, { status: 400 });
      }
      // 設計書が巨大な場合の安全弁（クライアントから直接渡される場合）
      const trimmedInstruction = instruction.length > 4000
        ? instruction.slice(0, 4000) + '\n...(設計書省略)'
        : instruction;
      const code = await callClaude(anthropicKey, IMPLEMENT_PROMPT(trimmedInstruction, spec || ''));
      return NextResponse.json({ code });
    }

    return NextResponse.json({ error: '無効なstep' }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
