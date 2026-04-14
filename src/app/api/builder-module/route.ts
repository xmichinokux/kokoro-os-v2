import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const MODULE_PROMPT = (spec: string, moduleName: string, moduleDesc: string, moduleNotes: string, previousModules: string, interfaceDoc: string) =>
  `あなたは優秀なフロントエンドエンジニアです。
以下の仕様に従って、指定されたモジュールのJavaScriptコードを生成してください。

【全体仕様書】
${spec}

${interfaceDoc ? `【★全モジュールのインターフェース定義★】\n以下はプロジェクト全体の設計図です。このモジュールで定義すべきクラス名・メソッド名はここに記載されています。\n他のモジュールのインターフェースも記載されていますが、まだ実装されていないモジュールのクラスは使用できません。\n\n${interfaceDoc}\n` : ''}
【モジュール情報】
名前：${moduleName}
説明：${moduleDesc}
実装の注意点：${moduleNotes}

${previousModules ? `【既存のモジュールコード（実装済み）】\n以下のコードは既に定義済みです。このコード内のクラス名・関数名だけが使用可能です。\n${previousModules}` : '【既存のモジュールコード】\nまだ何も定義されていません。全て自分で定義してください。'}

【ルール】
・このモジュールの担当部分のみを実装する
・グローバル変数・関数名は衝突しないようにプレフィックスをつける
・JavaScriptコードのみを返す（HTMLタグ不要）
・100〜200行程度に収める
・マークダウンのコードブロックは使わない
・コードのみを返す（説明文不要）

【絶対に守ること（違反したらコードが動かなくなります）】
・export文やimport文は絶対に使わない（ESモジュール構文は禁止。インラインscriptで実行されるため）
・全てのクラス・関数・変数はグローバルスコープで定義する
・★最重要★ 既存モジュールコードに存在しないクラス・関数・変数は絶対に参照しない。「new SomeManager(this)」のように未定義のクラスをnewしてはいけない。必要なクラスは必ずこのモジュール内で定義する
・既存モジュールのクラスを継承する場合、既存コードのクラス名を正確にコピーして使う（例：EnemyクラスがSGEnemyという名前なら「extends SGEnemy」と書く）
・既存モジュールで定義済みのクラスを再定義しない
・ゲームやアプリの初期化（new Phaser.Game等）はこのモジュールでは行わない（初期化は統合時に行う）
・Phaserのシーンクラスのconstructor内でsuper({ key: 'シーン名' })を必ず呼ぶ
・アセットファイル（画像・音声）は存在しない前提で書く。this.load.image()等は使わず、代わりにthis.add.rectangle()やthis.add.circle()等のプリミティブ描画で代替する`;

// レスポンスのcontent配列からtextを抽出（thinking部分をスキップ）
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

    const { spec, moduleName, moduleDescription, implementationNotes, previousModules, interfaceDoc } = await req.json() as {
      spec: string;
      moduleName: string;
      moduleDescription: string;
      implementationNotes: string;
      previousModules: string;
      interfaceDoc?: string;
    };

    if (!spec || !moduleName) {
      return NextResponse.json({ error: '仕様書とモジュール名が必要です' }, { status: 400 });
    }

    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      thinking: {
        type: 'enabled',
        budget_tokens: 1024,
      },
      messages: [{
        role: 'user',
        content: MODULE_PROMPT(spec, moduleName, moduleDescription || '', implementationNotes || '', previousModules || '', interfaceDoc || ''),
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
      const waitMs = Math.min(3000 * Math.pow(1.5, attempt), 15000); // 3s, 4.5s, 6.75s, ... max 15s
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
    let code = extractText(data.content).trim();

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
