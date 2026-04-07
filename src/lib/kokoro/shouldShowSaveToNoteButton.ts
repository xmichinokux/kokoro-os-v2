const NOTE_INTENT_WORDS = [
  '書きたい', '残したい', 'メモ', 'note', 'あとで考えたい', '覚えておきたい',
];

const DEEP_TOPICS = [
  '恋愛', '人間関係', '仕事', 'メンタル', '自己理解', '将来',
];

const DEEP_TEXT_HINTS = [
  '本音', '気持ち', '望み', '繰り返し', 'パターン', 'ズレ',
  '矛盾', '苦しい', '不安', '受け入れられない',
];

export type InsightFlowState =
  | 'idle'
  | 'emi_triggered'
  | 'user_shaken'
  | 'insight_locked'
  | 'zen_suggested'
  | 'zen_opened';

export function shouldShowSaveToNoteButton(params: {
  source: 'talk' | 'zen';
  text?: string;
  topic?: string;
  insightType?: 'contradiction' | 'emotion' | 'pattern' | 'desire' | 'avoidance';
  emiLine?: string;
  insightFlowState?: InsightFlowState;
  userText?: string;
}): boolean {
  // Zenは常に表示
  if (params.source === 'zen') return true;

  // Talk：条件付き表示
  if (params.emiLine) return true;
  if (params.insightType) return true;
  if (params.insightFlowState === 'insight_locked') return true;
  if (params.topic && DEEP_TOPICS.includes(params.topic)) return true;
  if (params.userText && NOTE_INTENT_WORDS.some(w => params.userText!.includes(w))) return true;
  if (params.text && DEEP_TEXT_HINTS.some(w => params.text!.includes(w))) return true;

  return false;
}
