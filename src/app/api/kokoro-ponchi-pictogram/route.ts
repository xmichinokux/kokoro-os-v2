import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const PICTOGRAM_SYSTEM = `あなたはピクトグラムSVGを生成する専門家です。与えられたスライドの主題を、シンプルでミニマルなピクトグラムSVGで表現してください。

【ルール】
・viewBoxは "0 0 100 100" に固定
・線は黒（#1a1a1a）、塗りは白または薄いグレー（#f3f4f6）またはアクセント紫（#7c3aed）のみ
・stroke-width: 2〜3
・フォントを使わない。テキスト要素(<text>)は禁止
・形状は5〜15個程度の<path>/<circle>/<rect>/<line>/<polygon>で構成
・抽象的・象徴的な表現。写実ではなくアイコン的
・余白を10%以上確保

【出力】
SVGコードのみ。<svg>〜</svg>で完結。マークダウンコードブロックは使わない。説明文は不要。`;

const buildUserPrompt = (title: string, body: string, type: string) => {
  const hint: Record<string, string> = {
    title: 'タイトルスライド。主題の核となるシンボル',
    problem: '課題・問題を象徴するシンボル（障害、悩み、亀裂など）',
    solution: '解決策を象徴するシンボル（橋、鍵、光など）',
    value: '価値・恩恵を象徴するシンボル（花、芽、星など）',
    key: '本質・核を象徴する幾何学的シンボル',
    next: '前進・行動を象徴するシンボル（矢印、足跡、扉など）',
  };
  return `スライドタイプ: ${type}（${hint[type] || '主題を象徴'}）
タイトル: ${title}
本文: ${body}

このスライドの主題を表すピクトグラムSVGを1つ生成してください。`;
};

function extractSvg(text: string): string {
  const match = text.match(/<svg[\s\S]*?<\/svg>/i);
  return match ? match[0] : '';
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const { title, body, type } = await req.json() as {
      title?: string; body?: string; type?: string;
    };

    if (!title) {
      return NextResponse.json({ error: 'title が必要です' }, { status: 400 });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: PICTOGRAM_SYSTEM,
        messages: [{ role: 'user', content: buildUserPrompt(title, body || '', type || 'title') }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return NextResponse.json({ error: `Anthropic error (${res.status}): ${errText.slice(0, 200)}` }, { status: 500 });
    }

    const data = await res.json();
    const raw = (data.content?.[0]?.text as string) || '';
    const svg = extractSvg(raw);
    if (!svg) {
      return NextResponse.json({ error: 'SVGの抽出に失敗しました' }, { status: 500 });
    }
    return NextResponse.json({ svg });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
