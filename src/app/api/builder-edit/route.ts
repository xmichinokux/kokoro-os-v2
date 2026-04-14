import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;

const EDIT_PROMPT = (html: string, instruction: string) =>
  `あなたは優秀なフロントエンドエンジニアです。
以下の既存HTMLコードに対して、ユーザーの修正指示を適用してください。

【修正指示】
${instruction}

【ルール】
・修正後の**完全なHTMLコード**を返す（差分ではなく全体）
・<!DOCTYPE html>から始めて</html>で終わる
・マークダウンのコードブロックは使わない
・既存の機能や構造を壊さないように修正する
・指示された部分のみを変更し、他は極力維持する
・CSSの変更は既存のスタイル体系に合わせる
・新しいライブラリが必要な場合はCDN経由で追加する
・修正箇所にはHTMLコメント <!-- EDITED: 変更内容 --> を付ける

【既存のHTMLコード】
${html}`;

function extractText(content: { type: string; text?: string }[]): string {
  for (const block of content) {
    if (block.type === 'text' && block.text) return block.text;
  }
  return '';
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 });
    }

    const { html, instruction } = await req.json() as {
      html: string;
      instruction: string;
    };

    if (!html || !instruction) {
      return NextResponse.json({ error: 'HTMLコードと修正指示が必要です' }, { status: 400 });
    }

    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      messages: [{
        role: 'user',
        content: EDIT_PROMPT(html, instruction),
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
    code = code.trim();

    // コードブロック除去
    const codeBlockMatch = code.match(/```(?:html|HTML)?\s*\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      code = codeBlockMatch[1].trim();
    }

    // <!DOCTYPE html> より前を除去
    const doctypeIndex = code.indexOf('<!DOCTYPE');
    if (doctypeIndex > 0) code = code.substring(doctypeIndex);
    const doctypeLower = code.indexOf('<!doctype');
    if (doctypeLower > 0 && (doctypeIndex < 0 || doctypeLower < doctypeIndex)) {
      code = code.substring(doctypeLower);
    }

    if (!code.includes('<html') && !code.includes('<!DOCTYPE') && !code.includes('<!doctype')) {
      throw new Error('修正結果が有効なHTMLではありません');
    }

    return NextResponse.json({ code });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
