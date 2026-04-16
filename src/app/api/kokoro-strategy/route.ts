import { NextRequest, NextResponse } from 'next/server';

const OUTPUT_TYPES: Record<string, string> = {
  proposal: '企画書',
  suggestion: '提案書',
  report: '報告書',
  presentation: 'プレゼン原稿',
  free: '自由（AIに任せる）',
};

function buildSystem(sourceText: string, outputType?: string): string {
  const typeName = OUTPUT_TYPES[outputType ?? 'free'] ?? OUTPUT_TYPES.free;

  return `あなたはKokoro OSの「Strategy」エンジンです。
以下の素材を読んで、一本の完成したドキュメントを生成してください。

【素材】
${sourceText}

【出力タイプ】
${typeName}

【指示】
・素材の内容を矛盾なく統合する
・出力タイプに合わせた構成・文体にする
・タイトル・リード文・本文・データ・まとめの流れで構成する
・素材にない内容を勝手に追加しない
・元の素材の意図・トーンを保持する

以下のHTMLクラスを使ってレイアウトしてください：
タイトル：      <h1 class="wt">タイトル</h1>
リード文：      <p class="wlead">リード文</p>
大見出し：      <h2 class="wh2">見出し</h2>
小見出し：      <h3 class="wh3">小見出し</h3>
通常段落：      <p class="wp">本文</p>
強調：          <strong class="wstrong">重要</strong>
箇条書き：      <ul class="wul"><li>項目</li></ul>
番号リスト：    <ol class="wol"><li>手順</li></ol>
区切り線：      <hr class="whr">
引用：          <blockquote class="wbq">引用</blockquote>

<edited>
<!-- 統合されたHTMLをここに -->
</edited>`;
}

export async function POST(req: NextRequest) {
  try {
    const { sourceText, writer, kami, ponchi, outputType } = await req.json();

    // 後方互換: writer/kami/ponchi が来た場合は結合
    let source = sourceText as string | undefined;
    if (!source) {
      const parts: string[] = [];
      if (writer) parts.push(`[Writer - 整理された文章]\n${writer}`);
      if (kami) parts.push(`[Kami - データ・表]\n${kami}`);
      if (ponchi) parts.push(`[Ponchi - スライド構成]\n${ponchi}`);
      source = parts.join('\n\n');
    }

    if (!source) {
      return NextResponse.json({ error: '素材がありません' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });
    }

    const system = buildSystem(source, outputType);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system,
        messages: [{ role: 'user', content: '素材を統合して、完成ドキュメントを生成してください。' }],
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
    const raw = data.content[0].text as string;

    return NextResponse.json({ result: raw });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
