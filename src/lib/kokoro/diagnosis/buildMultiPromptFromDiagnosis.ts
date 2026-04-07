import type { PersonalDiagnosis } from "@/types/kokoroDiagnosis";

export function buildMultiPromptFromDiagnosis(
  diagnosis: PersonalDiagnosis
): string {
  if (diagnosis.repeatedConflicts.length > 0) {
    return `「${diagnosis.repeatedConflicts[0]}」の葛藤を4人格で見たいです`;
  }
  return "今の状態を4人格で整理したいです";
}
