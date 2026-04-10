const STORAGE_KEY = 'kokoro_strategy_inputs';

export type StrategySource = 'writer' | 'kami' | 'ponchi';

export type StrategyInputEntry = {
  text: string;
  savedAt: string;
};

export type StrategyInputs = {
  writer?: StrategyInputEntry;
  kami?: StrategyInputEntry;
  ponchi?: StrategyInputEntry;
};

export function loadStrategyInputs(): StrategyInputs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StrategyInputs;
  } catch {
    return {};
  }
}

export function saveStrategyInput(source: StrategySource, text: string): void {
  const current = loadStrategyInputs();
  current[source] = { text, savedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

export function clearStrategyInputs(): void {
  localStorage.removeItem(STORAGE_KEY);
}
