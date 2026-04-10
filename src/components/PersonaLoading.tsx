'use client';

/**
 * 5人格アイコンが順番に点滅する共通ローディングコンポーネント
 *
 * 仕様:
 * - ノーム🌱 / シン🔍 / カノン🌙 / ディグ🎧 / エミ🌊
 * - 横一列に並べて左から順に点滅（0.2秒ずつ遅延）
 * - 日本語メッセージなし
 */

const PERSONAS = [
  { icon: '\u{1F331}', name: 'ノーム' },   // 🌱
  { icon: '\u{1F50D}', name: 'シン' },     // 🔍
  { icon: '\u{1F319}', name: 'カノン' },   // 🌙
  { icon: '\u{1F3A7}', name: 'ディグ' },   // 🎧
  { icon: '\u{1F30A}', name: 'エミ' },     // 🌊
] as const;

export default function PersonaLoading() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 14,
      padding: '18px 0',
    }}>
      {PERSONAS.map((p, i) => (
        <span
          key={p.name}
          title={p.name}
          style={{
            fontSize: 20,
            animation: `personaBlink 1.0s ease-in-out ${i * 0.2}s infinite`,
            opacity: 0.25,
          }}
        >
          {p.icon}
        </span>
      ))}
      <style>{`@keyframes personaBlink{0%,100%{opacity:.25}50%{opacity:1}}`}</style>
    </div>
  );
}
