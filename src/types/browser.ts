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
  authorLabel?: string;
};

// 商品Note（EC機能）
export type ProductNote = {
  id: string;
  title: string;
  body?: string;
  tags?: string[];
  source: string;
  createdAt: string;
  authorName: string;
  authorId: string;
  productPrice: number;
  productDescription: string;
  productExternalUrl: string;
  productType: string;
  bookmarkCount: number;
  isBookmarked?: boolean;
  aiPricedAmount?: number;        // AI鑑定額
  showAiBadge?: boolean;          // AI鑑定バッジ表示
};

// ブックマーク
export type Bookmark = {
  id: string;
  userId: string;
  noteId: string;
  createdAt: string;
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
