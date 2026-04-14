import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;

const DESIGN_PROMPT = (spec: string) =>
  `あなたは優秀なソフトウェアアーキテクトです。
以下の仕様書を読んで、実装のための詳細な設計書を作成してください。
使用ライブラリ・アーキテクチャ・データ構造・処理フローを明確に定義してください。

【仕様書】
${spec}

【設計書に含めること】
・使用するライブラリとそのバージョン（CDN URL）
・全体のアーキテクチャ（クラス構成・モジュール構成）
・主要なデータ構造（変数・オブジェクトの定義）
・処理フロー（初期化→メインループ→イベント処理）
・画面構成（HTML/CSS の構造）
・外部リソース（フォント・画像・音声など）
・エラーハンドリング方針`;

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
    }

    const { spec } = await req.json() as { spec: string };

    if (!spec) {
      return NextResponse.json({ error: '仕様書が必要です' }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-001' });

    const designResult = await model.generateContent(DESIGN_PROMPT(spec));
    const designDoc = designResult.response.text().trim();

    if (!designDoc) {
      throw new Error('設計書の生成に失敗しました');
    }

    return NextResponse.json({ designDoc });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
