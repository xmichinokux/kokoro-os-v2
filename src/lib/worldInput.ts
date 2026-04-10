const STORAGE_KEY = 'kokoro_world_input';

export type WorldInput = {
  strategyHtml: string;
  strategyText: string;
  savedAt: string;
};

export function loadWorldInput(): WorldInput | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WorldInput;
  } catch {
    return null;
  }
}

export function saveWorldInput(strategyHtml: string, strategyText: string): void {
  const data: WorldInput = {
    strategyHtml,
    strategyText,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearWorldInput(): void {
  localStorage.removeItem(STORAGE_KEY);
}
