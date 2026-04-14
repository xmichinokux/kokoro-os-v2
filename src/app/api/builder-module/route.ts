import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const MODULE_PROMPT = (spec: string, moduleName: string, moduleDesc: string, moduleNotes: string, previousModules: string) =>
  `あなたは優秀なフロントエンドエンジニアです。
以下の仕様に従って、指定されたモジュールのJavaScriptコードを生成してください。

【全体仕様書】
${spec}

【モジュール情報】
名前：${moduleName}
説明：${moduleDesc}
実装の注意点：${moduleNotes}

${previousModules ? `【既存のモジュールコード】\n${previousModules}` : ''}

【ルール】
・このモジュールの担当部分のみを実装する
・他のモジュールとの接続部分はコメントで明記する
・グローバル変数・関数名は衝突しないようにプレフィックスをつける
・JavaScriptコードのみを返す（HTMLタグ不要）
・100〜200行程度に収める
・マークダウンのコードブロックは使わない
・コードのみを返す（説明文不要）`;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 });
    }

    const { spec, moduleName, moduleDescription, implementationNotes, previousModules } = await req.json() as {
      spec: string;
      moduleName: string;
      moduleDescription: string;
      implementationNotes: string;
      previousModules: string;
    };

    if (!spec || !moduleName) {
      return NextResponse.json({ error: '仕様書とモジュール名が必要です' }, { status: 400 });
    }

    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: MODULE_PROMPT(spec, moduleName, moduleDescription || '', implementationNotes || '', previousModules || ''),
      }],
    });

    // 529 Overloaded 自動リトライ
    let res: Response | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
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
    const codeBlockMatch = code.match(/```(?:javascript|js|JS)?\s*\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      code = codeBlockMatch[1].trim();
    }

    return NextResponse.json({ code });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
