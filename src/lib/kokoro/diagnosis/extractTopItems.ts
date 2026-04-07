import type { CountMap } from "@/types/kokoroDiagnosis";

export function extractTopItems(
  counts: CountMap,
  n: number,
  minCount = 1
): string[] {
  return Object.entries(counts)
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key]) => key);
}
