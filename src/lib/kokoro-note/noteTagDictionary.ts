export const NOTE_TAG_DICTIONARY = {
  topics:   ['恋愛', '人間関係', '仕事', '生活', '創作', '家族', '自己理解', '体調', '将来', 'お金'],
  emotions: ['不安', '焦り', '悲しみ', '怒り', '空虚', '安心', '混乱', '倦怠', '希望', '孤独'],
  insights: ['矛盾', '感情', '反復', '欲求', '回避', '距離感', '停滞', '本音', '防衛', 'ズレ'],
  actions:  ['休息', '保留', '整理', '対話', '挑戦', '離脱', '継続', '見直し'],
  personas: ['ノーム', 'シン', 'カノン', 'ディグ'],
} as const;

// insightType → 気づきタグのマッピング
export const INSIGHT_TYPE_TO_TAG: Record<string, string> = {
  contradiction: '矛盾',
  emotion:       '感情',
  pattern:       '反復',
  desire:        '欲求',
  avoidance:     '回避',
};

// linkedPersona → 人格タグのマッピング
export const PERSONA_TO_TAG: Record<string, string> = {
  gnome:  'ノーム',
  shin:   'シン',
  canon:  'カノン',
  dig:    'ディグ',
};

// 本文キーワード → タグのマッピング
export const BODY_KEYWORD_TO_TAGS: Array<{ keywords: string[]; tags: string[] }> = [
  { keywords: ['また', '毎回', '繰り返し', '同じ'],            tags: ['反復'] },
  { keywords: ['本当は', 'わかってほしい', '認めてほしい'],     tags: ['欲求', '本音'] },
  { keywords: ['逃げる', '避ける', '逃げた'],                  tags: ['回避', '防衛'] },
  { keywords: ['苦しい', 'しんどい', 'つらい'],                tags: ['不安', '倦怠'] },
  { keywords: ['距離', '近づきすぎ', '離れ'],                  tags: ['距離感'] },
  { keywords: ['止まって', '動けない', '進まない'],             tags: ['停滞'] },
  { keywords: ['怖い', '不安', 'こわい'],                      tags: ['不安'] },
  { keywords: ['寂しい', 'ひとり', '孤独'],                    tags: ['孤独'] },
  { keywords: ['わからない', '混乱', 'どうしたら'],             tags: ['混乱'] },
  { keywords: ['やめたい', '離れたい', '辞めたい'],             tags: ['離脱'] },
];
