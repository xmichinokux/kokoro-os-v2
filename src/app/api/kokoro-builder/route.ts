import { NextRequest, NextResponse } from 'next/server';

const KOKORO_PAGE_SYSTEM = (spec: string) => `あなたはKokoro OSのBuilderエンジンです。
以下の仕様書を読んで、Kokoro OSのNext.jsページとして動作するコンポーネントを生成してください。

【仕様書】
${spec}

【技術仕様】
・Next.js 14 App Router
・TypeScript
・Tailwind CSS
・必要なnpmパッケージはコメントで明記する（// npm install xxx）
・'use client'ディレクティブを適切に使用する
・Kokoro OSの既存スタイル（Space Mono・Noto Sans JP）に合わせる
・ファイルパス：src/app/kokoro-[機能名]/page.tsx

【ルール】
・1ファイルで完結させる（可能な限り）
・外部ライブラリはimport文で明記する
・コメントを適切に入れる
・仕様書の機能を忠実に実装する
・仕様書にない機能を勝手に追加しない

1行目にファイルパスをコメントで記載し、その後にコードを続けてください。
例: // src/app/kokoro-example/page.tsx
マークダウンのコードブロックは使わない。`;

const HTML_SYSTEM = (spec: string) => `あなたはKokoro OSのBuilderエンジンです。
以下の仕様書を読んで、動作するシングルHTMLファイルを生成してください。

【仕様書】
${spec}

【ルール】
・完全に動作するシングルファイルのHTMLを生成する
・外部ライブラリはCDN経由で読み込む
・仕様書の機能を忠実に実装する
・仕様書にない機能を勝手に追加しない
・コメントを適切に入れる
・日本語対応（Noto Sans JPをGoogle Fontsから読み込む）
・モバイル対応（レスポンシブ）

HTMLコードのみを返してください。
マークダウンのコードブロックは使わない。`;

const AUTO_SYSTEM = (spec: string) => `あなたはKokoro OSのBuilderエンジンです。
以下の仕様書を読んで、最適な形式でコードを生成してください。

【仕様書】
${spec}

【判断基準】
・Kokoro OS内で動かすもの → Next.jsページコンポーネント（1ファイル、'use client'）
・スタンドアロンで動かすもの → シングルHTML

Next.jsページの場合：
・1行目にファイルパスをコメントで記載（// src/app/kokoro-xxx/page.tsx）
・TypeScript + Tailwind CSS
・'use client'ディレクティブを使用

シングルHTMLの場合：
・完全に動作する1ファイルのHTML
・外部ライブラリはCDN経由

【ルール】
・仕様書の機能を忠実に実装する
・仕様書にない機能を勝手に追加しない
・マークダウンのコードブロックは使わない`;

type BuildType = 'kokoro' | 'html' | 'auto';

function getSystem(type: BuildType, spec: string): string {
  switch (type) {
    case 'kokoro': return KOKORO_PAGE_SYSTEM(spec);
    case 'html': return HTML_SYSTEM(spec);
    case 'auto': return AUTO_SYSTEM(spec);
  }
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const { spec, buildType } = await req.json() as { spec: string; buildType: BuildType };

    if (!spec) {
      return NextResponse.json({ error: '仕様書が必要です' }, { status: 400 });
    }

    const system = getSystem(buildType || 'kokoro', spec);

    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000,
      system,
      messages: [{ role: 'user', content: '仕様書に従ってコードを生成してください。' }],
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
      let errMsg = `API error (${res?.status ?? 'unknown'})`;
      try {
        const err = JSON.parse(errBody);
        errMsg = err.error?.message || errMsg;
      } catch { /* non-JSON */ }
      throw new Error(errMsg);
    }

    const data = await res.json();
    let text = (data.content[0].text as string).trim();

    // コードブロックが含まれていたら除去
    const codeBlockMatch = text.match(/```(?:html|tsx?|jsx?)?\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      text = codeBlockMatch[1].trim();
    }

    // ファイルパスを抽出（1行目のコメントから）
    const pathMatch = text.match(/^\/\/\s*(src\/app\/kokoro-[\w-]+\/page\.tsx)/);
    const filePath = pathMatch ? pathMatch[1] : null;

    return NextResponse.json({ type: 'single', code: text, filePath });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
