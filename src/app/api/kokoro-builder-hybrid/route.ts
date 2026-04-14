import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_PROMPT = (spec: string) => `あなたは優秀なソフトウェアアーキテクトです。
以下の仕様書を読んで、シングルHTMLファイルの実装指示書を作成してください。

【仕様書】
${spec}

【出力形式】
簡潔に、以下だけを書いてください（合計1000文字以内）：

1. CDN（ライブラリ名とURL、最大3つ）
2. HTML構造（div構成を箇条書き）
3. 主要関数（関数名と1行説明、最大8個）
4. データ構造（変数名と型、最大5個）
5. 注意点（最大3つ）

【制約】
・サーバーなし・ブラウザ直接動作
・CDN経由で読み込む
・モバイル対応
・Phaser 3使用時: type: Phaser.CANVAS、CDN: https://cdn.jsdelivr.net/npm/phaser@3.55.2/dist/phaser.min.js

冗長な説明は不要。箇条書きのみ。`;

const CLAUDE_PROMPT = (instruction: string) => `以下の実装指示に従い、完全に動作するシングルHTMLを生成せよ。

${instruction}

【絶対ルール】
・HTMLコードのみ出力（説明文禁止）
・<!DOCTYPE html>で開始、</html>で終了
・CDNで外部ライブラリ読み込み
・コメントは最小限
・Noto Sans JP使用
・viewport必須
・Phaser 3はtype: Phaser.CANVAS
・コードは簡潔に。動くことを最優先。`;

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

    const { spec, step, instruction } = await req.json() as { spec: string; step: 'gemini' | 'claude'; instruction?: string };

    if (!spec) {
      return NextResponse.json({ error: '仕様書が必要です' }, { status: 400 });
    }

    // Step 1: Geminiで実装指示書を生成
    if (step === 'gemini') {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(GEMINI_PROMPT(spec));
      const generatedInstruction = result.response.text();
      return NextResponse.json({ instruction: generatedInstruction });
    }

    // Step 2: Claudeでコード生成
    if (step === 'claude') {
      if (!instruction) {
        return NextResponse.json({ error: '実装指示書が必要です' }, { status: 400 });
      }

      const body = JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8000,
        messages: [{ role: 'user', content: CLAUDE_PROMPT(instruction) }],
      });

      // 529 Overloaded 自動リトライ
      let res: Response | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body,
        });
        if (res.status !== 529) break;
        await new Promise(r => setTimeout(r, 3000));
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

      // コードブロックが含まれていたら除去
      const codeBlockMatch = code.match(/```(?:html|HTML)?\s*\n([\s\S]*?)```/);
      if (codeBlockMatch) {
        code = codeBlockMatch[1].trim();
      }

      // <!DOCTYPE html> より前のテキストを除去
      const doctypeIndex = code.indexOf('<!DOCTYPE');
      if (doctypeIndex > 0) {
        code = code.substring(doctypeIndex);
      }
      const doctypeLower = code.indexOf('<!doctype');
      if (doctypeLower > 0) {
        code = code.substring(doctypeLower);
      }

      return NextResponse.json({ code });
    }

    return NextResponse.json({ error: '無効なstep' }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
