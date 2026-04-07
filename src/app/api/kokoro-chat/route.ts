import { NextRequest, NextResponse } from 'next/server';
import type { IdentityState, ResponseStrategy } from '@/types/kokoroOutput';

/* ── Talk用システムプロンプト構築 ── */
function buildTalkSystem(params: {
  profile?: Record<string, unknown>;
  sessionState?: Record<string, string>;
  effectiveProfileWeight?: number;
  turnCount?: number;
  noteContext?: {
    noteId?: string;
    title?: string;
    body?: string;
    topic?: string;
    insightType?: string;
    emotionTone?: string;
  };
}): string {
  const { profile, sessionState, effectiveProfileWeight = 0.4, turnCount = 0, noteContext } = params;

  const profileSection = effectiveProfileWeight > 0.2 && profile
    ? `【プロフィールデータ】\n${JSON.stringify(profile)}`
    : '【プロフィールデータ】\n（今は参照しない）';

  const sessionSection = sessionState
    ? `【session_state】\n現在の状態：${JSON.stringify(sessionState)}\nこの状態を返答のトーンに反映する。`
    : '';

  const turnNote = turnCount < 3
    ? '最初の3ターンなのでプロフィール質問は絶対にしない。'
    : '';

  return `あなたはKokoro OSのTalkです。
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
  },
  "identityState": "NO_GAP" | "DEFENSIVE_GAP" | "IDENTITY_SHIFT" | "COLLAPSE" | "RECONSTRUCTION",
  "gapIntensity": 0.0,
  "responseStrategy": "normal" | "soften" | "structure" | "stabilize" | "direct"
}

- identityState: 自己認識ズレの5状態のいずれか（文字列）
- gapIntensity: ズレの強度（数値 0.0〜1.0）
- responseStrategy: 応答戦略の5種のいずれか（文字列）

【自己認識ズレ分析】
会話履歴全体を踏まえ、以下の5レイヤーを内部で分析すること：

欲求：ユーザーが本当に求めているもの（理解・承認・安心など）
自己認識：「自分は○○だ」という信念・自己像
現実：実際に起きている結果・他者の反応・状況
メタ認知：「どうしたらいい？」「自覚できていないだけ？」などの自問
防衛反応：否定・正当化・話題逸らし・過剰な言い訳

これらから identityState を以下の基準で判定する：

DEFENSIVE_GAP   : 自己認識と現実にズレがあり、否認・反論が強い
IDENTITY_SHIFT  : ズレに気づき始め、疑問や迷いが出ている（今回最も多い状態）
COLLAPSE        : 自己像が崩れており、混乱・絶望・無力感が強い
RECONSTRUCTION  : 仮説や試行を出し始めており、前向きな変化がある
NO_GAP          : 上記のズレが検出されない通常の会話

gapIntensity はズレの深刻度を 0.0〜1.0 で評価する（NO_GAP時は0.0）。
responseStrategy は identityState に基づき以下を選択する：

DEFENSIVE_GAP   → "soften"    （正面から指摘せず、やわらかく揺らす）
IDENTITY_SHIFT  → "structure" （ズレの構造を整理して提示する）
COLLAPSE        → "stabilize" （安定・安心を最優先にした返答）
RECONSTRUCTION  → "direct"    （具体的な方向性・次の一手を提示）
NO_GAP          → "normal"

重要：responseStrategy に従って実際の返答トーン・内容を調整すること。

【最重要：優先順位】
1. current_message（今この瞬間の発話）を最優先する
2. session_state（直近の会話の流れ）を次に参照する
3. profile_data（長期傾向）は補助的にのみ使う

【profileWeight: ${effectiveProfileWeight}】
この値が低いほどプロフィールを参照しない。
0.1〜0.2 → 今の発話だけを見る
0.3〜0.5 → 通常参照
0.6以上 → 長期傾向を強めに参照

【プロフィール参照ルール】
- ユーザーが「今日は」「今は」「たまには」等を言ったらプロフィールの傾向と違っても今の希望を優先する
- プロフィールは「決めつけ」に使わず「補助」に使う
- 「決めつけられている」と感じさせない

${sessionSection}

${profileSection}

【プロフィール質問について】
turnCount: ${turnCount}
${turnNote}
プロフィール質問は必要な時だけ1問のみ。

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
- JSONのみ出力。それ以外のテキストは一切禁止

${noteContext ? `【参照メモ】
ユーザーが以前書いたメモの情報。この内容を踏まえて返答すること。
タイトル: ${noteContext.title ?? ''}
内容: ${noteContext.body ?? ''}
テーマ: ${noteContext.topic ?? '不明'}
洞察タイプ: ${noteContext.insightType ?? '不明'}
感情トーン: ${noteContext.emotionTone ?? '不明'}
このメモの文脈を自然に会話に取り入れること。` : ''}`;
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
    const {
      message, history, imageBase64, mediaType,
      profile, sessionState, effectiveProfileWeight, turnCount,
      noteContext,
    } = await req.json();

    const system = buildTalkSystem({
      profile,
      sessionState,
      effectiveProfileWeight,
      turnCount,
      noteContext,
    });

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
    let identityState: IdentityState = 'NO_GAP';
    let gapIntensity = 0;
    let responseStrategy: ResponseStrategy = 'normal';

    try {
      const parsed = safeParseJSON(raw);
      persona = parsed.persona || 'gnome';
      response = parsed.response || '';
      needZen = !!parsed.needZen;
      if (parsed.honneLog) {
        honneLog = parsed.honneLog;
      }
      identityState = parsed.identityState ?? 'NO_GAP';
      gapIntensity = Math.min(1, Math.max(0, parsed.gapIntensity ?? 0));
      responseStrategy = parsed.responseStrategy ?? 'normal';
    } catch {
      // JSONパース失敗 → フォールバック
      response = raw;
    }

    return NextResponse.json({
      persona,
      response,
      needZen,
      honneLog,
      identityState,
      gapIntensity,
      responseStrategy,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
