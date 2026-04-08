// 公開Note（KokoroNoteのpublic版）
export type PublicNote = {
  id: string;
  title: string;
  body?: string;
  tags?: string[];
  topic?: string;
  source: 'manual' | 'talk' | 'zen' | 'emi';
  createdAt: string;
  isPublic: true;
  authorLabel?: string; // 将来用。今はモックで固定
};

// ゲーセンノート（視点の束）
export type GamesenNote = {
  id: string;
  title: string;
  description: string;       // 1行の視点説明
  keywords: string[];        // マッチングに使うキーワード
  persona?: 'gnome' | 'shin' | 'canon' | 'dig'; // 将来の人格連動用
  color: string;             // アクセントカラー
};
