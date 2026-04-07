export type EmiState = {
  lastTriggeredAt?: string;
  triggerCount: number;
};

// トリガー判定
export function shouldTriggerEmi(input: {
  text: string;
  recentUserTexts: string[];
  conflictAxes?: string[];
  deepFeeling?: string;
}): boolean {
  const { text, recentUserTexts, conflictAxes, deepFeeling } = input;

  // 2-1. 矛盾検知
  const contradictionPhrases = [
    "気にしてない", "そんなことない", "大丈夫", "別にいい",
    "関係ない", "どうでもいい"
  ];
  const hasContradiction = contradictionPhrases.some(p => text.includes(p));

  // 2-2. 感情のズレ（表面は冷静だが内容が重い）
  const heavyTopics = [
    "辞め", "別れ", "死", "消えた", "終わり", "限界", "もう無理"
  ];
  const hasHeavyContent = heavyTopics.some(p => text.includes(p));

  // 2-3. 同一テーマ反復（直近3メッセージで同じキーワード2文字以上）
  const words = text.split(/[\s、。,．！？!?]+/).filter(w => w.length >= 2);
  const matchCount = recentUserTexts.filter(prev =>
    words.some(w => prev.includes(w))
  ).length;
  const isRepeating = matchCount >= 2;

  // 2-4. deepFeeling検出
  const deepFeelingPhrases = [
    "本当は", "なんでか分からない", "うまく言えない",
    "なんとなく", "気づいたら", "気がする"
  ];
  const hasDeepFeeling = deepFeelingPhrases.some(p => text.includes(p))
    || Boolean(deepFeeling);

  // 2-5. 強い否定反応
  const strongDenials = [
    "そんなことない", "違うと思う", "そういうわけじゃ",
    "別に", "気にしてない"
  ];
  const hasStrongDenial = strongDenials.some(p => text.includes(p));

  // 2-6. 行き詰まり
  const stuckPhrases = [
    "どうしたらいい", "わからない", "どうすれば",
    "何をすれば", "もうダメ"
  ];
  const isStuck = stuckPhrases.some(p => text.includes(p));

  return (
    hasContradiction ||
    hasHeavyContent ||
    isRepeating ||
    hasDeepFeeling ||
    hasStrongDenial ||
    isStuck ||
    (conflictAxes !== undefined && conflictAxes.length > 0)
  );
}

// エミの一言生成
export function buildEmiLine(context: {
  text: string;
  conflictAxes?: string[];
  deepFeeling?: string;
}): string {
  const { text, conflictAxes, deepFeeling } = context;

  // deepFeelingがあれば優先
  if (deepFeeling) {
    return "それ、本音？";
  }

  // 矛盾・否定系
  const contradictionPhrases = ["気にしてない", "そんなことない", "大丈夫", "別にいい"];
  if (contradictionPhrases.some(p => text.includes(p))) {
    return "なんでそこ否定したの？";
  }

  // 行き詰まり
  const stuckPhrases = ["どうしたらいい", "わからない", "どうすれば"];
  if (stuckPhrases.some(p => text.includes(p))) {
    return "少しズレてる気がする";
  }

  // 葛藤あり
  if (conflictAxes && conflictAxes.length > 0) {
    return "今ちょっと引っかかった";
  }

  // デフォルト
  const lines = [
    "それ、本音？",
    "今ちょっと引っかかった",
    "少しズレてる気がする",
    "そこ、怖い？",
    "本当は別のこと考えてない？",
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

// Zen用初期プロンプト生成
export function buildZenPromptFromEmi(params: {
  lastUserMessage: string;
  detectedConflict?: string;
  deepFeeling?: string;
}): string {
  const { lastUserMessage, detectedConflict, deepFeeling } = params;
  if (deepFeeling) {
    return `本音と表のズレについて整理したい。「${deepFeeling}」という感覚がある`;
  }
  if (detectedConflict) {
    return `「${detectedConflict}」の葛藤を整理したい`;
  }
  return `「${lastUserMessage}」について、もう少し深く整理したい`;
}
