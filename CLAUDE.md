# Kokoro OS v2 — CLAUDE.md

プロジェクトの引き継ぎ情報。次回セッションの開始時に必ず読むこと。

---

## プロジェクト概要

**Kokoro OS v2** — AI による対話・相談・思考整理を目的とした Next.js 製 AI OS。  
kokoro-os の作り直し版。Claude Code で構築中。

**リポジトリ**: https://github.com/xmichinokux/kokoro-os-v2  
**本番URL**: https://kokoro-os-v2.vercel.app

**技術スタック**
- Next.js 16.2.2 (App Router, Turbopack) + React 19 + TypeScript 5
- Tailwind CSS 4
- LLM: Ollama（ローカル）/ Anthropic API（両対応）
- Prisma は使わない（Vercel 非対応のため）

---

## 設計方針

### LLM バックエンド

| 呼称 | 実体 | 用途 |
|------|------|------|
| Lite | Ollama (localhost:11434, qwen3:8b) | ローカル・無料 |
| Core | Claude Haiku (`claude-haiku-4-5-20251001`) | バランス |
| Deep | Claude Sonnet (`claude-sonnet-4-6`) | 高精度 |

- **APIキーはユーザーがフロントで入力**し localStorage に保存。`.env` 固定にしない。
- バックエンド切り替えは UI から行う（`backend: "ollama" | "anthropic"`）。

### ペルソナ

| ID | 名前 | 性格 |
|----|------|------|
| `watari` | ワタリ | 静かに寄り添う。余白と余韻を大切にする。 |
| `emi` | エミ | 温かく明るい。ポジティブな視点を届ける。 |

### デザイン方針

- **白基調・清潔感・余白多め**
- フォント: Space Mono（UIラベル）+ Noto Serif JP（本文・会話）
- カラーパレット:
  - 背景: `#ffffff`
  - サブ背景: `#f8f9fa`
  - ボーダー: `#e5e7eb`
  - テキスト: `#1a1a1a`
  - サブテキスト: `#6b7280`
  - アクセント（紫）: `#7c3aed`
  - アクセントサブ: `#ede9fe`
  - ユーザーバブル: `#7c3aed` 背景 + `#ffffff` 文字
  - AI バブル: `#f3f4f6` 背景 + `#1a1a1a` 文字

---

## 現在の実装状態（2026-04-02 時点）

### 完成・動作確認済み

#### ホーム画面（`/`）

| ファイル | 内容 |
|----------|------|
| `src/app/page.tsx` | ランチャー画面。アプリカード6枚グリッド。未実装カードはグレーアウト。 |

#### `kokoro-chat`（`/kokoro-chat`）

| ファイル | 内容 |
|----------|------|
| `src/app/kokoro-chat/page.tsx` | チャット UI（ペルソナ選択・ロック・バックエンド設定） |
| `src/app/api/kokoro-chat/route.ts` | POST エンドポイント。Ollama / Anthropic 両対応。 |
| `src/app/layout.tsx` | Space Mono + Noto Serif JP をルートスコープで読み込み |

**kokoro-chat の機能一覧:**
- ペルソナ選択（ワタリ / エミ）
- ペルソナロック（会話中に固定）
- バックエンド切り替え（Ollama / Anthropic API）
- Anthropic 選択時: モデル選択（Haiku / Sonnet）+ APIキー入力
- 設定は localStorage に保存
- 会話履歴を localStorage に保存（最大20件・リロード復元）
- 「会話をリセット」ボタン
- Cmd/Ctrl+Enter で送信
- 新メッセージ時に自動スクロール
- エラー表示を日本語化（Ollama未起動・APIキー無効）

### 未実装（カードのみ表示）

- `kokoro-zen` — 深掘り相談
- `kokoro-plan` — タスク分解
- `kokoro-writer` — 文章編集
- `kokoro-insight` — レビューから作品の影響を逆算
- `kokoro-note` — 日記から自分の状態を読解

---

## 作業ログ

### 2026-04-02（初期構築）

- `create-next-app` で kokoro-os-v2 を新規作成
- `layout.tsx` に Space Mono + Noto Serif JP を設定
- `/kokoro-chat` ページ実装（チャット UI・ペルソナ・バックエンド・localStorage）
- `/api/kokoro-chat` エンドポイント実装（Ollama / Anthropic 両対応）
- `vercel.json` 追加（`framework: nextjs`）
- ホーム画面（ランチャー）実装
- GitHub / Vercel へデプロイ完了

**Vercel デプロイ時のトラブルと解決:**
- git リポジトリルートが `C:/Users/xmich/` になっており、ファイルが `kokoro-os-v2/` サブディレクトリとして commit されていた → `kokoro-os-v2/` 内で `git init` し直して force push
- Vercel の Framework Preset が `Other` になっていた → `vercel.json` に `"framework": "nextjs"` を追加

---

## 次のタスク候補

### 優先度: 高
- [ ] **Vercel 本番での動作確認** — Ollama（ローカルのみ）と Anthropic API の両方をテスト
- [ ] **`/kokoro-chat` の UI 改善** — スマホ対応・メッセージの折り返し確認

### 優先度: 中
- [ ] **`kokoro-zen` の実装** — 深掘り相談（ワタリ・エミの複数ターン）
- [ ] **`kokoro-note` の実装** — 日記入力 → 状態読解
- [ ] **会話履歴のペルソナ別管理** — 現在は全ペルソナ共通のキーで保存している

### 優先度: 低
- [ ] **認証** — Vercel KV or Supabase でユーザー管理
- [ ] **会話履歴のサーバー保存** — localStorage ではなく DB へ

---

## 開発メモ

- `npm run dev` → `http://localhost:3000/` で確認
- Ollama は `ollama serve` で起動（ポート 11434）
- 使用モデル: `qwen3:8b`
- TS チェック: `npx tsc --noEmit`
- ビルド確認: `npm run build`

---

## ファイル構成

```
src/
├── app/
│   ├── layout.tsx              # フォント定義（Space Mono + Noto Serif JP）
│   ├── page.tsx                # ホーム画面（ランチャー）
│   ├── globals.css
│   ├── kokoro-chat/
│   │   └── page.tsx            # チャット UI
│   └── api/
│       └── kokoro-chat/
│           └── route.ts        # API エンドポイント
vercel.json                     # framework: nextjs
```
