import type { HonneLog } from "@/types/kokoroDiagnosis";

export function pickFeaturedHonneLogs(
  logs: HonneLog[],
  limit = 3
): HonneLog[] {
  if (!logs || logs.length === 0) return [];

  // スコアリング
  const scored = logs.map(log => {
    let score = 0;
    if (log.deepFeeling) score += 3;
    if (log.subFeeling) score += 1;
    if (log.confidence >= 0.7) score += 2;
    if (log.confidence >= 0.8) score += 1;
    if ((log.conflictAxes?.length ?? 0) > 0) score += 2;
    if (log.sourceMode === "stay") score += 1;
    return { log, score };
  });

  // スコア降順でソート
  scored.sort((a, b) => b.score - a.score);

  // 上位limit件を返す（テーマ重複は気にしない）
  return scored.slice(0, limit).map(s => s.log);
}
