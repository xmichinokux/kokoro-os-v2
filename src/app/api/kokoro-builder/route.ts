import { NextRequest, NextResponse } from 'next/server';

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

const NEXTJS_SYSTEM = (spec: string) => `あなたはKokoro OSのBuilderエンジンです。
以下の仕様書を読んで、Next.jsプロジェクトのファイル構成とコードを生成してください。

【仕様書】
${spec}

【ルール】
・Next.js 14 App Router構成
・TypeScript使用
・Tailwind CSS使用
・仕様書の機能を忠実に実装する
・小さく作る：まず最小限の動くものを作る
・各ファイルのパスとコードを明示する

以下のJSON形式で返してください：
{
  "files": [
    {
      "path": "src/app/page.tsx",
      "content": "コード内容"
    }
  ],
  "instructions": "セットアップ手順"
}`;

const REACT_SYSTEM = (spec: string) => `あなたはKokoro OSのBuilderエンジンです。
以下の仕様書を読んで、Reactコンポーネントを生成してください。

【仕様書】
${spec}

【ルール】
・関数コンポーネント + Hooks
・TypeScript使用
・props・stateを適切に設計する
・仕様書の機能を忠実に実装する

コンポーネントのコードのみを返してください。`;

const AUTO_SYSTEM = (spec: string) => `あなたはKokoro OSのBuilderエンジンです。
以下の仕様書を読んで、最適な形式でコードを生成してください。

【仕様書】
${spec}

【ルール】
・仕様書の内容から最適な実装形式を判断する
・シンプルなものはシングルHTMLで、複雑なものはNext.jsプロジェクトで生成する
・仕様書の機能を忠実に実装する
・仕様書にない機能を勝手に追加しない

シングルHTMLの場合：HTMLコードのみを返す（マークダウンのコードブロックは使わない）
Next.jsの場合：以下のJSON形式で返す
{
  "files": [{ "path": "ファイルパス", "content": "コード" }],
  "instructions": "セットアップ手順"
}`;

type BuildType = 'html' | 'nextjs' | 'react' | 'auto';

function getSystem(type: BuildType, spec: string): string {
  switch (type) {
    case 'html': return HTML_SYSTEM(spec);
    case 'nextjs': return NEXTJS_SYSTEM(spec);
    case 'react': return REACT_SYSTEM(spec);
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

    const system = getSystem(buildType || 'html', spec);

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
    const text = (data.content[0].text as string).trim();

    // レスポンスの種類を判定
    const jsonMatch = text.match(/^\s*\{[\s\S]*"files"\s*:\s*\[[\s\S]*\]\s*[\s\S]*\}\s*$/);
    if (jsonMatch) {
      // Next.jsプロジェクト形式
      const parsed = JSON.parse(text);
      return NextResponse.json({ type: 'project', files: parsed.files, instructions: parsed.instructions });
    }

    // シングルファイル（HTML or React）
    // コードブロックが含まれていたら除去
    let code = text;
    const codeBlockMatch = text.match(/```(?:html|tsx?|jsx?)?\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      code = codeBlockMatch[1].trim();
    }

    return NextResponse.json({ type: 'single', code });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
