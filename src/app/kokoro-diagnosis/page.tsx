'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { PersonalDiagnosis, HonneLog } from '@/types/kokoroDiagnosis';
import type { Persona } from '@/types/kokoroOutput';
import { getHonneLogs } from '@/lib/kokoro/diagnosis/honneStorage';
import { buildPersonalDiagnosis } from '@/lib/kokoro/diagnosis/buildPersonalDiagnosis';
import { pickFeaturedHonneLogs } from '@/lib/kokoro/diagnosis/pickFeaturedHonneLogs';
import { buildDiagnosisActions, type DiagnosisAction } from '@/lib/kokoro/diagnosis/buildDiagnosisActions';
import { buildStayPromptFromDiagnosis } from '@/lib/kokoro/diagnosis/buildStayPromptFromDiagnosis';
import { buildMultiPromptFromDiagnosis } from '@/lib/kokoro/diagnosis/buildMultiPromptFromDiagnosis';
import { PERSONA_LABELS, PERSONA_COLORS, PERSONA_EMOJIS } from '@/lib/kokoro/personaLabels';

export default function KokoroDiagnosis() {
  const router = useRouter();
  const [diagnosis, setDiagnosis] = useState<PersonalDiagnosis | null>(null);
  const [featuredLogs, setFeaturedLogs] = useState<HonneLog[]>([]);
  const [actions, setActions] = useState<DiagnosisAction[]>([]);
  const [logCount, setLogCount] = useState(0);
  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const logs = getHonneLogs();
    setLogCount(logs.length);
    if (logs.length === 0) return;

    const d = buildPersonalDiagnosis(logs);
    const featured = pickFeaturedHonneLogs(logs, 4);
    const acts = buildDiagnosisActions({ diagnosis: d, featuredLogs: featured });
    setDiagnosis(d);
    setFeaturedLogs(featured);
    setActions(acts);
  }, []);

  const handleAction = (action: DiagnosisAction) => {
    if (!diagnosis) return;

    if (action.type === 'multi') {
      const prompt = buildMultiPromptFromDiagnosis(diagnosis);
      sessionStorage.setItem('diagnosisMultiIntent', JSON.stringify({ prompt }));
      router.push('/kokoro-chat');
    } else if (action.type === 'stay') {
      const prompt = buildStayPromptFromDiagnosis(action.persona, diagnosis);
      sessionStorage.setItem('diagnosisStayIntent', JSON.stringify({
        stayPersona: action.persona,
        prompt,
      }));
      router.push('/kokoro-chat');
    } else if (action.type === 'logs') {
      logsRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
    } catch { return ''; }
  };

  // タグ表示
  const Tag = ({ children, color }: { children: React.ReactNode; color?: string }) => (
    <span style={{
      display: 'inline-block', fontSize: 11, padding: '3px 10px',
      border: `1px solid ${color || '#e5e7eb'}`, borderRadius: 14,
      color: color || '#6b7280', background: color ? color + '10' : '#f9fafb',
      marginRight: 6, marginBottom: 4,
    }}>
      {children}
    </span>
  );

  // セクション
  const Section = ({ title, note, children, show = true }: {
    title: string; note?: string; children: React.ReactNode; show?: boolean;
  }) => {
    if (!show) return null;
    return (
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: '0.15em', color: '#7c3aed', marginBottom: 8 }}>
          // {title}
        </div>
        {children}
        {note && (
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, fontStyle: 'italic' }}>{note}</div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#fff', color: '#1a1a1a', fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 300 }}>

      {/* ① ヘッダー */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #e5e7eb', background: '#fff', position: 'sticky', top: 0, zIndex: 10 }}>
        <div>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>Kokoro</span>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: '#7c3aed', marginLeft: 4 }}>OS</span>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: '#9ca3af', marginLeft: 8, letterSpacing: '0.15em' }}>// Diagnosis</span>
        </div>
        <button onClick={() => router.push('/kokoro-chat')}
          style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: '#6b7280', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 2, padding: '6px 12px', cursor: 'pointer' }}>
          Talk に戻る
        </button>
      </header>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 20px 80px', width: '100%' }}>

        {/* フォールバック: ログ0件 */}
        {logCount === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: 18, color: '#6b7280', marginBottom: 12 }}>まだ本音ログがありません</div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 24 }}>Talkで会話してみてください</div>
            <button onClick={() => router.push('/kokoro-chat')}
              style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: '#7c3aed', background: '#ede9fe', border: 'none', borderRadius: 6, padding: '10px 24px', cursor: 'pointer' }}>
              Talk を開く →
            </button>
          </div>
        )}

        {diagnosis && (
          <>
            {/* ① タイトル */}
            <div style={{ marginBottom: 32 }}>
              <h1 style={{ fontSize: 20, fontWeight: 400, marginBottom: 6 }}>パーソナル診断</h1>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>最近の会話から見えた傾向</div>
              <div style={{ fontSize: 10, color: '#d1d5db', marginTop: 4, fontFamily: "'Space Mono', monospace" }}>
                {formatDate(diagnosis.updatedAt)} / {diagnosis.sourceLogCount}件の本音ログをもとに生成
              </div>
            </div>

            {/* ② 診断サマリー */}
            <Section title="サマリー">
              <div style={{ borderLeft: '2px solid #7c3aed', paddingLeft: 16, fontSize: 15, lineHeight: 2, color: '#1a1a1a' }}>
                {diagnosis.summary}
              </div>
            </Section>

            {/* ③ 反復テーマ */}
            <Section title="反復テーマ" note="何度も会話に現れているテーマです" show={diagnosis.coreThemes.length > 0}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {diagnosis.coreThemes.map((t, i) => <Tag key={i} color="#7c3aed">{t}</Tag>)}
              </div>
            </Section>

            {/* ④ 葛藤マップ */}
            <Section title="葛藤マップ" note="あなたの中で繰り返しぶつかっている軸です" show={diagnosis.repeatedConflicts.length > 0}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {diagnosis.repeatedConflicts.map((c, i) => <Tag key={i} color="#dc2626">{c}</Tag>)}
              </div>
            </Section>

            {/* ⑤ 人格バランス */}
            <Section title="人格バランス" note="今の会話では、この価値観が前に出やすいようです"
              show={diagnosis.personaBalance.dominant.length > 0 || diagnosis.personaBalance.suppressed.length > 0}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {diagnosis.personaBalance.dominant.length > 0 && (
                  <div style={{ fontSize: 13, color: '#374151' }}>
                    <span style={{ color: '#9ca3af', fontSize: 11, marginRight: 8 }}>強く出やすい：</span>
                    {diagnosis.personaBalance.dominant.map(p => (
                      <span key={p} style={{ color: PERSONA_COLORS[p], marginRight: 8 }}>
                        {PERSONA_EMOJIS[p]} {PERSONA_LABELS[p]}
                      </span>
                    ))}
                  </div>
                )}
                {diagnosis.personaBalance.suppressed.length > 0 && (
                  <div style={{ fontSize: 13, color: '#374151' }}>
                    <span style={{ color: '#9ca3af', fontSize: 11, marginRight: 8 }}>埋もれやすい：</span>
                    {diagnosis.personaBalance.suppressed.map(p => (
                      <span key={p} style={{ color: PERSONA_COLORS[p], marginRight: 8 }}>
                        {PERSONA_EMOJIS[p]} {PERSONA_LABELS[p]}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Section>

            {/* ⑥ 今の状態 */}
            <Section title="今の状態" note="最近の会話でよく出ている状態です"
              show={!!diagnosis.currentState && diagnosis.currentState.length > 0}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {diagnosis.currentState?.map((s, i) => <Tag key={i}>{s}</Tag>)}
              </div>
            </Section>

            {/* ⑦ 伸びしろ */}
            <Section title="伸びしろ" note="今後の対話や行動で育てられそうなポイントです"
              show={!!diagnosis.growthEdges && diagnosis.growthEdges.length > 0}>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 2, color: '#374151' }}>
                {diagnosis.growthEdges?.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            </Section>

            {/* ⑧ 注意ポイント */}
            <Section title="注意ポイント" note="繰り返し出ているので、少し気にしておくとよさそうな点です"
              show={!!diagnosis.cautionPoints && diagnosis.cautionPoints.length > 0}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {diagnosis.cautionPoints?.map((c, i) => <Tag key={i} color="#d97706">{c}</Tag>)}
              </div>
            </Section>

            {/* ⑨ 本音ログ抜粋 */}
            <div ref={logsRef}>
              <Section title="本音ログ抜粋" show={featuredLogs.length > 0}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {featuredLogs.map((log, i) => (
                    <div key={i} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Tag>{log.topic}</Tag>
                        {log.activePersona && (
                          <span style={{ fontSize: 10, color: PERSONA_COLORS[log.activePersona] }}>
                            {PERSONA_EMOJIS[log.activePersona]} {PERSONA_LABELS[log.activePersona]}固定
                          </span>
                        )}
                        <span style={{ fontSize: 9, color: '#d1d5db', marginLeft: 'auto', fontFamily: "'Space Mono', monospace" }}>
                          {formatDate(log.createdAt)}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
                        {log.deepFeeling || log.subFeeling || log.surfaceText}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </div>

            {/* ⑩ 次のアクション */}
            <Section title="次のアクション" show={actions.length > 0}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {actions.map((action, i) => (
                  <button key={i} onClick={() => handleAction(action)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '12px 16px', border: '1px solid #e5e7eb', borderRadius: 8,
                      background: action.type === 'multi' ? '#faf5ff' : action.type === 'stay' ? '#f0fdf4' : '#f9fafb',
                      cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#374151',
                      transition: 'all .15s',
                    }}>
                    <span>
                      {action.type === 'multi' && '🔄 '}
                      {action.type === 'stay' && `${PERSONA_EMOJIS[action.persona]} `}
                      {action.type === 'logs' && '📋 '}
                      {action.label}
                    </span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>→</span>
                  </button>
                ))}
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
