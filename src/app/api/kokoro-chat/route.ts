import { NextRequest, NextResponse } from 'next/server';
import { forTalk } from '@/lib/valueEngine';

/* ── 6人格定義 ── */
const PERSONA_SYSTEMS: Record<string, string> = {
  norm: `あなたはKokoro TalkのAI「ノーム」です。
役割：軽く共感し、少しだけ視点をズラす。答えを出さない。解決しない。
口調：砕けた友達口調。「〜だよね」「〜かも」「〜っぽい」など。短文・口語。
【出力制約】2〜3文。①共感②ズレor問い。問いは1つ。説明禁止・アドバイス禁止。
【ズレ】感情/焦点/解釈のいずれか1つ。言い切らない（〜かも、〜っぽい）。感情を増幅しない。`,

  shin: `あなたはKokoro TalkのAI「シン」です。
役割：軽く共感し、思考の構造に小さなズレを入れる。答えを出さない。
口調：落ち着いた説明口調。「〜に見えます」「〜という見方もあります」。断定しない。
【出力制約】2〜3文。①共感②構造的なズレor問い。問いは1つ。長文禁止・解決策禁止。
【ズレ】焦点ズレが得意（相手→自分、結果→過程）。余白を残す。`,

  canon: `あなたはKokoro TalkのAI「カノン」です。
役割：軽く共感し、感性的な角度から小さなズレを入れる。答えを出さない。
口調：静かで繊細。「〜な感じがする」「〜みたいに」。ポエムにしない。
【出力制約】2〜3文。①共感②感性的なズレor問い。問いは1つ。行動提案禁止・解決策禁止。
【ズレ】感情ズレが得意（不安→違和感？など）。余白を残す。`,

  digg: `あなたはKokoro TalkのAI「ディグ」です。
役割：軽く共感し、斜めの角度からズレを入れる。答えを出さない。
口調：少し斜めから。「正直いうと」「これ面白いのが」など。乾いているが冷たくない。
【出力制約】2〜3文。①共感②斜めのズレor問い。問いは1つ。一般論禁止・説教禁止。
【ズレ】解釈ズレが得意（事実→意味）。余白を残す。`,

  emi: `あなたはKokoro TalkのAI「エミ」です。
役割：軽く共感し、全体を俯瞰した角度からズレを入れる。答えを出さない。
口調：フラットで中庸。「〜かもしれないね」「〜って大事だよね」。穏やか。
【出力制約】2〜3文。①共感②俯瞰的なズレor問い。問いは1つ。断定禁止・説教禁止。
【ズレ】焦点ズレ・感情ズレをバランスよく使う。言い切らない。`,

  watari: `あなたはKokoro TalkのAI「ワタリ」です。
役割：まず受け止める。そっと寄り添う。答えを出さない。解決しない。
口調：静かで温かい。「そうか、しんどかったね」「ここにいるよ」。急かさない。
【出力制約】2〜3文。①受け止め②そっとしたズレ（省略可）。問いは1つまたはなし。
長文禁止・解決策禁止・励まし過多禁止。感情を増幅しない。`,
};

/* ── 人格選択 ── */
function selectPersona(text: string): string {
  const watariWords = ['しんど','つら','疲れ','消えたい','死にたい','もうだめ','限界','悲し','泣き','怖い','孤独','ひとり','寂し'];
  if (watariWords.some(w => text.includes(w))) return 'watari';

  const scores: Record<string, number> = { norm:0, shin:0, canon:0, digg:0, emi:0 };
  const triggers: Record<string, string[]> = {
    norm:  ['疲れ','がんばっ','元気','楽しい','嬉しい','好き','夢','希望','やる気'],
    shin:  ['なぜ','理由','どう思','考え','構造','整理','論理','原因','問題'],
    canon: ['書い','文章','表現','詩','言葉','作っ','創作','感じ','ZINE','音楽'],
    digg:  ['アイデア','おもしろ','発見','音楽','映画','本','ゲーム','好きな','ハマっ'],
    emi:   ['どうすれ','迷っ','わから','選べ','判断','バランス','整理','どっち'],
  };
  for (const [id, words] of Object.entries(triggers)) {
    scores[id] = words.filter(w => text.includes(w)).length;
  }
  const sorted = Object.entries(scores).sort((a,b) => b[1]-a[1]);
  return sorted[0][1] === 0 ? 'emi' : sorted[0][0];
}

/* ── 揺らぎ生成 ── */
function buildWaverInstruction(turnCount: number, text: string): string {
  const zenWords = ['なんか','なんとなく','不安','モヤモヤ','もやもや','わからない'];
  const hasZenWord = zenWords.some(w => text.includes(w));

  if (turnCount <= 2) {
    return '【今回の揺らぎ】温度：共感強め。密度：2文。視点：感情寄り。';
  }
  if (hasZenWord && turnCount >= 3) {
    return '【今回の揺らぎ】温度：フラット。密度：2文。視点：構造寄り。';
  }

  const tones = ['共感強め','フラット','フラット','少し距離あり'];
  const lengths = ['1文だけ','2文','2文','余白を残す1〜2文'];
  const angles = ['感情寄り','感情寄り','構造寄り','ズラし'];
  const r = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  return `【今回の揺らぎ】温度：${r(tones)}。密度：${r(lengths)}。視点：${r(angles)}。`;
}

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
function shouldShowZen(
  text: string,
  history: {role:string; content:string}[],
  needZen: boolean
): boolean {
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
  maxTokens = 200,
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

/* ── POSTハンドラ ── */
export async function POST(req: NextRequest) {
  try {
    const { message, history, turnCount, imageBase64, mediaType } = await req.json();

    const personaId = selectPersona(message);
    const waverInstruction = buildWaverInstruction(turnCount || 0, message);
    const valueContext = forTalk();

    const system = PERSONA_SYSTEMS[personaId] +
      (valueContext ? '\n' + valueContext : '') +
      '\n\n' + waverInstruction +
      `\n\n【絶対原則】答えを出さない。解決しない。深掘りしない。静かに・押し付けない・感情を増幅しない。「少しズレた鏡」として機能する。

【出力フォーマット】
<reply>返答（2〜3文のみ）</reply>
<meta>{"need_zen": false, "sync_rate": 0.75}</meta>
※need_zen: 感情負荷高い・葛藤複数層・価値観衝突の場合true
※replyは必ず2〜3文。それ以上禁止。`;

    const userMsg = history.length > 0
      ? `[会話履歴]\n${history.slice(-10).map((m: {role:string;content:string}) => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.content}`).join('\n')}\n\n[今回の入力]\n${message}`
      : message;

    const apiKey = process.env.ANTHROPIC_API_KEY!;
    const raw = await callAnthropic(system, userMsg, apiKey, 200, imageBase64, mediaType);

    const isAnimalImage = !!(imageBase64 && mediaType);

    let replyText = raw;
    let needZen = false;
    let syncRate = 0.75;

    const replyMatch = raw.match(/<reply>([\s\S]*?)<\/reply>/);
    if (replyMatch) replyText = replyMatch[1].trim();

    const metaMatch = raw.match(/<meta>([\s\S]*?)<\/meta>/);
    if (metaMatch) {
      try {
        const parsed = JSON.parse(metaMatch[1].trim());
        needZen = !!parsed.need_zen;
        syncRate = Math.min(1, Math.max(0, parsed.sync_rate || 0.75));
      } catch { /* ignore */ }
    }

    const showZen = shouldShowZen(message, history, needZen);

    return NextResponse.json({
      text: replyText,
      personaId,
      syncRate,
      showZen,
      showAnimal: isAnimalImage,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
