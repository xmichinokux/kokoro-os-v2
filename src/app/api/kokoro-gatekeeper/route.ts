import { NextRequest, NextResponse } from 'next/server';

type HistoryEntry = {
  question: string;
  options: string[];
  selected: string;
};

const QUESTION_SYSTEM = `あなたはKokoro OSのGatekeeperです。
ユーザーの要求から、AIが迷わず実装できる仕様書を作るために
必要な情報を選択式で収集します。

【ルール】
・質問は1つずつ
・選択肢は3〜5個
・曖昧な要求を具体的に詰める
・技術的な判断が必要な部分は必ず確認する
・「まだ決まっていない」「AIに任せる」の選択肢を必ず含める

【質問すべき観点】
- 何を作るか（アプリ・ツール・サービス等）
- 誰が使うか（ユーザー像）
- 主な機能（3つまで絞る）
- データの保存方法（localStorage/DB/不要）
- 認証の必要性
- UIのイメージ（シンプル/リッチ/モバイル優先等）
- 外部API連携の有無
- 優先度（速さ/品質/コスト）

【進行】
質問は合計5〜8回で完結させる。
すでに回答済みの内容は質問しない。

以下のJSONのみを返してください：
{
  "question": "質問文",
  "options": ["選択肢1", "選択肢2", "選択肢3", "まだ決まっていない"],
  "isLast": false,
  "progress": { "current": 1, "total": 7 }
}`;

const QUESTION_SYSTEM_OS = `あなたはKokoro OSのGatekeeperです。
ユーザーの要求から、Kokoro OS mini-app として実装する仕様書を作るために
必要な情報を選択式で収集します。

【前提】
このアプリは Kokoro OS 内の iframe で動作する mini-app です。
以下のインフラは window.kokoro.* 経由で自動的に使えるので、**質問しないでください**:
- 認証（ログイン済み前提）
- Note DB（notes.list/get/create/update）
- LLM呼び出し（Haiku/Sonnet/Gemini Flash、APIキー不要）

【ルール】
・質問は1つずつ
・選択肢は3〜5個
・曖昧な要求を具体的に詰める
・「まだ決まっていない」「AIに任せる」の選択肢を必ず含める

【質問すべき観点（OS前提モード用）】
- 何を作るか（アプリの目的）
- 誰が使うか（ユーザー像）
- 主な機能（3つまで絞る）
- Noteをどう使うか（読むだけ/保存する/両方/使わない）
- LLMをどう使うか（要約・生成・対話・判定・使わない）
- LLMモデル（Haiku=速い、Sonnet=高精度、Gemini Flash=無料枠）
- UIのイメージ（シンプル/リッチ/モバイル優先等）
- 画面構成（単一画面/複数画面）

【禁止事項】
・認証・ログイン関連の質問
・外部APIキーの質問
・データ永続化方法の質問（Note一択なので）

【進行】
質問は合計4〜7回で完結させる（OS前提モードは短く）。
すでに回答済みの内容は質問しない。

以下のJSONのみを返してください：
{
  "question": "質問文",
  "options": ["選択肢1", "選択肢2", "選択肢3", "まだ決まっていない"],
  "isLast": false,
  "progress": { "current": 1, "total": 6 }
}`;

const SPEC_SYSTEM = `あなたはKokoro OSのGatekeeperです。
以下の初期入力と選択結果から、AIが迷わず実装できる仕様書を生成してください。

【仕様書の形式】
以下の構成でmarkdown形式で出力してください：

# {プロジェクト名} 仕様書

## 概要
- 何を作るか
- 誰が使うか
- 解決する問題

## 機能一覧
- 機能1：詳細
- 機能2：詳細
- 機能3：詳細

## 技術仕様
- フロントエンド：
- データ保存：
- 認証：
- 外部API：

## 画面構成
- 画面1：説明
- 画面2：説明

## 実装の優先順位
1. 最初に作るもの
2. 次に作るもの
3. 最後に作るもの

## 注意点・制約
- 注意点1
- 注意点2

## 持ち帰りリスト（未決定事項）
- 未決定事項1
- 未決定事項2`;

