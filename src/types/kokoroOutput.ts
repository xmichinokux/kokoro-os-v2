export type Persona = "gnome" | "shin" | "canon" | "dig" | "emi";
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

// 自己認識ズレ検出エンジン
export type IdentityState =
  | 'DEFENSIVE_GAP'   // ズレはあるが否認中（反論・否定が強い）
  | 'IDENTITY_SHIFT'  // ズレに気づき始めている（疑問・迷い）
  | 'COLLAPSE'        // 自己像が崩れている（混乱・絶望）
  | 'RECONSTRUCTION'  // 再構築フェーズ（試行・仮説）
  | 'NO_GAP';         // ズレなし・通常状態

export type ResponseStrategy =
  | 'soften'     // DEFENSIVE_GAP：やわらかく揺らす
  | 'structure'  // IDENTITY_SHIFT：構造を提示する
  | 'stabilize'  // COLLAPSE：安定を優先する
  | 'direct'     // RECONSTRUCTION：方向性を提示する
  | 'normal';    // NO_GAP：通常応答

export type GapDetectionResult = {
  identityState: IdentityState;
  gapIntensity: number;        // 0.0〜1.0
  responseStrategy: ResponseStrategy;
};
