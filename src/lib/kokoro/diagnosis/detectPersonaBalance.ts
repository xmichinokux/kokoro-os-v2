import type { Persona } from "@/types/kokoroOutput";
import type { PersonaCountMap } from "@/types/kokoroDiagnosis";

export function detectPersonaBalance(counts: PersonaCountMap): {
  dominant: Persona[];
  suppressed: Persona[];
} {
  const entries = (Object.entries(counts) as [Persona, number][]).sort(
    (a, b) => b[1] - a[1]
  );

  const maxCount = entries[0][1];
  const minCount = entries[entries.length - 1][1];

  // 全てゼロの場合
  if (maxCount === 0) {
    return { dominant: [], suppressed: [] };
  }

  const threshold = maxCount * 0.6;

  const dominant = entries
    .filter(([, count]) => count >= threshold)
    .map(([persona]) => persona);

  const suppressed = entries
    .filter(([, count]) => count <= Math.max(minCount, maxCount * 0.25))
    .map(([persona]) => persona);

  return { dominant, suppressed };
}
