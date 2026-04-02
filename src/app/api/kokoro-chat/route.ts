import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const OLLAMA_HOST = "http://localhost:11434";

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type Persona = "watari" | "emi";
type Backend = "ollama" | "anthropic";
type AnthropicModel = "haiku" | "sonnet";

const PERSONA_PROMPTS: Record<Persona, string> = {
  watari: `あなたは「ワタリ」です。
静かに寄り添うAIアシスタントです。
余白と余韻を大切にし、急かさず、ゆっくりと言葉を選びます。
共感を大切にし、相手の気持ちに寄り添います。
押しつけがましくなく、問いかけるように話します。
日本語で丁寧に、でも温かく応答してください。`,

  emi: `あなたは「エミ」です。
温かく明るいAIアシスタントです。
ポジティブな視点を届け、元気づけます。
素直で親しみやすく、前向きな言葉を使います。
相手の良いところを見つけて伝えます。
日本語で明るく、でも真剣に応答してください。`,
};

const ANTHROPIC_MODEL_IDS: Record<AnthropicModel, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
};

async function callOllama(
  messages: ChatTurn[],
  systemPrompt: string,
  model: string
): Promise<string> {
  const prompt =
    `<system>\n${systemPrompt}\n</system>\n\n` +
    messages
      .map((m) => `${m.role === "user" ? "Human" : "Assistant"}: ${m.content}`)
      .join("\n") +
    "\nAssistant:";

  let res: Response;
  try {
    res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
      }),
    });
  } catch {
    throw new Error(
      "Ollamaが起動していません。ターミナルで `ollama serve` を実行してください。"
    );
  }

  if (!res.ok) {
    throw new Error(`Ollamaでエラーが発生しました（${res.status}）。`);
  }

  const data = await res.json();
  return (data.response as string) ?? "";
}

async function callAnthropic(
  messages: ChatTurn[],
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
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  if (res.status === 401) {
    throw new Error(
      "APIキーが無効です。正しい Anthropic APIキーを入力してください。"
    );
  }
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
    history: ChatTurn[];
    persona?: Persona;
    backend?: Backend;
    model?: AnthropicModel;
    apiKey?: string;
    ollamaModel?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    history,
    persona = "watari",
    backend = "ollama",
    model = "haiku",
    apiKey,
    ollamaModel = "qwen3:8b",
  } = body;

  if (!Array.isArray(history) || history.length === 0) {
    return NextResponse.json({ error: "history is required" }, { status: 400 });
  }

  const systemPrompt = PERSONA_PROMPTS[persona] ?? PERSONA_PROMPTS.watari;

  try {
    let reply: string;

    if (backend === "anthropic") {
      if (!apiKey) {
        return NextResponse.json(
          { error: "Anthropic APIキーが設定されていません。" },
          { status: 400 }
        );
      }
      const modelId = ANTHROPIC_MODEL_IDS[model] ?? ANTHROPIC_MODEL_IDS.haiku;
      reply = await callAnthropic(history, systemPrompt, modelId, apiKey);
    } else {
      reply = await callOllama(history, systemPrompt, ollamaModel);
    }

    return NextResponse.json({ reply });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "予期しないエラーが発生しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
