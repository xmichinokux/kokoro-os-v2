import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;

const EDIT_PROMPT = (svg: string, instruction: string) =>
  `あなたはSVGコードの編集専門家です。
以下の既存SVGコードに対して、ユーザーの修正指示を適用してください。

【修正指示】
${instruction}

【ルール】
・修正後の**完全なSVGコード**を返す（差分ではなく全体）
・<svg>で始まり</svg>で終わる
・マークダウンのコードブロックは使わない
・xmlns="http://www.w3.org/2000/svg" を必ず含める
・width, height, viewBox 属性を必ず含める
・既存のグループ構造（<g id="g-xxx">）を極力維持する
・指示された部分のみを変更し、他は極力そのまま維持する
・新しい要素を追加する場合は適切なグループIDを付与する
・色の変更は fill/stroke 属性を直接変更する（CSSクラスは使わない）
・修正箇所には <!-- EDITED: 変更内容 --> コメントを付ける

【既存のSVGコード】
${svg}`;

function extractText(content: { type: string; text?: string }[]): string {
  for (const block of content) {
    if (block.type === 'text' && block.text) return block.text;
  }
  return '';
}

function extractSvg(text: string): string {
  // コードブロック除去
  const codeBlockMatch = text.match(/```(?:svg|xml|html)?\s*\n([\s\S]*?)```/);
  if (codeBlockMatch) text = codeBlockMatch[1].trim();

  // <svg>...</svg> を抽出
  const svgMatch = text.match(/<svg[\s\S]*<\/svg>/);
  let svg = svgMatch ? svgMatch[0].trim() : text;

  // width/height 属性がない場合に追加
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
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 });
    }

    const { svg, instruction } = await req.json() as {
      svg: string;
      instruction: string;
    };

    if (!svg || !instruction) {
      return NextResponse.json({ error: 'SVGコードと修正指示が必要です' }, { status: 400 });
    }

    const body = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 20000,
      messages: [{
        role: 'user',
        content: EDIT_PROMPT(svg, instruction),
      }],
    });

    // 529 Overloaded 自動リトライ
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
    let code = extractText(data.content);
    code = extractSvg(code.trim());

    if (!code.includes('<svg')) {
      throw new Error('修正結果が有効なSVGではありません');
    }

    return NextResponse.json({ svg: code });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
