import type { HonneLog } from "@/types/kokoroDiagnosis";

export function shouldStoreHonneLog(log: HonneLog): boolean {
  // 保存しない条件
  if (log.surfaceText.length < 8) return false;

  const hasSubFeeling = !!log.subFeeling;
  const hasDeepFeeling = !!log.deepFeeling;
  const hasConflict = (log.conflictAxes?.length ?? 0) > 0;
  const hasNeeds = (log.detectedNeeds?.length ?? 0) > 0;
  const highConfidence = log.confidence >= 0.6;

  const hasAnySignal = hasSubFeeling || hasDeepFeeling || hasConflict || hasNeeds || highConfidence;

  if (log.confidence < 0.35 && !hasAnySignal) return false;

  return hasAnySignal;
}
