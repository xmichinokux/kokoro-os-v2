export type Persona = "gnome" | "shin" | "canon" | "dig";
export type OutputMode = "lite" | "core" | "deep";

export type PersonaBlock = {
  persona: Persona;
  weight: number;
  tone: "low" | "mid" | "high";
  summary: string;
};

export type ConflictBlock = {
  axes: string[];
  summary?: string;
};

export type ConvergenceBlock = {
  conclusion: string;
  action: string[];
  trueFeeling?: string;
};

export type KokoroResponse = {
  mode: OutputMode;
  headline: string;
  personas: PersonaBlock[];
  conflict?: ConflictBlock;
  convergence: ConvergenceBlock;
};

export type StayModeStyle = "pure" | "balanced";

export type PersonaStayState = {
  active: boolean;
  persona: Persona;
  style: StayModeStyle;
  turnCount: number;
};
