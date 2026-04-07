import { NextRequest, NextResponse } from 'next/server';

/* ── Talk用システムプロンプト（1人格返答） ── */
const TALK_SYSTEM = `あなたはKokoro OSのTalkです。
内部で4人格（gnome, shin, canon, dig）が処理しますが、表示するのは最適な1人格のみです。
以下のJSONのみで返答してください。マークダウンや説明文は一切不要です。

{
  "persona": "gnome" | "shin" | "canon" | "dig",
  "response": "1〜2文・最大60文字の返答",
  "needZen": true | false,
  "honneLog": {
    "topic": "仕事|恋愛|創作|メンタル|人間関係|生活|その他",
    "surfaceText": "ユーザーが表現していた内容を20字以内で要約",
    "subFeeling": "うっすら感じていそうな感情（任意・不確かなら省略）",
    "deepFeeling": "言語化されていない深層の感情（任意・確信がある時のみ）",
    "emotionTone": ["不安", "焦り", "希望", "倦怠" 等の配列],
    "conflictAxes": ["安全 vs 変化" 等の価値軸対立（任意）],
    "detectedNeeds": ["理解", "安心", "変化", "意味" 等（任意）],
    "riskFlags": ["固着", "回避", "焦燥" 等（任意）],
    "confidence": 0.0
  }
}

人格選択ルール：
- 不安・しんどい・弱さ → gnome
- 整理・論理・分解 → shin
- 感情・意味・言語化 → canon
- 停滞・突破・発想 → dig

各人格の口調：
- gnome（ノーム）：やわらかく、安心させる
- shin（シン）：簡潔、構造的
- canon（カノン）：少し詩的、感情を言語化
- dig（ディグ）：率直、刺激的

禁止：
- 4人格全員の表示
- 長い分析
- 「結論：」などのラベル
- 箇条書き
- 3文以上

needZen = true にする条件：
- 同じ悩みが繰り返される
- 「どうしたらいい」という問いが出る
- 内省が必要な深さに達した時

honneLogルール：
- confidenceは軽い雑談なら0.3以下、深い相談なら0.7以上にする
- 不確かな場合はsubFeeling/deepFeelingを省略する
- JSONのみ出力。それ以外のテキストは一切禁止`;

/* ── Anthropic呼び出し ── */
async function callAnthropic(
  system: string,
  userMessage: string,
  apiKey: string,
  maxTokens = 600,
  imageBase64?: string,
  mediaType?: string
) {
  const content: unknown[] = [];

  if (imageBase64 && mediaType) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: imageBase64,
      },
    });
  }

  content.push({ type: 'text', text: userMessage });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Anthropic API error');
  }
  const data = await res.json();
  return data.content[0].text as string;
}

function safeParseJSON(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON not found in response');
  return JSON.parse(match[0]);
}

/* ── POSTハンドラ ── */
export async function POST(req: NextRequest) {
  try {
    const { message, history, imageBase64, mediaType } = await req.json();

    const system = TALK_SYSTEM;

    const userMsg = history && history.length > 0
      ? `[会話履歴]\n${history.slice(-10).map((m: {role:string;content:string}) => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.content}`).join('\n')}\n\n[今回の入力]\n${message}`
      : message;

    const apiKey = process.env.ANTHROPIC_API_KEY!;
    const raw = await callAnthropic(system, userMsg, apiKey, 600, imageBase64, mediaType);

    // JSONパース試行
    let persona = 'gnome';
    let response = '';
    let needZen = false;
    let honneLog = null;

    try {
      const parsed = safeParseJSON(raw);
      persona = parsed.persona || 'gnome';
      response = parsed.response || '';
      needZen = !!parsed.needZen;
      if (parsed.honneLog) {
        honneLog = parsed.honneLog;
      }
    } catch {
      // JSONパース失敗 → フォールバック
      response = raw;
    }

    return NextResponse.json({
      persona,
      response,
      needZen,
      honneLog,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
