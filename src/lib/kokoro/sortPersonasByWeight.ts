import type { PersonaBlock } from "@/types/kokoroOutput";

export function sortPersonasByWeight(personas: PersonaBlock[]): PersonaBlock[] {
  return [...personas].sort((a, b) => b.weight - a.weight);
}