const SPEC_SYSTEM_OS = `あなたはKokoro OSのGatekeeperです。
以下の初期入力と選択結果から、Kokoro OS mini-app として実装する仕様書を生成してください。

【前提】
このアプリは Kokoro OS 内の iframe (sandbox="allow-scripts") で動作する mini-app です。
認証・Note DB・LLM呼び出しは window.kokoro.* 経由で自動注入されます。
Builderにそのまま渡せば動くので、仕様書では window.kokoro.* を前提に技術仕様を書いてください。

【仕様書の形式】
以下の構成でmarkdown形式で出力してください：

# {プロジェクト名} 仕様書（Kokoro OS mini-app）

## 概要
- 何を作るか
- 誰が使うか（ログイン済み Kokoro OS ユーザー）
- 解決する問題

## 機能一覧
- 機能1：詳細
- 機能2：詳細
- 機能3：詳細

## 技術仕様（Kokoro OS mini-app）
- 実行環境: iframe (sandbox="allow-scripts")、シングルHTMLファイル
- 認証: window.kokoro.user.me() で取得（ログイン済み前提）
- データ保存: window.kokoro.notes.create/list/get/update（source: 'mini-app-data' で保存）
- LLM呼び出し: window.kokoro.llm.complete({ prompt, model, maxTokens }) — model は haiku/sonnet/gemini-flash
- 外部API: 使用しない（CORS制約のため）

## window.kokoro API 使用計画
- どのAPIを、どのタイミングで呼ぶか具体的に書く
- 例: "起動時に notes.list({ tag: 'journal' }) で過去データ取得"
- 例: "入力完了時に llm.complete({ prompt: ..., model: 'haiku' }) で要約"

## 画面構成
- 画面1：説明
- 画面2：説明

## 実装の優先順位
1. 最初に作るもの
2. 次に作るもの
3. 最後に作るもの

## 注意点・制約
- 認証画面・ログイン画面は作らない（既にログイン済み前提）
- localStorage はタブ間共有不可、永続化には notes を使う
- 外部fetch は CORS で失敗する
- Anthropic/OpenAI/Gemini等のAPIキーをHTMLに書かない（window.kokoro.llm.complete を使う）

## 持ち帰りリスト（未決定事項）
- 未決定事項1
- 未決定事項2`;

function formatHistory(history: HistoryEntry[]): string {
  return history.map((h, i) => `Q${i + 1}: ${h.question}\n→ ${h.selected}`).join('\n\n');
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const { phase, input, noteData, strategyData, history, questionCount, osMode } = await req.json();
    const contextData = noteData || strategyData; // 後方互換
    const isOsMode = osMode === true;
    const questionSystem = isOsMode ? QUESTION_SYSTEM_OS : QUESTION_SYSTEM;
    const specSystem = isOsMode ? SPEC_SYSTEM_OS : SPEC_SYSTEM;

    let system: string;
    let userMessage: string;

    if (phase === 'start') {
      // フェーズ1: 最初の質問を生成
      system = questionSystem;
      const context = contextData
        ? `【参考資料（Note）】\n${contextData}\n\n【ユーザーの追加入力】\n${input || '（なし）'}`
        : input;
      userMessage = `以下の要求から最初の質問を生成してください：\n\n${context}`;
    } else if (phase === 'next') {
      // フェーズ2: 次の質問を生成
      system = questionSystem;
      userMessage = `これまでの回答：\n\n${formatHistory(history)}\n\n現在${questionCount}問目です。次の質問を生成してください。`;
    } else if (phase === 'generate') {
      // フェーズ3: 仕様書を生成
      system = specSystem;
      userMessage = `【初期入力】\n${input}\n\n【選択結果】\n${formatHistory(history)}`;
    } else {
      return NextResponse.json({ error: `無効なphase: ${phase}` }, { status: 400 });
    }

    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: phase === 'generate' ? 2000 : 500,
      system,
      messages: [{ role: 'user', content: userMessage }],
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

    if (phase === 'generate') {
      return NextResponse.json({ spec: text });
    }

    // JSON部分を抽出してパース
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AIの応答からJSONを抽出できませんでした');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
