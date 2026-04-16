// Builder が OS前提モード時に生成プロンプトへ注入する window.kokoro SDK 仕様書。

export const KOKORO_OS_BUILDER_PROMPT = `
【重要: Kokoro OS mini-app モード】
あなたが生成するHTMLは Kokoro OS 内の iframe (sandbox="allow-scripts") で実行される mini-app です。
以下の window.kokoro.* API が自動注入されるので、認証・DB・LLM呼び出しを**自前で実装しないでください**。

【window.kokoro API（すべてPromiseを返す async）】

// ユーザー情報
await window.kokoro.user.me()
// → { id: string, email: string }

// Note操作（ユーザー自身のNoteに対してCRUD可能）
await window.kokoro.notes.list({ tag?, source?, limit? })
// → Note[]（新しい順、上限50件推奨）
await window.kokoro.notes.get(id)
// → Note
await window.kokoro.notes.create({ title, body, tags?, source? })
// → Note（作成されたもの。ID自動採番）
await window.kokoro.notes.update(id, { title?, body?, tags? })
// → Note（更新後）

// Note型:
// { id: string, title: string, body: string, source: string,
//   tags: string[], createdAt: string, updatedAt: string, isPublic: boolean }

// LLM呼び出し（Kokoro OSが認証＆課金。APIキー不要）
await window.kokoro.llm.complete({
  prompt: string,
  model?: 'haiku' | 'sonnet' | 'gemini-flash',  // 既定: 'haiku'
  maxTokens?: number,                             // 既定: 1024、最大: 4096
})
// → string (応答テキスト)

【使用例】
// Noteを検索してAIに要約させる
const notes = await window.kokoro.notes.list({ tag: 'idea', limit: 10 });
const joined = notes.map(n => n.title + ':' + n.body).join('\\n');
const summary = await window.kokoro.llm.complete({
  prompt: '以下を3行で要約: \\n' + joined,
  model: 'haiku',
});

// ユーザー入力をNoteに保存
const note = await window.kokoro.notes.create({
  title: 'アイデア',
  body: input.value,
  tags: ['idea'],
  source: 'mini-app-data',
});

【制約・注意点】
・認証・ログイン画面は作らない（既にログイン済み前提）
・localStorage は使えるが、タブ間共有不可。ユーザーデータの永続化には **window.kokoro.notes を使う**
・外部サイトへの fetch は CORSで失敗するので使わない
・Anthropic/OpenAI/Gemini等のAPIキーをHTMLに書かない。**必ず window.kokoro.llm.complete** を使う
・window.parent/window.top への直接アクセスはしない（bridgeはSDK経由のみ）

【HTML生成時の追加ルール】
・<!DOCTYPE html>から始まる完全なシングルHTMLを生成
・viewportメタタグ必須、モバイル対応
・日本語UI。Noto Sans JPは Google Fonts から読み込む
・window.kokoro は HTMLロード完了時点で利用可能。async関数内で呼ぶこと
`.trim();

export const KOKORO_OS_FEASIBILITY_NOTE = `
なお、このBuilderはKokoro OSのmini-appモードで動作する前提です。
mini-appは以下のインフラを window.kokoro.* 経由で自動的に使えます:
- ユーザー認証（ログイン済み前提、認証UI不要）
- Note DB（CRUD操作）
- LLM呼び出し（Haiku/Sonnet/Gemini Flash、APIキー不要）

したがって、以下の理由で infeasible と判定していたものは **feasible/risky に緩和してよい**:
- DB/永続化が必要 → window.kokoro.notes で対応可能
- AI/LLM呼び出しが必要 → window.kokoro.llm.complete で対応可能
- 認証/ユーザー管理が必要 → 既にログイン済み
- 外部APIキーが必要 → LLMについては不要

ただし、以下は依然として infeasible:
- 物理演算ゲーム、リアルタイム多オブジェクト、本格3D
- window.kokoro 以外の外部API（Stripe決済・地図SDK等）必須
- 2000行超の規模
`.trim();
