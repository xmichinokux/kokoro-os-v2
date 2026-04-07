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

  const logs = getHonneLogs();
  logs.push(log);

  // 最大100件を保持
  const trimmed = logs.slice(-100);
  localStorage.setItem(HONNE_LOG_KEY, JSON.stringify(trimmed));
}

export function clearHonneLogs(): void {
  localStorage.removeItem(HONNE_LOG_KEY);
}

export function generateDiagnosis(): PersonalDiagnosis | null {
  const logs = getHonneLogs();
  if (logs.length === 0) return null;
  return buildPersonalDiagnosis(logs);
}
