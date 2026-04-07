'use client';

import type { KokoroResponse } from '@/types/kokoroOutput';
import { sortPersonasByWeight } from '@/lib/kokoro/sortPersonasByWeight';
import { PERSONA_LABELS, PERSONA_COLORS, PERSONA_EMOJIS } from '@/lib/kokoro/personaLabels';

type Props = {
  data: KokoroResponse;
};

export default function KokoroCoreView({ data }: Props) {
  const sorted = sortPersonasByWeight(data.personas ?? []);

  const toneStyle = (tone: 'low' | 'mid' | 'high') => {
    if (tone === 'high') return { color: '#1a1a1a', fontWeight: 500 } as const;
    if (tone === 'mid') return { color: '#374151', fontWeight: 300 } as const;
    return { color: '#9ca3af', fontWeight: 300 } as const;
  };

  return (
    <div style={{ maxWidth: '100%' }}>

      {/* ① 結論 */}
      <div style={{ borderLeft: '2px solid #7c3aed', paddingLeft: 16, marginBottom: 24 }}>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: '0.18em', color: '#7c3aed', textTransform: 'uppercase', marginBottom: 10 }}>
          // 結論
        </div>
        <div style={{ fontSize: 15, lineHeight: 2, color: '#1a1a1a', fontWeight: 400 }}>
          {data.headline}
        </div>
      </div>

      {/* ② 4人格の反応 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: '0.18em', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 12 }}>
          // 4人格の反応
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map(p => {
            const color = PERSONA_COLORS[p.persona] || '#7c3aed';
            const style = toneStyle(p.tone);
            return (
              <div key={p.persona} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 72, flexShrink: 0 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: color + '22', border: `1.5px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>
                    {PERSONA_EMOJIS[p.persona] || '💬'}
                  </div>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                    {PERSONA_LABELS[p.persona] || p.persona}
                  </span>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.8, ...style }}>
                  {p.summary}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ③ 今回の争点 */}
      {data.conflict && data.conflict.axes.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: '0.18em', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 10 }}>
            // 争点
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {data.conflict.axes.map((axis, i) => (
              <span key={i} style={{ fontSize: 12, padding: '4px 12px', border: '1px solid #e5e7eb', borderRadius: 20, color: '#6b7280', background: '#f9fafb' }}>
                {axis}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ④ 次の一歩 */}
      <div style={{ borderLeft: '2px solid #059669', paddingLeft: 16, marginBottom: 24 }}>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: '0.18em', color: '#059669', textTransform: 'uppercase', marginBottom: 10 }}>
          // 次の一歩
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.8, color: '#374151', marginBottom: 8 }}>
          {data.convergence.conclusion}
        </div>
        {data.convergence.action.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.convergence.action.map((a, i) => (
              <div key={i} style={{ fontSize: 12, color: '#6b7280', paddingLeft: 12, borderLeft: '1px solid #d1d5db' }}>
                {a}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ⑤ 本音 */}
      {data.convergence.trueFeeling && (
        <div style={{ borderLeft: '2px solid #c4b5fd', paddingLeft: 16 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: '0.18em', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 10 }}>
            // 本音
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.8, color: '#6b7280', fontStyle: 'italic' }}>
            {data.convergence.trueFeeling}
          </div>
        </div>
      )}
    </div>
  );
}
