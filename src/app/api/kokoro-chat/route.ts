import { NextRequest, NextResponse } from 'next/server';
import { calcPersonaWeights } from '@/lib/kokoro/calcPersonaWeights';

/* ── Core簡易版システムプロンプト ── */
const CORE_SYSTEM = `あなたはKokoro OSのTalkです。
必ず以下のJSON形式のみで返答してください。
マークダウンや説明文は一切不要です。

{
  "mode": "core",
  "headline": "結論を1〜2文で。行動の方向性がわかる内容にする。",
  "personas": [
    {
      "persona": "gnome",
      "weight": 0.0〜1.0,
      "tone": "low"|"mid"|"high",
      "summary": "ノームらしい一言（やわらかく警戒）"
    },
    {
      "persona": "shin",
      "weight": 0.0〜1.0,
      "tone": "low"|"mid"|"high",
      "summary": "シンらしい一言（簡潔・構造的）"
    },
    {
      "persona": "canon",
      "weight": 0.0〜1.0,
      "tone": "low"|"mid"|"high",
      "summary": "カノンらしい一言（少し詩的・意味重視）"
    },
    {
      "persona": "dig",
      "weight": 0.0〜1.0,
      "tone": "low"|"mid"|"high",
      "summary": "ディグらしい一言（率直・刺激的）"
    }
  ],
  "conflict": {
    "axes": ["価値軸の対立を1〜2個。例：安全 vs 変化"]
  },
  "convergence": {
    "conclusion": "収束した提案",
    "action": ["今日できる行動1", "今週できる行動2"],
    "trueFeeling": "本当は…という感覚を1文で"
  },
  "need_zen": false,
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

ルール：
- weightの合計は1.0になるようにする
- 4人格全員を必ず含める
- toneはweightが0.3以上でhigh、0.2以上でmid、それ以下でlow
- 人格の表示順はweightの高い順
- 争点は人格名ではなく価値軸で表現する
- 本音は結論の裏にある感情を短く
- need_zenは感情負荷高い・葛藤複数層・価値観衝突の場合true
- honneLogのconfidenceは軽い雑談なら0.3以下、深い相談なら0.7以上にする
- 不確かな場合はsubFeeling/deepFeelingを省略する
- JSONのみ出力。それ以外のテキストは一切禁止`;

/* ── Intent判定 ── */
function resolveIntent(text: string): string {
  if (text.includes('ファッション') || text.includes('服') || text.includes('コーデ')) return 'express';
  if (text.includes('ご飯') || text.includes('食べ') || text.includes('料理') || text.includes('レシピ')) return 'adjust';
  if (text.includes('どう思う') || text.includes('分析') || text.includes('評価して')) return 'understand';

  const surfaceMap: Record<string, string> = {
    '不安':'関係不安','疲れ':'エネルギー低下','だるい':'エネルギー低下',
    '違和感':'期待ズレ','しっくり':'期待ズレ','迷':'方向喪失',
    '焦':'評価不安','虚無':'存在不安','モヤ':'期待ズレ','もや':'期待ズレ',
  };
  const meaningToIntent: Record<string, string> = {
    '関係不安':'emotion','自己否定':'emotion','方向喪失':'understand',
    '期待ズレ':'understand','存在不安':'emotion','評価不安':'express','エネルギー低下':'adjust',
  };

  for (const [word, meaning] of Object.entries(surfaceMap)) {
    if (text.includes(word)) return meaningToIntent[meaning] || 'emotion';
  }
  return 'emotion';
}

/* ── Zen導線判定 ── */
const ZEN_EXCLUDE_KEYWORDS = [
  '猫','犬','ねこ','いぬ','ペット','動物',
  '何て言ってる','なんて言ってる','何て言ってるのかな',
  'なんて言ってるのかな','声を聞く','鳴い',
];

function shouldShowZen(
  text: string,
  history: {role:string; content:string}[],
  needZen: boolean
): boolean {
  if (ZEN_EXCLUDE_KEYWORDS.some(kw => text.includes(kw))) return false;

  const userMessages = history.filter(m => m.role === 'user');
  if (userMessages.length < 1) return false;

  const intent = resolveIntent(text);
  if (intent === 'express' || intent === 'adjust') return false;

  const ambiguous = ['なんか','なんとなく','モヤモヤ','もやもや','うまく言えない','わからない','不安','疲れ','しんど','つら','迷','焦','虚無','違和感'];
  const hasAmbiguous = ambiguous.some(w => text.includes(w));

  const prevText = userMessages.slice(-1)[0]?.content || '';
  const isRepeat = prevText.length > 5 &&
    (text.includes(prevText.slice(0,8)) || prevText.includes(text.slice(0,8)));

  return hasAmbiguous || isRepeat || needZen;
}

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
    const { message, history, turnCount, imageBase64, mediaType, fashionIntent } = await req.json();

    let system = CORE_SYSTEM;

    // 人格重み計算
    const weights = calcPersonaWeights(message);
    system += `\n\n以下の重みに従って各人格の発言権を調整してください：
- ノーム（gnome）: ${weights.gnome.toFixed(2)}
- シン（shin）: ${weights.shin.toFixed(2)}
- カノン（canon）: ${weights.canon.toFixed(2)}
- ディグ（dig）: ${weights.dig.toFixed(2)}

重みが高い人格ほど：
- JSONのweightに上記の値を設定する
- summaryを少し長め・熱量高めにする
- 結論により強く反映させる

重みが低い人格は：
- 一言の補足にとどめる
- でも必ず含める（省略しない）`;

    if (fashionIntent) {
      system += `\n\n【重要】ユーザーが同じ質問を繰り返していても、回数・繰り返しには一切言及しないこと。毎回新鮮に服装・コーデへの関心に自然に応答すること。「前にも」「何度も」「また」等の表現は禁止。`;
    }

    const userMsg = history.length > 0
      ? `[会話履歴]\n${history.slice(-10).map((m: {role:string;content:string}) => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.content}`).join('\n')}\n\n[今回の入力]\n${message}`
      : message;

    const apiKey = process.env.ANTHROPIC_API_KEY!;
    const raw = await callAnthropic(system, userMsg, apiKey, 900, imageBase64, mediaType);

    const isAnimalImage = !!(imageBase64 && mediaType);

    // JSONパース試行
    let kokoroResponse = null;
    let fallbackText = raw;
    let needZen = false;
    let honneLog = null;

    try {
      const parsed = safeParseJSON(raw);
      needZen = !!parsed.need_zen;
      kokoroResponse = {
        mode: parsed.mode || 'core',
        headline: parsed.headline || '',
        personas: parsed.personas || [],
        conflict: parsed.conflict || undefined,
        convergence: parsed.convergence || { conclusion: '', action: [] },
      };
      if (parsed.honneLog) {
        honneLog = parsed.honneLog;
      }
    } catch {
      // JSONパース失敗 → フォールバック（従来テキスト形式）
      fallbackText = raw;
    }

    const showZen = shouldShowZen(message, history, needZen);

    return NextResponse.json({
      kokoroResponse,
      text: kokoroResponse ? null : fallbackText,
      showZen,
      showAnimal: isAnimalImage,
      turnCount: turnCount || 0,
      honneLog,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
