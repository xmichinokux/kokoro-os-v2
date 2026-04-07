export function buildDiagnosisSummary(
  coreThemes: string[],
  repeatedConflicts: string[]
): string {
  const parts: string[] = [];

  if (coreThemes.length > 0) {
    const themes = coreThemes.slice(0, 3).join("・");
    parts.push(`「${themes}」に関する思考が繰り返し見えます。`);
  }

  if (repeatedConflicts.length > 0) {
    const conflicts = repeatedConflicts.slice(0, 2).join("」と「");
    parts.push(`「${conflicts}」という葛藤が目立ちます。`);
  }

  if (parts.length === 0) {
    return "まだ傾向を読み取るには情報が少ない状態です。";
  }

  return parts.join(" ");
}
