import type { HonneLog } from "@/types/kokoroDiagnosis";

export function pickFeaturedHonneLogs(logs: HonneLog[], limit = 3): HonneLog[] {
  if (logs.length === 0) return [];

  // スコアリング
  const scored = logs.map(log => {
    let score = 0;
    if (log.deepFeeling) score += 4;
    if (log.confidence >= 0.7) score += 3;
    else if (log.confidence >= 0.5) score += 1;
    if ((log.conflictAxes?.length ?? 0) > 0) score += 2;
    if (log.sourceMode === "stay") score += 1;
    return { log, score };
  });

  // スコア順にソート
  scored.sort((a, b) => b.score - a.score);

  // 同テーマ重複を避けて選出
  const result: HonneLog[] = [];
  const seenTopics = new Set<string>();

  for (const { log } of scored) {
    if (result.length >= limit) break;
    if (seenTopics.has(log.topic) && result.length > 0) {
      // 同テーマは2件目以降スキップ（ただし他のテーマが足りない場合は許可）
      continue;
    }
    result.push(log);
    seenTopics.add(log.topic);
  }

  // limitに満たなければ残りを追加
  if (result.length < limit) {
    for (const { log } of scored) {
      if (result.length >= limit) break;
      if (!result.includes(log)) {
        result.push(log);
      }
    }
  }

  return result;
}
