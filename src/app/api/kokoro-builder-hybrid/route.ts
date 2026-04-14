import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_PROMPT = (spec: string) => `あなたは優秀なソフトウェアアーキテクトです。
以下の仕様書を深く読んで、シングルHTMLファイルで実装するための
詳細な実装指示書を作成してください。

【仕様書】
${spec}

【出力形式】
以下の内容を含む実装指示書を作成してください：

1. 使用するライブラリ・CDN URL（具体的なバージョン付き）
2. HTML構造の詳細設計
3. 実装すべき関数・クラスの一覧と役割
4. 状態管理の設計（変数・データ構造）
5. イベント処理の設計
6. 実装の優先順位と注意点
7. よくあるバグとその回避方法

【制約】
・サーバーなしでブラウザで直接動作すること
・CDN経由で全ライブラリを読み込む
・モバイル対応（タッチ操作）
・シングルファイルで完結
・Phaser 3を使う場合はtype: Phaser.CANVASを指定（WebGLはBlob URL環境で動作しない）
・Phaser 3のCDN: https://cdn.jsdelivr.net/npm/phaser@3.55.2/dist/phaser.min.js`;

const CLAUDE_PROMPT = (instruction: string, spec: string) => `あなたは優秀なフロントエンドエンジニアです。
以下の実装指示書に従って、完全に動作するシングルHTMLファイルを生成してください。

【実装指示書】
${instruction}

【元の仕様書】
${spec}

【ルール】
・HTMLコードのみを返す（説明文・マークダウン不要）
・<!DOCTYPE html>から始めて</html>で終わる完全なHTMLを出力する
・外部ライブラリはすべて実装指示書で指定されたCDNから読み込む
・サーバーなしでブラウザで直接開いて動作すること
・日本語対応（Noto Sans JPをGoogle Fontsから読み込む）
・モバイル対応（レスポンシブ・viewportメタタグ必須）
・コメントを適切に入れる
・Phaser 3を使う場合はtype: Phaser.CANVASを必ず使用する
・document.readyStateを確認してから初期化する`;

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

    if (!spec && step === 'gemini') {
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
        messages: [{ role: 'user', content: CLAUDE_PROMPT(instruction, spec || '') }],
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
