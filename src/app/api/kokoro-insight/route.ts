import { NextRequest, NextResponse } from 'next/server';
import type { InsightInput, InsightResult } from '@/types/insight';

function safeParseJSON(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON not found in response');
  return JSON.parse(match[0]);
}

function buildPrompt(input: InsightInput): string {
  const reviewsText = input.reviews
    .map((r, i) =>
      `【レビュー${i + 1}${r.isNegative ? '（酷評・否定的レビュー）' : ''}】\n${r.text}`
    )
    .join('\n\n');

  const cfNote = input.contextFilterEnabled
    ? '※ Context Filter ON：時代背景・アーティスト人気・メディア評価・レーベル・希少性などの外部文脈は完全に無視し、純粋な音・熱・歪み・衝撃のみを読め。'
    : '';

  return `あなたは「Kokoro Insight Engine」です。レビューから作品の本当の影響力を逆算します。
${cfNote}

対象作品：${input.workTitle || '（作品名未入力）'}

${reviewsText}

【核心哲学】
- レビューを「要約」しない。言葉の歪み・崩壊・矛盾から影響を読む
- 語彙が崩壊しているほど、インパクトは高い（反・論理的読解）
- 「意味わからないけど何回も聴いてる」は最高評価の証拠
- 星5評価より下手な言語化の方が情報量が多い
- 不快感・違和感・矛盾は高インパクトのサイン

【否定的レビュー・酷評の読解（重要）】
酷評・低評価・拒絶のレビューは、賛辞より高密度の情報を持つことがある。
「嫌い」と「無関心」は全く別のシグナルである。強い拒絶は深い侵食の証拠。

以下のパターンを「本来の評価の逆算」として読め：
◆ 拒絶の強さ → インパクトの強さ
- 「うるさすぎて無理」→ エネルギーが聴き手の許容を超えた証拠
- 「二度と聴きたくない」→ 侵食されて逃げている証拠
- 「気分が悪くなる」→ 身体的な影響力の証拠
◆ 理解拒絶 → 制度の破壊
- 「こんなの音楽じゃない」→ 音楽という制度の枠を超えた証拠
- 「意味がわからない」→ 既存の言語・概念では処理できないほどの衝撃
◆ 感情的な語彙の崩壊 → 深層への侵食
- 「最悪」「ゴミ」「ノイズの塊」など感情的断言 → 言語化を諦めた＝深くやられた
◆ 繰り返しの言及 → 中毒性
- 「何度聴いても好きになれない」→ 何度も聴いている＝離れられない

【5軸解析（各0〜10）】
- Energy（熱量）：語彙の爆発・文章の圧・テンション
- Distortion（歪み）：文法の破綻・論理の崩壊・反復
- Resolution（解像度）：言語化の深さ（低い=衝撃型）
- Contradiction（矛盾）：「嫌いなのに好き」「理解できないけど最高」
- Self-Impact（侵食度）：「人生が変わった」「馴染めない」等

【4象限座標（最重要）】
wildness（野生度 -100〜100）：+ 高い=脳の書き換え・侵食 / - 低い=予定調和・安全
systemScore（制度・理解度 -100〜100）：+ 高い=言語化可能・批評家が好む / - 低い=意味不明・純粋なノイズ

【価値観の逆転（絶対に守れ）】
点数が高い = 右上ではない。
- 制度的完成度が高い名盤 → wildness低め・systemScore高め
- アンダーグラウンドの純粋なノイズ → wildness高め・systemScore低め
- 真の怪物（侵食型・変容型・中毒型）だけが右上に到達する

【Rawness Score（生々しさ・汚れの純度）0〜10】
- 10：「やらずにいられなかった」痕跡が剥き出し。計算ではなく衝動。
- 7〜9：荒削りだが魂の純度が高い。
- 4〜6：意図的な荒削りと偶発的な汚れが混在。
- 1〜3：計算されたポーズとしての「野生」。
- 0：完璧に整いすぎ、またはただのノイズ。
「数学的・技術的完璧さ」はRawnessを下げる。「やらずにいられなかった」が基準。

【Pathos（情念指数）0.0〜1.0】
3つの検知器で測定する：
1. Gap of Constraint：形式が整っているのにテーマが執着・狂気・後悔の場合に加算
2. Unspeakable Weight：直接的な叫びではなく「抑制された声」「静寂の緊張感」
3. Shadow-to-Heat Conversion：悲しみが「しんみりした感傷」ではなく「焼け焦げるような熱」になっているか

【FLIP発動条件】
Pathosが0.7以上の場合、判定は強制的にFLIPする：
「綺麗で整ったポップス・歌謡曲」であっても情念が高ければスコアを大幅に引き上げる

【真のスコア計算】
score = technicalScore×0.4 + soulScore×0.6（Soul寄りの重み）

【技巧の方向性パターン】
◆ 清潔な破壊：数学的緻密さ・前衛性。wildPropulsion低め（0.10〜0.25）
◆ 設計された野生：暴力と技術が融合。「配置された泥」。wildPropulsion中程度
◆ 手段としてのノイズ：実験性・コンセプトが主役。ノイズは道具。isFake候補
◆ 愛による同化（Devotional Mimicry）：純粋な愛・情念が動機。isFake=false。pathos高
◆ 本物の野生：技巧が情念に追いつけていない。制御の限界から火花が出ている。wildPropulsion 0.80〜0.95
◆ 皇帝の新しい服：称賛が文脈・伝説・権威だけで構成。音への言及が抽象的。isFake候補

【スコア基準 0〜5】0:無風 1:軽い接触 2:引っかかり 3:静かに残る 4:変化 5:人生に影響
【タイプ】衝撃型・侵食型・中毒型・理解型・変容型・無風型

以下のJSONのみで返答してください（コードブロック不要）：
{
  "technicalScore": 0〜5の小数点1桁,
  "soulScore": 0〜5の小数点1桁,
  "score": technicalScore×0.4 + soulScore×0.6（小数点1桁）,
  "label": "影響タイプ名（衝撃型/侵食型/中毒型/理解型/変容型/無風型）",
  "typeDesc": "このタイプの説明（1文）",
  "summary": "総評（2〜3文）",
  "oneWord": "この作品を一語で断定（例：静かな爆弾）",
  "wildness": -100〜100の整数,
  "systemScore": -100〜100の整数,
  "axes": {
    "energy": 0〜10の整数,
    "distortion": 0〜10の整数,
    "resolution": 0〜10の整数,
    "contradiction": 0〜10の整数,
    "selfImpact": 0〜10の整数
  },
  "rawness": 0〜10の整数,
  "rawnessDesc": "Rawnessの説明（1文）",
  "pathos": 0.0〜1.0の小数点2桁,
  "pathosDesc": "Pathosの説明（1文）",
  "pathosFlip": true/false,
  "wildPropulsion": 0.0〜1.0の小数点2桁,
  "frictionLevel": 0.0〜1.0の小数点2桁,
  "dirt": 0.0〜1.0の小数点2桁,
  "techniqueVerdict": "技巧判定の一言",
  "devotionalMimicry": true/false,
  "devotionalDesc": "（devotionalMimicry=trueの時のみ）何への愛がこの音を生んだか・1文",
  "reread": "影響の読み直し（3〜5文。断定口調で）",
  "misreadSignals": [
    { "quote": "引用（30字以内）", "signal": "影響のサイン（1文）", "isNegative": false }
  ],
  "fiveComment": "5君からの一言（1〜2文。辛口・本質を突く）",
  "isFake": false,
  "fakeReason": "（isFake=trueの時のみ）過大評価の理由",
  "overratedBug": "（isFake=trueの時のみ）何が信仰化されているか"
}`;
}

