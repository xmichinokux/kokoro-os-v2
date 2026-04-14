import { NextRequest, NextResponse } from 'next/server';

const HTML_SYSTEM = (spec: string) => `あなたはKokoro OSのBuilderエンジンです。
以下の仕様書を読んで、動作するシングルHTMLファイルを生成してください。

【仕様書】
${spec}

【ルール】
・完全に動作するシングルファイルのHTMLを生成する
・サーバーなしでブラウザで直接開いて動作すること
・外部ライブラリはすべてCDN経由で読み込む
・Phaser 3が必要な場合：<script src="https://cdn.jsdelivr.net/npm/phaser@3.55.2/dist/phaser.min.js"></script>
・Three.jsが必要な場合：<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
・Chart.jsが必要な場合：<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
・その他のライブラリもjsdelivr等のCDNから読み込む
・仕様書の機能を忠実に実装する
・仕様書にない機能を勝手に追加しない
・コメントを適切に入れる
・日本語対応（Noto Sans JPをGoogle Fontsから読み込む）
・モバイル対応（レスポンシブ）
・viewportメタタグを必ず含める

【Phaser 3を使う場合の必須設定】
・typeは必ずPhaser.CANVASを使用する（WEBGLはBlob URL環境で動作しない）
・parentでゲームを描画するdiv要素のIDを指定する
・document.readyStateを確認してからゲームを起動する：
  function startGame() {
    const config = {
      type: Phaser.CANVAS,
      parent: 'game-container',
      // ...その他の設定
    };
    new Phaser.Game(config);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startGame);
  } else {
    startGame();
  }

HTMLコードのみを返してください。
マークダウンのコードブロックは使わない。
<!DOCTYPE html>から始めてください。`;

const AUTO_SYSTEM = (spec: string) => `あなたはKokoro OSのBuilderエンジンです。
以下の仕様書を読んで、動作するシングルHTMLファイルを生成してください。
仕様書の内容に最適なライブラリを自動選択してください。

【仕様書】
${spec}

【ルール】
・完全に動作するシングルファイルのHTMLを生成する
・サーバーなしでブラウザで直接開いて動作すること
・外部ライブラリはすべてCDN経由で読み込む
・Phaser 3が必要な場合：<script src="https://cdn.jsdelivr.net/npm/phaser@3.55.2/dist/phaser.min.js"></script>
・Three.jsが必要な場合：<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
・Chart.jsが必要な場合：<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
・その他のライブラリもjsdelivr等のCDNから読み込む
・仕様書の機能を忠実に実装する
・仕様書にない機能を勝手に追加しない
・コメントを適切に入れる
・日本語対応（Noto Sans JPをGoogle Fontsから読み込む）
・モバイル対応（レスポンシブ）
・viewportメタタグを必ず含める

【Phaser 3を使う場合の必須設定】
・typeは必ずPhaser.CANVASを使用する（WEBGLはBlob URL環境で動作しない）
・parentでゲームを描画するdiv要素のIDを指定する
・document.readyStateを確認してからゲームを起動する：
  function startGame() {
    const config = {
      type: Phaser.CANVAS,
      parent: 'game-container',
      // ...その他の設定
    };
    new Phaser.Game(config);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startGame);
  } else {
    startGame();
  }

HTMLコードのみを返してください。
マークダウンのコードブロックは使わない。
<!DOCTYPE html>から始めてください。`;

type BuildType = 'html' | 'auto';

function getSystem(type: BuildType, spec: string): string {
  switch (type) {
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
