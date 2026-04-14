import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const INTEGRATE_PROMPT = (spec: string, allModules: string, integrationNotes: string) =>
  `あなたは優秀なソフトウェアアーキテクトです。
以下のモジュールを統合して、完全に動作するシングルHTMLファイルを生成してください。

【全体仕様書】
${spec}

【生成されたモジュール】
${allModules}

【統合の注意点】
${integrationNotes}

【ルール】
・HTMLコードのみを返す（説明文・マークダウン不要）
・<!DOCTYPE html>から始まる完全なHTMLを出力する
・全モジュールのコードを<script>タグ内に統合する
・外部ライブラリはCDN経由で読み込む
・動作確認済みの各モジュールを壊さないように統合する
・日本語対応（Noto Sans JPをGoogle Fontsから読み込む）
・モバイル対応（viewportメタタグ必須）
・Phaser 3を使う場合はtype: Phaser.CANVASを使用する
・document.readyStateを確認してから初期化する
・マークダウンのコードブロックは使わない
・<!DOCTYPE html>から始めてください`;

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 });
    }

    const { spec, modules, integrationNotes } = await req.json() as {
      spec: string;
      modules: { name: string; code: string }[];
      integrationNotes: string;
    };

    if (!spec || !modules || modules.length === 0) {
      return NextResponse.json({ error: '仕様書とモジュールが必要です' }, { status: 400 });
    }

    const allModules = modules
      .map((m, i) => `=== Module ${i + 1}: ${m.name} ===\n${m.code}`)
      .join('\n\n');

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(INTEGRATE_PROMPT(spec, allModules, integrationNotes || ''));
    let code = result.response.text().trim();

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
