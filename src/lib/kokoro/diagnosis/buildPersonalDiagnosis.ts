import type { HonneLog, PersonalDiagnosis } from "@/types/kokoroDiagnosis";
import type { Persona } from "@/types/kokoroOutput";
import { aggregateHonneLogs } from "./aggregateHonneLogs";
import { extractTopItems } from "./extractTopItems";
import { detectPersonaBalance } from "./detectPersonaBalance";
import { inferHiddenNeeds } from "./inferHiddenNeeds";
import { detectRiskPatterns } from "./detectRiskPatterns";
import { buildDiagnosisSummary } from "./buildDiagnosisSummary";

const GROWTH_EDGES: Record<Persona, string> = {
  gnome: "安心を残したまま動く練習",
  dig: "小さく逸脱を試す余地",
  canon: "感情や意味の言語化",
  shin: "本音を現実の手順に落とすこと",
};

export function buildPersonalDiagnosis(logs: HonneLog[]): PersonalDiagnosis {
  const now = new Date().toISOString();

  if (logs.length < 3) {
    return {
      summary: "まだログが少ないため、仮の診断です。",
      coreThemes: [],
      repeatedConflicts: [],
      hiddenNeeds: [],
      personaBalance: { dominant: [], suppressed: [] },
      sourceLogCount: logs.length,
      updatedAt: now,
    };
  }

  const agg = aggregateHonneLogs(logs);

  const coreThemes = extractTopItems(agg.topicCounts, 3);
  const repeatedConflicts = extractTopItems(agg.conflictCounts, 3, 2);
  const hiddenNeeds = inferHiddenNeeds(agg.needCounts, agg.deepFeelingSamples);
  const personaBalance = detectPersonaBalance(agg.personaCounts);
  const currentState = extractTopItems(agg.emotionCounts, 3);
  const cautionPoints = detectRiskPatterns(agg.riskCounts);

  const growthEdges = personaBalance.suppressed.map(p => GROWTH_EDGES[p]);

  const summary = buildDiagnosisSummary(coreThemes, repeatedConflicts);

  return {
    summary,
    coreThemes,
    repeatedConflicts,
    hiddenNeeds,
    personaBalance,
    currentState: currentState.length > 0 ? currentState : undefined,
    growthEdges: growthEdges.length > 0 ? growthEdges : undefined,
    cautionPoints: cautionPoints.length > 0 ? cautionPoints : undefined,
    sourceLogCount: logs.length,
    updatedAt: now,
  };
}
