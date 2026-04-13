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

function formatHistory(history: HistoryEntry[]): string {
  return history.map((h, i) => `Q${i + 1}: ${h.question}\n→ ${h.selected}`).join('\n\n');
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const { phase, input, strategyData, history, questionCount } = await req.json();

    let system: string;
    let userMessage: string;

    if (phase === 'start') {
      // フェーズ1: 最初の質問を生成
      system = QUESTION_SYSTEM;
      const context = strategyData
        ? `【Strategyデータ】\n${strategyData}\n\n【ユーザーの追加入力】\n${input || '（なし）'}`
        : input;
      userMessage = `以下の要求から最初の質問を生成してください：\n\n${context}`;
    } else if (phase === 'next') {
      // フェーズ2: 次の質問を生成
      system = QUESTION_SYSTEM;
      userMessage = `これまでの回答：\n\n${formatHistory(history)}\n\n現在${questionCount}問目です。次の質問を生成してください。`;
    } else if (phase === 'generate') {
      // フェーズ3: 仕様書を生成
      system = SPEC_SYSTEM;
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