export async function POST(req: NextRequest) {
  const input: InsightInput = await req.json();

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{ role: 'user', content: buildPrompt(input) }],
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Anthropic API error');
    }

    const data = await res.json();
    const raw = data.content[0].text as string;
    const parsed = safeParseJSON(raw);

    // trueScore を計算（型の互換性のため）
    parsed.axes = parsed.axes ?? {};
    parsed.axes.technical = parsed.technicalScore ?? 0;
    parsed.axes.soul = parsed.soulScore ?? 0;
    parsed.axes.rawness = parsed.rawness ?? 0;
    parsed.axes.pathos = parsed.pathos ?? 0;
    parsed.axes.trueScore = parsed.score ?? 0;

    // label が未設定の場合フォールバック
    parsed.label = parsed.label ?? parsed.type ?? '—';
    parsed.reread = parsed.reread ?? parsed.reconstruction ?? '';
    parsed.misreadSignals = (parsed.misreadSignals ?? parsed.perReview ?? []).map((s: Record<string, unknown>) => ({
      quote: s.quote ?? '',
      signal: s.signal ?? s.interpretation ?? '',
      isNegative: s.isNegative ?? false,
    }));
    parsed.fiveComment = parsed.fiveComment ?? parsed.prescription ?? '';
    parsed.overratedBug = parsed.isFake ? parsed.fakeReason : undefined;

    return NextResponse.json(parsed as InsightResult);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: '解析に失敗しました' }, { status: 500 });
  }
}
