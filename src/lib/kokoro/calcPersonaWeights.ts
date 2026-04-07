import type { Persona } from "@/types/kokoroOutput";

type PersonaWeights = Record<Persona, number>;
type IntentType = "work" | "relationship" | "creative" | "mental" | "decision" | "review";

type UserState = {
  anxious?: boolean;
  tired?: boolean;
  exploratory?: boolean;
  needsComfort?: boolean;
  needsAction?: boolean;
};

// 問いの種類ごとの初期重み
const BASE_WEIGHTS: Record<IntentType, PersonaWeights> = {
  work:         { gnome: 0.6, shin: 1.0, canon: 0.4, dig: 0.5 },
  relationship: { gnome: 0.8, shin: 0.6, canon: 1.0, dig: 0.4 },
  creative:     { gnome: 0.4, shin: 0.6, canon: 0.9, dig: 1.0 },
  mental:       { gnome: 1.0, shin: 0.4, canon: 0.7, dig: 0.2 },
  decision:     { gnome: 0.8, shin: 0.9, canon: 0.7, dig: 0.6 },
  review:       { gnome: 0.4, shin: 0.8, canon: 0.9, dig: 0.7 },
};

// 状態補正
function getStateAdjustment(state: UserState): PersonaWeights {
  const adj = { gnome: 0, shin: 0, canon: 0, dig: 0 };
  if (state.anxious || state.needsComfort) {
    adj.gnome += 0.25; adj.canon += 0.1; adj.dig -= 0.15;
  }
  if (state.tired) {
    adj.gnome += 0.15; adj.shin -= 0.05; adj.dig -= 0.1;
  }
  if (state.exploratory) {
    adj.dig += 0.25; adj.canon += 0.1; adj.gnome -= 0.1;
  }
  if (state.needsAction) {
    adj.shin += 0.15; adj.dig += 0.1; adj.gnome -= 0.05;
  }
  return adj;
}

// 重み合成 + 正規化（最小0.12、最大0.45を保証）
function mergeAndNormalize(
  base: PersonaWeights,
  stateAdj: PersonaWeights
): PersonaWeights {
  const MIN = 0.12;
  const MAX = 0.45;
  const raw = {
    gnome: Math.min(MAX, Math.max(MIN, base.gnome + stateAdj.gnome)),
    shin:  Math.min(MAX, Math.max(MIN, base.shin  + stateAdj.shin)),
    canon: Math.min(MAX, Math.max(MIN, base.canon + stateAdj.canon)),
    dig:   Math.min(MAX, Math.max(MIN, base.dig   + stateAdj.dig)),
  };
  const total = raw.gnome + raw.shin + raw.canon + raw.dig;
  return {
    gnome: raw.gnome / total,
    shin:  raw.shin  / total,
    canon: raw.canon / total,
    dig:   raw.dig   / total,
  };
}

// インテント検出（テキストから）
export function detectIntent(text: string): IntentType {
  if (/仕事|業務|仕様|効率|スキル|転職|職場/.test(text)) return "work";
  if (/恋愛|彼|彼女|友達|家族|関係|人間関係/.test(text)) return "relationship";
  if (/創作|アイデア|企画|デザイン|作りたい|表現/.test(text)) return "creative";
  if (/不安|つらい|疲れ|メンタル|気持ち|しんどい|怖い/.test(text)) return "mental";
  if (/どうすれば|決め|選択|迷|判断|べきか/.test(text)) return "decision";
  if (/振り返|まとめ|整理|分析|レビュー/.test(text)) return "review";
  return "decision";
}

// 状態検出（テキストから）
export function detectState(text: string): UserState {
  return {
    anxious:      /不安|心配|怖|ドキドキ/.test(text),
    tired:        /疲れ|だるい|しんどい|眠い/.test(text),
    exploratory:  /面白|試したい|新しい|どうなる|可能性/.test(text),
    needsComfort: /つらい|悲しい|落ち込|寂しい/.test(text),
    needsAction:  /やりたい|動きたい|変えたい|始め/.test(text),
  };
}

// メイン関数
export function calcPersonaWeights(text: string): PersonaWeights {
  const intent = detectIntent(text);
  const state = detectState(text);
  const base = BASE_WEIGHTS[intent];
  const stateAdj = getStateAdjustment(state);
  return mergeAndNormalize(base, stateAdj);
}
