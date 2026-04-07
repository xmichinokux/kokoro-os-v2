import type { HonneLog, DiagnosisAggregate, CountMap, PersonaCountMap } from "@/types/kokoroDiagnosis";
import type { Persona } from "@/types/kokoroOutput";

function countItems(items: string[], map: CountMap): void {
  for (const item of items) {
    map[item] = (map[item] || 0) + 1;
  }
}

export function aggregateHonneLogs(logs: HonneLog[]): DiagnosisAggregate {
  const topicCounts: CountMap = {};
  const needCounts: CountMap = {};
  const conflictCounts: CountMap = {};
  const riskCounts: CountMap = {};
  const emotionCounts: CountMap = {};
  const personaCounts: PersonaCountMap = { gnome: 0, shin: 0, canon: 0, dig: 0 };
  const deepFeelingSamples: string[] = [];
  const subFeelingSamples: string[] = [];

  for (const log of logs) {
    // topic
    topicCounts[log.topic] = (topicCounts[log.topic] || 0) + 1;

    // persona
    if (log.activePersona) {
      personaCounts[log.activePersona] += 1;
    }

    // arrays
    if (log.detectedNeeds) countItems(log.detectedNeeds, needCounts);
    if (log.conflictAxes) countItems(log.conflictAxes, conflictCounts);
    if (log.riskFlags) countItems(log.riskFlags, riskCounts);
    if (log.emotionTone) countItems(log.emotionTone, emotionCounts);

    // samples
    if (log.deepFeeling && deepFeelingSamples.length < 10) {
      deepFeelingSamples.push(log.deepFeeling);
    }
    if (log.subFeeling && subFeelingSamples.length < 10) {
      subFeelingSamples.push(log.subFeeling);
    }
  }

  return {
    topicCounts,
    needCounts,
    conflictCounts,
    riskCounts,
    emotionCounts,
    personaCounts,
    deepFeelingSamples,
    subFeelingSamples,
    totalLogs: logs.length,
  };
}
