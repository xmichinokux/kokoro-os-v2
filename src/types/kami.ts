export type KamiColumn = {
  id: string;
  name: string;
  formula?: string; // この列を自然言語で説明（例: "人口÷面積で計算"）
};

export type KamiSheet = {
  id: string;
  title: string;
  columns: KamiColumn[];
  rows: string[][];       // 2D array [row][col]
  masterFormula: string;  // 全体を説明する自然言語の式
  description: string;    // AI生成の説明
  createdAt: string;
  updatedAt: string;
};
