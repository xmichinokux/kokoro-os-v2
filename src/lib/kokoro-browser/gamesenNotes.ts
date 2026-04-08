import type { GamesenNote } from '@/types/browser';

export const GAMESEN_NOTES: GamesenNote[] = [
  {
    id: 'kanjo',
    title: '感情の棚',
    description: '言葉にならない気持ちが、ここに残っている。',
    keywords: ['不安', '悲しみ', '孤独', '怒り', '感情', '気持ち', '泣き', 'しんどい', '苦しい'],
    persona: 'canon',
    color: '#c084fc',
  },
  {
    id: 'kurikaeshi',
    title: '繰り返しの部屋',
    description: 'また同じところに戻ってきた、という記録。',
    keywords: ['反復', 'また', '同じ', 'パターン', '繰り返し', 'いつも'],
    persona: 'shin',
    color: '#60a5fa',
  },
  {
    id: 'honno',
    title: '本音の断片',
    description: '本当はこう思っていた、という小さな告白。',
    keywords: ['本音', '欲求', '本当は', 'わかってほしい', '望み', '本当のこと'],
    persona: 'gnome',
    color: '#34d399',
  },
  {
    id: 'shizen',
    title: '日常の隙間',
    description: '生活の中で、ふと気づいたこと。',
    keywords: ['生活', '日常', '体調', '食事', '仕事', '疲れ', '休憩', 'ふと'],
    persona: 'gnome',
    color: '#fb923c',
  },
  {
    id: 'tobikomu',
    title: '飛び込んだ記録',
    description: '何かが変わった、変えようとした瞬間。',
    keywords: ['挑戦', '変化', '飛躍', '決めた', 'やってみた', '変わりたい', '離脱'],
    persona: 'dig',
    color: '#f59e0b',
  },
];
