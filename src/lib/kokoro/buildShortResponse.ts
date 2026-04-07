import type { PersonaBlock } from "@/types/kokoroOutput";

export function buildShortResponse(params: {
  deepFeeling?: string;
  conflictAxes?: string[];
  personas: PersonaBlock[];
  action?: string[];
}): string {
  const { deepFeeling, conflictAxes, personas, action } = params;

  // 優先順位1：deepFeeling を30〜50文字に要約
  if (deepFeeling && deepFeeling.length > 0) {
    return deepFeeling.length <= 60
      ? deepFeeling
      : deepFeeling.slice(0, 55) + "…";
  }

  // 優先順位2：conflictAxesの核心を一言化
  if (conflictAxes && conflictAxes.length > 0) {
    const axis = conflictAxes[0];
    return `「${axis}」のところで揺れてるのかも`;
  }

  // 優先順位3：weight最大の人格のsummaryを短文化
  const topPersona = [...personas].sort((a, b) => b.weight - a.weight)[0];
  if (topPersona?.summary) {
    return topPersona.summary.length <= 60
      ? topPersona.summary
      : topPersona.summary.slice(0, 55) + "…";
  }

  // 優先順位4：actionの要約
  if (action && action.length > 0) {
    return action[0];
  }

  return "";
}
