'use client';

import type { Persona } from '@/types/kokoroOutput';
import { PERSONA_LABELS, PERSONA_COLORS, PERSONA_EMOJIS } from '@/lib/kokoro/personaLabels';

type TalkResponseProps = {
  persona: Persona;
  response: string;
  needZen: boolean;
  onZenClick: () => void;
};

export default function TalkResponse({ persona, response, needZen, onZenClick }: TalkResponseProps) {
  const color = PERSONA_COLORS[persona] || '#7c3aed';
  const icon = PERSONA_EMOJIS[persona] || '💬';
  const label = PERSONA_LABELS[persona] || persona;

  return (
    <div>
      {/* 人格ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: color + '22', border: `1.5px solid ${color}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, flexShrink: 0,
        }}>
          {icon}
        </div>
        <span style={{
          fontFamily: "'Space Mono', monospace", fontSize: 9,
          color, letterSpacing: '0.15em', textTransform: 'uppercase',
        }}>
          {label}
        </span>
      </div>

      {/* 返答本文 */}
      <div style={{
        borderLeft: `2px solid ${color}`, paddingLeft: 16,
        fontSize: 14, lineHeight: 2, color: '#374151',
      }}>
        {response}
      </div>

      {/* Zen導線（needZen=trueの時のみ） */}
      {needZen && (
        <div style={{
          marginTop: 12, padding: '10px 14px',
          background: '#faf5ff', border: '1px solid #e9d5ff',
          borderRadius: 8, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12,
        }}>
          <span style={{ fontSize: 12, color: '#7c3aed' }}>
            内側を整理する
          </span>
          <button
            onClick={onZenClick}
            style={{
              fontFamily: "'Space Mono', monospace", fontSize: 9,
              letterSpacing: '0.1em', color: '#7c3aed',
              background: 'transparent', border: '1px solid #c4b5fd',
              borderRadius: 2, padding: '6px 12px', cursor: 'pointer',
            }}
          >
            Zen を開く →
          </button>
        </div>
      )}
    </div>
  );
}
