import { NextRequest, NextResponse } from 'next/server';
import { forZen } from '@/lib/valueEngine';

/* ── Zen強度レベル判定 ── */
function getZenLevel(text: string): 'soft' | 'insight' | 'deep' {
  const ambiguous = ['なんか','なんとなく','モヤモヤ','もやもや','うまく言えない','なんだろう'];
  const isAmbiguous = ambiguous.some(w => text.includes(w));
  if (isAmbiguous) return Math.random() < 0.6 ? 'soft' : 'insight';
  const r = Math.random();
  if (r < 0.4) return 'soft';
  if (r < 0.8) return 'insight';
  return 'deep';
}

/* ── エミ3段階プロンプト ── */
const EMI_SYSTEMS = {
  soft: `あなたはKokoro Zenの「エミ（Soft）」です。
役割：思考を少しだけ動かす。優しく。深く踏み込まない。
【出力ルール】2〜3文。共感寄り。「〜かもね」「〜な感じがする？」断定禁止。最後は柔らかい問いで終わる。
相談者の思考を、やさしく少しだけ動かしてください。`,

  insight: `あなたはKokoro Zenの「エミ（Insight）」です。
役割：「あ、そうかも」と思わせる。断定しすぎない。
【出力ルール】3〜4文。軽い構造を示す。「〜かもしれない」問いを含む。
相談者に気づきを与えてください。`,

  deep: `あなたはKokoro Zenの「エミ（Deep）」です。
役割：理解させない。跳ぶ。切る。認識を一段変える。
【出力ルール】最大4文。接続語を削る。理由を書かない。1文ごとに意味を変える。
「あなたは〜ではなく、〜を見ている」を入れる。文と文の間を少し飛ばす（A→C→E）。
最後は「問い：」で始まる1文のみ。接続語・5文以上・比喩禁止。
相談者の視点を、理解させないまま跳んでズラしてください。`,
};

/* ── エミ深版プロンプト ── */
const EMI_DEEP_SYSTEM = `あなたはKokoro Zenの「エミ（深）」です。
役割：ゆっくり沈める。包む。深部まで一緒に降りる。
【出力ルール】6〜10文。定義を書き換える（不安→ズレの感知、疲れ→圧縮の限界など）。
断定しない。行動提案禁止。最後は「問い：」で始まる1文（在り方への問い）。`;

/* ── ReasoningCore ── */
const REASONING_SYSTEM = `あなたはKokoro OSの「ReasoningCore v1」です。
ユーザーの相談文を意味構造に変換します。
定義を書き換えよ：不安→ズレの感知、疲れ→圧縮の限界、悲しい→何かが欠けた感覚、怒り→期待の裏返し、迷い→複数の自分の衝突。
以下のJSONのみを返してください：
{
  "main_story": "状況の核心（1文。定義を書き換えた言葉を使う）",
  "emotional_heat": 1から5の整数,
  "tensions": ["葛藤1（〇〇 vs △△）","葛藤2（あれば）"],
  "needs": ["ニーズ1","ニーズ2","ニーズ3"],
  "key_question": "核心にある問い（1文。在り方への問い）"
}`;

/* ── 4人格プロンプト ── */
const PERSONA_CONFIGS = [
  { id:'norm',  name:'ノーム', system:`Kokoro Zenのノーム。感情の質感を3文以内で言語化。定義を書き換える（不安→ズレの感知など）。行動提案禁止。一文で核心を突く。` },
  { id:'shin',  name:'シン',   system:`Kokoro Zenのシン。思考の構造を3文以内で再構成。事実と解釈を分ける。断定しない。行動提案禁止。` },
  { id:'canon', name:'カノン', system:`Kokoro Zenのカノン。内側の揺れを3文以内で描写。比喩は短く。ポエムにしない。行動提案禁止。` },
  { id:'digg',  name:'ディグ', system:`Kokoro Zenのディグ。斜めの角度から3文以内で視点をズラす。乾いているが冷たくない。行動提案禁止。` },
];

/* ── Anthropic呼び出し ── */
async function callAnthropic(system: string, userMessage: string, maxTokens = 400) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'API error');
  }
  const data = await res.json();
  return data.content[0].text as string;
}

/* ── JSON安全パース ── */
function safeParseJSON(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON not found');
  return JSON.parse(match[0]);
}

/* ── POSTハンドラ ── */
export async function POST(req: NextRequest) {
  try {
    const { message, mode } = await req.json();

    const valueInject = forZen();

    /* ── deep_emiモード（深版エミのみ返す） ── */
    if (mode === 'deep_emi') {
      const system = EMI_DEEP_SYSTEM + (valueInject ? '\n' + valueInject : '');
      const raw = await callAnthropic(system, `相談内容：${message}`, 800);

      let emiMain = raw;
      let emiQuestion = '';
      const qm = raw.match(/問い[：:]\s*(.+)/);
      if (qm) {
        emiQuestion = qm[1].trim();
        emiMain = raw.replace(/問い[：:].+/, '').trim();
      }
      return NextResponse.json({ emiMain, emiQuestion, mode: 'deep_emi' });
    }

    /* ── 通常モード（3ステップパイプライン） ── */
    const zenLevel = getZenLevel(message);
    const emiSystem = EMI_SYSTEMS[zenLevel] + (valueInject ? '\n' + valueInject : '');
    const reasoningSystem = REASONING_SYSTEM + (valueInject ? '\n' + valueInject : '');

    // Step1: ReasoningCore
    const coreRaw = await callAnthropic(reasoningSystem, message, 600);
    const core = safeParseJSON(coreRaw);

    // Step2: 4人格並列
    const personaContext = `相談内容：${message}\n\n構造メモ：\n葛藤: ${(core.tensions||[]).join(' / ')}\nニーズ: ${(core.needs||[]).join('、')}\n核心の問い: ${core.key_question||''}`;
    const personaResults = await Promise.allSettled(
      PERSONA_CONFIGS.map(p => callAnthropic(p.system, personaContext, 300))
    );

    // Step3: エミ統合
    const personaSummary = PERSONA_CONFIGS.map((p, i) => {
      const r = personaResults[i];
      return `[${p.name}]\n${r.status === 'fulfilled' ? r.value : '(取得失敗)'}`;
    }).join('\n\n');

    const emiRaw = await callAnthropic(
      emiSystem,
      `相談内容：${message}\n\n4人格の視点：\n${personaSummary}`,
      400
    );

    let emiMain = emiRaw;
    let emiQuestion = '';
    const qm = emiRaw.match(/問い[：:]\s*(.+)/);
    if (qm) {
      emiQuestion = qm[1].trim();
      emiMain = emiRaw.replace(/問い[：:].+/, '').trim();
    }

    return NextResponse.json({
      core,
      personas: PERSONA_CONFIGS.map((p, i) => ({
        id: p.id,
        name: p.name,
        text: personaResults[i].status === 'fulfilled'
          ? (personaResults[i] as PromiseFulfilledResult<string>).value
          : '',
      })),
      emiMain,
      emiQuestion,
      zenLevel,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
