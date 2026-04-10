'use client';

import type { Persona } from '@/types/kokoroOutput';
import { PERSONA_COLORS, PERSONA_EMOJIS, PERSONA_LABELS } from '@/lib/kokoro/personaLabels';

type TalkResponseProps = {
  persona: Persona;
  response: string;
  // Recipe導線
  onSaveRecipe?: () => void;
  showRecipe?: boolean;
};

export default function TalkResponse({
  persona, response,
  onSaveRecipe, showRecipe,
}: TalkResponseProps) {
  const color = PERSONA_COLORS[persona] || '#7c3aed';
  const icon = PERSONA_EMOJIS[persona] || '💬';

  return (
    <div>
      {/* 人格ヘッダー（アイコンのみ） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div
          title={PERSONA_LABELS[persona] || persona}
          style={{
            width: 28, height: 28, borderRadius: '50%',
            background: color + '22', border: `1.5px solid ${color}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>

      {/* 返答本文 */}
      <div style={{
        borderLeft: `2px solid ${color}`, paddingLeft: 16,
        fontSize: 14, lineHeight: 2, color: '#374151',
      }}>
        {response}
      </div>

      {/* Recipe導線 */}
      {showRecipe && onSaveRecipe && (
        <div style={{ marginTop: 6 }}>
          <button
            onClick={onSaveRecipe}
            title="今週のRecipeにしてみる？"
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 10, color: '#f97316',
              background: 'transparent',
              border: '1px solid rgba(249,115,22,0.3)',
              borderRadius: 4, padding: '3px 10px',
              cursor: 'pointer', letterSpacing: '0.08em',
            }}
          >
            Recipe →
          </button>
        </div>
      )}
    </div>
  );
}
