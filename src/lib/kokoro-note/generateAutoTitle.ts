import type { KokoroNoteDraft } from '@/types/noteMeta';

const INSIGHT_LABEL: Record<string, string> = {
  contradiction: '矛盾',
  emotion:       '感情の揺れ',
  pattern:       '反復',
  desire:        '欲求',
  avoidance:     '回避',
};

const DESIRE_WORDS = ['したい', 'ほしい', '望んで', '本当は', 'なりたい'];
const CONFLICT_WORDS = ['でも', 'けど', 'だけど', 'なのに', '一方で'];

export function generateAutoTitle(params: {
  body: string;
  topic?: string;
  insightType?: KokoroNoteDraft['insightType'];
  emotionTone?: string[];
}): string {
  const { body, topic, insightType, emotionTone } = params;

  const emotion = emotionTone?.[0] ?? '';
  const insight = insightType ? INSIGHT_LABEL[insightType] : '';
  const hasDesire   = DESIRE_WORDS.some(w => body.includes(w));
  const hasConflict = CONFLICT_WORDS.some(w => body.includes(w));

  // 型A: テーマ + 感情
  if (topic && emotion) {
    return trim28(`${topic}における${emotion}の${insight || '揺れ'}`);
  }

  // 型B: 欲求 + 衝突
  if (hasDesire && hasConflict) {
    return trim28(`${topic ?? ''}への欲求と${emotion || '葛藤'}の衝突`);
  }

  // 型C: パターン + テーマ
  if (insightType === 'pattern' && topic) {
    return trim28(`${topic}で繰り返す思考の型`);
  }

  // 型D: 認識のズレ
  if (insightType === 'contradiction') {
    return trim28(`${topic ?? ''}での自己認識と現実のズレ`);
  }

  // 型E: 感情の輪郭化
  if (emotion) {
    return trim28(`${emotion}の感覚とその輪郭`);
  }

  // フォールバック：本文の先頭
  return trim28(body.slice(0, 24));
}

function trim28(s: string): string {
  return s.replace(/^の|^での|^における/, '').slice(0, 28);
}
