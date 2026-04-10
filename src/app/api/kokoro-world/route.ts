import { NextRequest, NextResponse } from 'next/server';

const DEMO_TYPES: Record<string, string> = {
  landing: 'ランディングページ（サービス・プロダクト紹介ページ）',
  appui: 'アプリUIモック（アプリの画面イメージ）',
  slides: 'プレゼンスライド（インタラクティブなスライドデモ）',
  pitch: 'ピッチデッキ（投資家・クライアント向け）',
  auto: 'AIに任せる（企画書の内容から最適なタイプを判断）',
};

function buildSystem(strategyText: string, demoType: string): string {
  const typeName = DEMO_TYPES[demoType] ?? DEMO_TYPES.auto;

  return `あなたはKokoro OSの「World」エンジンです。
以下の企画書を読んで、動作するHTMLデモページを生成してください。

【企画書】
${strategyText}

【デモタイプ】
${typeName}

【指示】
・完全に動作するシングルファイルのHTMLを生成する
・外部ライブラリはCDN経由で読み込んでOK（Tailwind・Alpine.js・Chart.jsなど）
・企画書の内容・世界観・トーンを忠実に反映する
・実際に動くボタン・アニメーション・インタラクションを入れる
・モバイル対応（レスポンシブ）にする
・日本語対応（Noto Sans JPをGoogle Fontsから読み込む）
・企画書にない内容を勝手に追加しない
・コードブロックやmarkdownは使わない。HTMLのみを返す
・<!DOCTYPE html>から始まる完全なHTMLドキュメントを返す

デモタイプ別の指示：

ランディングページの場合：
・ヒーローセクション（キャッチコピー・サブコピー・CTAボタン）
・特徴・機能セクション（3〜4項目）
・シンプルなフッター
・スムーズスクロール・ホバーアニメーション

アプリUIモックの場合：
・実際のアプリ画面をイメージしたUI
・ナビゲーション・サイドバー・メインコンテンツエリア
・ダミーデータを使ったリアルな見た目
・クリックで画面遷移するインタラクション

プレゼンスライドの場合：
・矢印キーまたはボタンでスライドを切り替えられる
・企画書の構成（タイトル・課題・解決策・価値・一言・次のステップ）を反映
・各スライドにアニメーション

ピッチデッキの場合：
・投資家向けのクリーンでプロフェッショナルなデザイン
・問題・解決策・市場・チーム・数値・CTA の構成
・グラフ・図表を含む（Chart.jsなど使用可）

HTMLのみを返してください。説明文やコードブロックの囲みは不要です。`;
}

export async function POST(req: NextRequest) {
  try {
    const { strategyText, demoType } = await req.json();

    if (!strategyText) {
      return NextResponse.json({ error: '企画書データがありません' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });
    }

    const system = buildSystem(strategyText, demoType ?? 'auto');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        system,
        messages: [{ role: 'user', content: '企画書をもとにデモページを生成してください。HTMLのみを返してください。' }],
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      const message = err.error?.message || 'API error';
      if (res.status === 529 || /overloaded/i.test(message)) {
        return NextResponse.json({ error: message, overloaded: true }, { status: 529 });
      }
      throw new Error(message);
    }

    const data = await res.json();
    let raw = data.content[0].text as string;

    // コードブロック囲みがあれば除去
    raw = raw.replace(/^```html?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    return NextResponse.json({ html: raw });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
