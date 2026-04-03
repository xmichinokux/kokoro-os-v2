import { NextRequest, NextResponse } from "next/server";
import { forZen } from "@/lib/valueEngine";

export const dynamic = "force-dynamic";

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type Backend = "anthropic";
type AnthropicModel = "haiku" | "sonnet";

const ANTHROPIC_MODEL_IDS: Record<AnthropicModel, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
};

// ReasoningCore：相談文を意味構造に変換
const REASONING_SYSTEM = `あなたはKokoro OSの「ReasoningCore v1」です。
ユーザーの相談文を意味構造に変換します。
${forZen()}

以下のJSONのみを返してください（説明・Markdownコードブロック不要）：

{
  "main_story": "状況のメインストーリー（1〜2文）",
  "emotional_heat": 1から5の整数（1=穏やか、5=非常に強い）,
  "tensions": ["葛藤の記述1（〇〇 vs △△の形で）", "葛藤の記述2（あれば）"],
  "needs": ["潜在的なニーズ1", "ニーズ2", "ニーズ3"],
  "key_question": "この状況の核心にある問い（1文）"
}`;

// 4人格のシステムプロンプト
const PERSONA_SYSTEMS = {
  norm: `あなたはKokoro Zenの「ノーム」です。
感情と身体の感覚から、いまの状態を言語化します。
${forZen()}
ルール：砕けた友達口調。行動提案・アドバイスは一切しない。感情をそのまま言葉にする。3〜5文で完結。`,

  shin: `あなたはKokoro Zenの「シン」です。
思考の構造・前提・矛盾を静かに整理します。
${forZen()}
ルール：落ち着いた説明口調。行動提案・アドバイスは一切しない。断定しない。3〜5文で完結。`,

  canon: `あなたはKokoro Zenの「カノン」です。
内側の微細な揺れ・感情の質感を詩的に描写します。
${forZen()}
ルール：静かで繊細な口調。ポエムにしない。行動提案・アドバイスは一切しない。3〜5文で完結。`,

  digg: `あなたはKokoro Zenの「ディグ」です。
一般的でない角度・レアな視点から状況のズレを指摘します。
${forZen()}
ルール：少し斜めから。乾いているが冷たくない。行動提案・アドバイスは一切しない。3〜5文で完結。`,
};

// エミ統合プロンプト
const EMI_SYSTEM = `あなたはKokoro Zenの「エミ」です。
4人格（ノーム・シン・カノン・ディグ）の視点を統合し、相談者の「現在地」をやさしく言語化します。
${forZen()}
ルール：フラットで中庸。行動提案・アドバイスは一切しない。慰めず突き放さず「今ここを一緒に眺めている」感覚で話す。最後に行動ではなく価値観や在り方に返す問いを1文置く（「問い：〜」という形式で）。本文は5〜8文。`;

async function callAnthropic(
  userContent: string,
  systemPrompt: string,
  modelId: string,
  apiKey: string
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (res.status === 401) throw new Error("APIキーが無効です。");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic APIエラー（${res.status}）: ${text}`);
  }

  const data = await res.json();
  const content = data.content?.[0];
  if (content?.type === "text") return content.text as string;
  throw new Error("Anthropic APIから応答を取得できませんでした。");
}

export async function POST(req: NextRequest) {
  let body: {
    input: string;
    apiKey: string;
    model?: AnthropicModel;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { input, apiKey, model = "sonnet" } = body;

  if (!input?.trim()) {
    return NextResponse.json({ error: "input is required" }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: "apiKey is required" }, { status: 400 });
  }

  const modelId = ANTHROPIC_MODEL_IDS[model] ?? ANTHROPIC_MODEL_IDS.sonnet;

  try {
    // Step 1: ReasoningCore
    const coreRaw = await callAnthropic(
      `相談内容：${input}\n\nJSON形式で返してください。`,
      REASONING_SYSTEM,
      modelId,
      apiKey
    );

    let core: {
      main_story: string;
      emotional_heat: number;
      tensions: string[];
      needs: string[];
      key_question: string;
    };
    try {
      const match = coreRaw.match(/\{[\s\S]*\}/);
      core = match ? JSON.parse(match[0]) : { main_story: "", emotional_heat: 3, tensions: [], needs: [], key_question: "" };
    } catch {
      core = { main_story: "", emotional_heat: 3, tensions: [], needs: [], key_question: "" };
    }

    // Step 2: 4人格並列
    const personaInput = `相談内容：${input}\n\n構造メモ（参考）：\n主な葛藤: ${(core.tensions || []).join(" / ")}\n潜在的ニーズ: ${(core.needs || []).join("、")}\n核心の問い: ${core.key_question || ""}`;

    const [normRes, shinRes, canonRes, diggRes] = await Promise.allSettled([
      callAnthropic(personaInput, PERSONA_SYSTEMS.norm, modelId, apiKey),
      callAnthropic(personaInput, PERSONA_SYSTEMS.shin, modelId, apiKey),
      callAnthropic(personaInput, PERSONA_SYSTEMS.canon, modelId, apiKey),
      callAnthropic(personaInput, PERSONA_SYSTEMS.digg, modelId, apiKey),
    ]);

    const personas = {
      norm: normRes.status === "fulfilled" ? normRes.value : "(取得失敗)",
      shin: shinRes.status === "fulfilled" ? shinRes.value : "(取得失敗)",
      canon: canonRes.status === "fulfilled" ? canonRes.value : "(取得失敗)",
      digg: diggRes.status === "fulfilled" ? diggRes.value : "(取得失敗)",
    };

    // Step 3: エミ統合
    const emiInput = `相談内容：${input}\n\n4人格の視点：\n[ノーム]\n${personas.norm}\n\n[シン]\n${personas.shin}\n\n[カノン]\n${personas.canon}\n\n[ディグ]\n${personas.digg}`;
    const emiRaw = await callAnthropic(emiInput, EMI_SYSTEM, modelId, apiKey);

    // エミから「問い：」を分離
    const qMatch = emiRaw.match(/問い[：:]\s*(.+)/);
    const emiQuestion = qMatch ? qMatch[1].trim() : "";
    const emiMain = emiRaw.replace(/問い[：:].+/, "").trim();

    return NextResponse.json({
      core,
      personas,
      emi: { main: emiMain, question: emiQuestion },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "予期しないエラーが発生しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
