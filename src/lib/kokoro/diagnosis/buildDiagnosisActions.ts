import type { PersonalDiagnosis, HonneLog } from "@/types/kokoroDiagnosis";
import type { Persona } from "@/types/kokoroOutput";

export type DiagnosisAction =
  | { type: "stay"; label: string; persona: Persona; reason?: string }
  | { type: "multi"; label: string; reason?: string }
  | { type: "logs"; label: string };

const STAY_LABELS: Record<Persona, string> = {
  gnome: "ノームと少し話してみる",
  shin: "シンに整理してもらう",
  canon: "カノンとこの気持ちを深掘る",
  dig: "ディグの視点で崩してみる",
};

function inferPersonaFromNeeds(needs: string[]): Persona | null {
  for (const need of needs) {
    if (/安心|休息/.test(need)) return "gnome";
    if (/理解|意味|実感|共鳴/.test(need)) return "canon";
    if (/変化|解放/.test(need)) return "dig";
    if (/整理|明確/.test(need)) return "shin";
  }
  return null;
}

export function buildDiagnosisActions(params: {
  diagnosis: PersonalDiagnosis;
  featuredLogs?: HonneLog[];
}): DiagnosisAction[] {
  const { diagnosis } = params;
  const actions: DiagnosisAction[] = [];

  // 1. repeatedConflictsがある → multi
  if (diagnosis.repeatedConflicts.length > 0) {
    actions.push({
      type: "multi",
      label: "4人格でこの葛藤を見直す",
      reason: diagnosis.repeatedConflicts[0],
    });
  }

  // 2. suppressed人格がある → stay
  if (diagnosis.personaBalance.suppressed.length > 0) {
    const persona = diagnosis.personaBalance.suppressed[0];
    actions.push({
      type: "stay",
      label: STAY_LABELS[persona],
      persona,
      reason: `${persona}の視点が埋もれがちです`,
    });
  } else if (diagnosis.hiddenNeeds.length > 0) {
    // suppressed不明の場合はhiddenNeedsから推定
    const persona = inferPersonaFromNeeds(diagnosis.hiddenNeeds);
    if (persona) {
      actions.push({
        type: "stay",
        label: STAY_LABELS[persona],
        persona,
      });
    }
  }

  // 3. ログを見る
  actions.push({
    type: "logs",
    label: "本音ログを見る",
  });

  // 最大3件
  return actions.slice(0, 3);
}
