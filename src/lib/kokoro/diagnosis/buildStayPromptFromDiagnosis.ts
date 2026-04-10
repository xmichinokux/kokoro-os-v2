import type { Persona } from "@/types/kokoroOutput";
import type { PersonalDiagnosis } from "@/types/kokoroDiagnosis";

const PERSONA_PROMPTS: Record<Persona, string> = {
  gnome: "最近、不安や安心のことが気になっています",
  shin: "この状況を整理して次の一歩を決めたいです",
  canon: "今の気持ちをもう少し深く言葉にしたいです",
  dig: "停滞を崩したい気持ちがあります",
  emi: "今感じていることをそのまま聴いてほしいです",
};

export function buildStayPromptFromDiagnosis(
  persona: Persona,
  diagnosis: PersonalDiagnosis
): string {
  let prompt = PERSONA_PROMPTS[persona];

  // コアテーマがあれば補足
  if (diagnosis.coreThemes.length > 0) {
    prompt += `。特に「${diagnosis.coreThemes[0]}」について`;
  }

  return prompt;
}
