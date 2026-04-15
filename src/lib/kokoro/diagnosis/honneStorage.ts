import type { HonneLog, PersonalDiagnosis } from "@/types/kokoroDiagnosis";
import { shouldStoreHonneLog } from "./shouldStoreHonneLog";
import { buildPersonalDiagnosis } from "./buildPersonalDiagnosis";

const HONNE_LOG_KEY = "kokoroHonneLogs";

export function getHonneLogs(): HonneLog[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(HONNE_LOG_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as HonneLog[];
  } catch {
    return [];
  }
}

export function appendHonneLog(log: HonneLog): void {
  if (!shouldStoreHonneLog(log)) return;

  // sourceが未指定の場合はtalkとして保存
  const taggedLog = { ...log, source: log.source || 'talk' as const };

  const logs = getHonneLogs();
  logs.push(taggedLog);

  // 最大100件を保持
  const trimmed = logs.slice(-100);
  localStorage.setItem(HONNE_LOG_KEY, JSON.stringify(trimmed));
}

/** Zenソースのログのみ取得（Diagnosis用） */
export function getZenHonneLogs(): HonneLog[] {
  return getHonneLogs().filter(l => l.source === 'zen');
}

export function clearHonneLogs(): void {
  localStorage.removeItem(HONNE_LOG_KEY);
}

export function generateDiagnosis(): PersonalDiagnosis | null {
  const logs = getHonneLogs();
  if (logs.length === 0) return null;
  return buildPersonalDiagnosis(logs);
}
