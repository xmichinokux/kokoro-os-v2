import type { CountMap } from "@/types/kokoroDiagnosis";
import { extractTopItems } from "./extractTopItems";

const DEEP_FEELING_KEYWORDS: Record<string, string> = {
  "理解": "理解 / 共鳴",
  "通じ": "理解 / 共鳴",
  "休み": "安心 / 休息",
  "しんど": "安心 / 休息",
  "変わり": "変化 / 解放",
  "別の生き方": "変化 / 解放",
  "意味": "意味 / 実感",
  "空虚": "意味 / 実感",
};

export function inferHiddenNeeds(
  needCounts: CountMap,
  deepFeelingSamples: string[]
): string[] {
  const topNeeds = extractTopItems(needCounts, 3);

  if (topNeeds.length >= 2) {
    return topNeeds;
  }

  // needが少なければdeepFeelingSamplesからキーワード推定
  const inferred = new Set<string>(topNeeds);

  for (const sample of deepFeelingSamples) {
    for (const [keyword, need] of Object.entries(DEEP_FEELING_KEYWORDS)) {
      if (sample.includes(keyword)) {
        inferred.add(need);
      }
    }
    if (inferred.size >= 3) break;
  }

  return Array.from(inferred).slice(0, 3);
}
