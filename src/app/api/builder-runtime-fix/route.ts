import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const FIX_PROMPT = (html: string, errors: string[], designDoc: string) =>
  `あなたは優秀なフロントエンドエンジニアです。
以下のHTMLコードを実行した際に発生したランタイムエラーを修正してください。

【ランタイムエラー一覧】
${errors.join('\n')}

${designDoc ? `【設計書（参考）】\n${designDoc.slice(0, 2000)}\n` : ''}

【ルール】
・エラーの根本原因を特定して修正する
・修正後の完全なHTMLを返す（差分ではなく全体）
・<!DOCTYPE html>から始める
・マークダウンのコードブロックは使わない
・既存の機能を壊さないように修正する
・import/export文は使わない（インラインscriptのため）
・クラスの重複定義がある場合は、より完全な方を残して他を削除する
・未定義の変数・クラスを参照している場合は、定義を追加するか参照を修正する

【修正対象のHTMLコード】
${html}`;

// レスポンスのcontent配列からtextを抽出
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

    const { html, errors, designDoc } = await req.json() as {
      html: string;
      errors: string[];
      designDoc?: string;
    };

    if (!html || !errors || errors.length === 0) {
      return NextResponse.json({ error: 'HTMLコードとエラー情報が必要です' }, { status: 400 });
    }

    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      messages: [{
        role: 'user',
        content: FIX_PROMPT(html, errors, designDoc || ''),
      }],
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
    let code = extractText(data.content);
    code = code.trim();

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

    // 基本的なバリデーション
    if (!code.includes('<html') && !code.includes('<!DOCTYPE') && !code.includes('<!doctype')) {
      throw new Error('修正結果が有効なHTMLではありません');
    }

    return NextResponse.json({ code });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
