export type SessionState = {
  mood: "quiet" | "playful" | "tired" | "intense" | "fragile" | "neutral";
  mode: "practical" | "reflective" | "expressive" | "exploratory" | "casual";
  energy_level: "low" | "mid" | "high";
};

export function inferSessionState(recentMessages: string[]): SessionState {
  const joined = recentMessages.join(" ");

  const mood: SessionState["mood"] =
    /疲れ|しんど|だるい|眠い/.test(joined) ? "tired" :
    /楽し|わくわく|いいな|最高/.test(joined) ? "playful" :
    /不安|怖い|つらい|悲しい/.test(joined) ? "fragile" :
    /怒|腹立|むかつく|激し/.test(joined) ? "intense" :
    /静か|落ち着|ゆっくり/.test(joined) ? "quiet" : "neutral";

  const mode: SessionState["mode"] =
    /どうすれば|やり方|手順|具体/.test(joined) ? "practical" :
    /なぜ|なんで|意味|振り返/.test(joined) ? "reflective" :
    /感じ|気持ち|伝えたい|表現/.test(joined) ? "expressive" :
    /面白|試したい|新しい|可能性/.test(joined) ? "exploratory" : "casual";

  const energy_level: SessionState["energy_level"] =
    /疲れ|しんど|だるい|もう無理/.test(joined) ? "low" :
    /やる気|頑張|いける|最高/.test(joined) ? "high" : "mid";

  return { mood, mode, energy_level };
}

export function calcEffectiveProfileWeight(params: {
  currentMessage: string;
  turnCount: number;
  sessionState: SessionState;
}): number {
  const { currentMessage, turnCount } = params;

  // 明示的な現在優先の表現
  const currentOverridePhrases = [
    "今日は", "今は", "今だけ", "たまには",
    "違う感じ", "別の方向", "忘れて", "関係なく",
  ];
  const hasCurrentOverride = currentOverridePhrases.some(p =>
    currentMessage.includes(p)
  );

  if (hasCurrentOverride) return 0.1;

  // 初回3ターンはprofile弱め
  if (turnCount <= 3) return 0.2;

  // 情報不足・曖昧な場合は強めに参照
  if (currentMessage.length < 15) return 0.6;

  // 通常
  return 0.4;
}
