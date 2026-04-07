import type { CountMap } from "@/types/kokoroDiagnosis";
import { extractTopItems } from "./extractTopItems";

export function detectRiskPatterns(riskCounts: CountMap): string[] {
  return extractTopItems(riskCounts, 3, 2);
}
