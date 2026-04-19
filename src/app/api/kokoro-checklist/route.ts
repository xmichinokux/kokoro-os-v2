import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

type GenerateRequest = {
  mode: 'generate';
  sceneName: string;
};

type AddForgotRequest = {
  mode: 'add';
  sceneName: string;
  existingItems: string[];
  forgotItem: string;
};

type ChecklistRequest = GenerateRequest | AddForgotRequest;

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

async function callHaiku(apiKey: string, prompt: string, maxTokens: number): Promise<string> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    if (res.status === 529) throw new Error('overloaded');
    const errText = await res.text();
    throw new Error(`API error (${res.status}): ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

function extractJson<T = unknown>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY が設定されていません' }, { status: 500 });
    }

    const body = (await req.json()) as ChecklistRequest;

    if (body.mode === 'generate') {
      const prompt = `シーン: 「${body.sceneName}」

このシーンの「忘れ物チェックリスト」の下地を作ってください。

【設計方針】
- 項目数は 10〜15 個
- 一般的で外さない持ち物から、そのシーン固有の項目まで幅広く
- 完璧を目指さない。使う人が自分で育てる前提
- 各項目は 2〜10 字の短い名詞句で
- 重要度の高い順に並べる
- 「忘れがちだが致命的なもの」を 2〜3 個混ぜる

【重要】
- 使う人は ADHD などで自分でリストを作るのが苦手な前提
- なので過不足があっても良い。あとで育てられる

以下の JSON 形式のみで返してください（説明文不要）:
{
  "items": ["鍵", "財布", "スマホ", "..."]
}`;

      const raw = await callHaiku(apiKey, prompt, 800);
      const parsed = extractJson<{ items: string[] }>(raw);
      if (!parsed || !Array.isArray(parsed.items)) {
        return NextResponse.json({ items: [] });
      }
      return NextResponse.json({ items: parsed.items });
    }

    if (body.mode === 'add') {
      const existingText = body.existingItems.map((t, i) => `${i + 1}. ${t}`).join('\n');
      const prompt = `シーン: 「${body.sceneName}」
今日忘れたもの: 「${body.forgotItem}」

すでにリストにある項目:
${existingText}

【判断してほしいこと】
- 忘れたものが既存リストに「すでに含まれている」か「新規追加すべき」か
- 新規追加する場合、どの項目名でリストに追加するのが最適か
  （表記ゆれは既存の書き方に揃える / 一般化しすぎず具体化しすぎず）
- 「忘れた」という情報そのものが、既存項目のどれかを強調すべき合図になるか

以下の JSON 形式のみで返してください（説明文不要）:
{
  "action": "add" または "already_exists",
  "normalizedItem": "リストに追加する項目名（add の場合のみ）",
  "matchedExisting": "既にあった項目名（already_exists の場合のみ）"
}`;

      const raw = await callHaiku(apiKey, prompt, 400);
      const parsed = extractJson<{
        action: 'add' | 'already_exists';
        normalizedItem?: string;
        matchedExisting?: string;
      }>(raw);
      if (!parsed) {
        // 失敗時はそのまま追加
        return NextResponse.json({ action: 'add', normalizedItem: body.forgotItem });
      }
      return NextResponse.json(parsed);
    }

    return NextResponse.json({ error: 'unknown mode' }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg.includes('overloaded') ? 529 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
