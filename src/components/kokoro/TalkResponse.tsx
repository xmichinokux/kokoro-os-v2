'use client';

import type { Persona, IdentityState, ResponseStrategy } from '@/types/kokoroOutput';
import { PERSONA_LABELS, PERSONA_COLORS, PERSONA_EMOJIS } from '@/lib/kokoro/personaLabels';
import { shouldShowSaveToNoteButton } from '@/lib/kokoro/shouldShowSaveToNoteButton';
import type { InsightFlowState } from '@/lib/kokoro/shouldShowSaveToNoteButton';

const STATE_LABELS: Partial<Record<IdentityState, string>> = {
  DEFENSIVE_GAP:   '自己認識のズレ（防衛中）',
  IDENTITY_SHIFT:  '自己認識のズレ（気づきフェーズ）',
  COLLAPSE:        '自己像の揺らぎ',
  RECONSTRUCTION:  '再構築フェーズ',
};

const STATE_COLORS: Partial<Record<IdentityState, string>> = {
  DEFENSIVE_GAP:   'border-orange-400 text-orange-300',
  IDENTITY_SHIFT:  'border-sky-400 text-sky-300',
  COLLAPSE:        'border-violet-400 text-violet-300',
  RECONSTRUCTION:  'border-emerald-400 text-emerald-300',
};

const STRATEGY_HINTS: Partial<Record<ResponseStrategy, string>> = {
  soften:    'やわらかく揺らす返答をしています',
  structure: '構造を整理した返答をしています',
  stabilize: '安定を優先した返答をしています',
  direct:    '方向性を提示する返答をしています',
};

type TalkResponseProps = {
  persona: Persona;
  response: string;
  identityState?: IdentityState;
  gapIntensity?: number;
  responseStrategy?: ResponseStrategy;
  onSaveNote?: () => void;
  noteSaved?: boolean;
  // 出現条件判定用
  topic?: string;
  insightType?: 'contradiction' | 'emotion' | 'pattern' | 'desire' | 'avoidance';
  emiLine?: string;
  insightFlowState?: InsightFlowState;
  userText?: string;
};

export default function TalkResponse({
  persona, response, identityState, gapIntensity, responseStrategy,
  onSaveNote, noteSaved,
  topic, insightType, emiLine, insightFlowState, userText,
}: TalkResponseProps) {
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

      {/* noteに残すボタン（条件付き表示） */}
      {onSaveNote && shouldShowSaveToNoteButton({
        source: 'talk',
        text: response,
        topic,
        insightType,
        emiLine,
        insightFlowState,
        userText,
      }) && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          {noteSaved ? (
            <span style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 10,
              color: '#34d399',
              letterSpacing: '0.1em',
            }}>
              ✓ noteに保存しました
            </span>
          ) : (
            <button
              onClick={onSaveNote}
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 10,
                color: '#6b7280',
                background: 'transparent',
                border: '1px solid #e5e7eb',
                borderRadius: 4,
                padding: '3px 10px',
                cursor: 'pointer',
                letterSpacing: '0.08em',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                (e.target as HTMLButtonElement).style.borderColor = '#7c3aed';
                (e.target as HTMLButtonElement).style.color = '#7c3aed';
              }}
              onMouseLeave={e => {
                (e.target as HTMLButtonElement).style.borderColor = '#e5e7eb';
                (e.target as HTMLButtonElement).style.color = '#6b7280';
              }}
            >
              書き留めておく？
            </button>
          )}
        </div>
      )}

      {/* 自己認識ズレ状態バッジ */}
      {identityState && identityState !== 'NO_GAP' && (gapIntensity ?? 0) > 0.3 && (
        <div className={`mt-3 pl-3 border-l-2 text-xs space-y-0.5 ${STATE_COLORS[identityState] ?? ''}`}>
          <div className="opacity-50 font-mono tracking-widest text-[10px]">
            // 状態検出
          </div>
          <div className="font-medium">
            {STATE_LABELS[identityState]}
          </div>
          {responseStrategy && responseStrategy !== 'normal' && (
            <div className="opacity-60">
              {STRATEGY_HINTS[responseStrategy]}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
