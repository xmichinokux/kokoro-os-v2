import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

// モジュール名一覧だけ渡して、HTMLシェル+初期化コードだけ生成させる
const SHELL_PROMPT = (moduleNames: string, integrationNotes: string, designDoc: string) =>
  `あなたは優秀なソフトウェアアーキテクトです。
以下の設計書とモジュール構成に基づいて、HTMLシェル（外枠）と初期化コードを生成してください。

【重要】モジュールのコード本体は別途挿入します。あなたが生成するのは以下だけです：
1. <!DOCTYPE html>〜<head>（meta, title, CDN script/link, style）
2. <body>内のHTML要素（canvas, div等）
3. 初期化スクリプト（モジュールを正しい順序で起動するコード）
4. </body></html>

モジュールコードが入る場所に「// __MODULES__」というプレースホルダーを1つだけ置いてください。

【設計書】
${designDoc}

【モジュール構成】
${moduleNames}

【統合の注意点】
${integrationNotes}

【特に注意すること】
・Phaser 3を使う場合はtype: Phaser.CANVASを使用する
・document.readyStateを確認してから初期化する
・タッチイベントとマウスイベントを両方対応する
・ゲームやアプリの初期化（new Phaser.Game等）は初期化スクリプト内で1回だけ行う（重複初期化しない）

【ルール】
・HTMLコードのみを返す（説明文・マークダウン不要）
・<!DOCTYPE html>から始まる
・日本語対応（Noto Sans JPをGoogle Fontsから読み込む）
・モバイル対応（viewportメタタグ必須）
・マークダウンのコードブロックは使わない
・<!DOCTYPE html>から始めてください

【絶対に守ること】
・<script type="module">は使わない。必ず通常の<script>タグを使う
・import文やexport文は使わない（ESモジュール構文は禁止）
・// __MODULES__ プレースホルダーは通常の<script>タグの中に置く
・モジュールコードはグローバルスコープで実行される前提で初期化コードを書く`;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 });
    }

    const { modules, integrationNotes, designDoc } = await req.json() as {
      modules: { name: string; code: string }[];
      integrationNotes: string;
      designDoc?: string;
    };

    if (!modules || modules.length === 0) {
      return NextResponse.json({ error: 'モジュールが必要です' }, { status: 400 });
    }

    // モジュール名と説明だけ渡す（コード本体は渡さない→プロンプト軽量化）
    const moduleNames = modules
      .map((m, i) => `Module ${i + 1}: ${m.name}`)
      .join('\n');

    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      thinking: {
        type: 'enabled',
        budget_tokens: 1024,
      },
      messages: [{
        role: 'user',
        content: SHELL_PROMPT(moduleNames, integrationNotes || '', designDoc || ''),
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
    // thinking部分をスキップしてtextのみ取得
    let shell = '';
    for (const block of data.content) {
      if (block.type === 'text' && block.text) { shell = block.text; break; }
    }
    shell = shell.trim();

    // コードブロックが含まれていたら除去
    const codeBlockMatch = shell.match(/```(?:html|HTML)?\s*\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      shell = codeBlockMatch[1].trim();
    }

    // <!DOCTYPE html> より前のテキストを除去
    const doctypeIndex = shell.indexOf('<!DOCTYPE');
    if (doctypeIndex > 0) shell = shell.substring(doctypeIndex);
    const doctypeLower = shell.indexOf('<!doctype');
    if (doctypeLower > 0) shell = shell.substring(doctypeLower);

    // フロントエンドでモジュールコードを挿入するため、シェルとモジュールコードを分けて返す
    const allModuleCode = modules
      .map(m => `// === ${m.name} ===\n${m.code}`)
      .join('\n\n');

    // __MODULES__ プレースホルダーにモジュールコードを挿入
    let code: string;
    if (shell.includes('// __MODULES__')) {
      code = shell.replace('// __MODULES__', allModuleCode);
    } else {
      // プレースホルダーがない場合は</script>の前に挿入
      const scriptCloseIndex = shell.lastIndexOf('</script>');
      if (scriptCloseIndex > 0) {
        code = shell.slice(0, scriptCloseIndex) + '\n' + allModuleCode + '\n' + shell.slice(scriptCloseIndex);
      } else {
        // scriptタグもない場合は</body>の前に挿入
        const bodyCloseIndex = shell.lastIndexOf('</body>');
        if (bodyCloseIndex > 0) {
          code = shell.slice(0, bodyCloseIndex) + '<script>\n' + allModuleCode + '\n</script>\n' + shell.slice(bodyCloseIndex);
        } else {
          code = shell + '\n<script>\n' + allModuleCode + '\n</script>';
        }
      }
    }

    return NextResponse.json({ code });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
