/* ── Kokoro Profile ── */

export type KokoroProfile = {
  explicit: {
    age_range?: string;
    gender_expression?: string;
    style_keywords?: string[];
    favorite_things?: string[];
    disliked_things?: string[];
    music_tastes?: string[];
    life_context?: string;
  };
  inferred: {
    fashion_axes?: {
      rawness?: number;
      silence?: number;
      contradiction?: number;
      polish?: number;
    };
    taste_clusters?: string[];
    emotional_pattern?: string;
    style_axes?: Record<string, number>;
  };
  meta: {
    last_updated_at: string;
    completeness_score: number;
    session_question_count: number;
    field_last_asked: Record<string, string>;
  };
};

const STORAGE_KEY = 'kokoroProfile';
const SESSION_KEY = 'kokoroProfileSessionCount';

function defaultProfile(): KokoroProfile {
  return {
    explicit: {},
    inferred: {},
    meta: {
      last_updated_at: new Date().toISOString(),
      completeness_score: 0,
      session_question_count: 0,
      field_last_asked: {},
    },
  };
}

export function getProfile(): KokoroProfile {
  if (typeof window === 'undefined') return defaultProfile();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProfile();
    const parsed = JSON.parse(raw) as KokoroProfile;
    // sessionカウントはsessionStorageから復元
    const sessionCount = sessionStorage.getItem(SESSION_KEY);
    parsed.meta.session_question_count = sessionCount ? parseInt(sessionCount, 10) : 0;
    return parsed;
  } catch {
    return defaultProfile();
  }
}

function saveProfile(profile: KokoroProfile): void {
  profile.meta.last_updated_at = new Date().toISOString();
  profile.meta.completeness_score = calcCompleteness(profile);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  sessionStorage.setItem(SESSION_KEY, String(profile.meta.session_question_count));
}

export function updateExplicit(field: string, value: unknown): void {
  const p = getProfile();
  (p.explicit as Record<string, unknown>)[field] = value;
  saveProfile(p);
}

export function updateInferred(field: string, value: unknown): void {
  const p = getProfile();
  (p.inferred as Record<string, unknown>)[field] = value;
  saveProfile(p);
}

export function calcCompleteness(profile?: KokoroProfile): number {
  const p = profile || getProfile();
  const fields = [
    p.explicit.age_range,
    p.explicit.gender_expression,
    p.explicit.style_keywords?.length,
    p.explicit.favorite_things?.length,
    p.explicit.disliked_things?.length,
    p.explicit.music_tastes?.length,
    p.explicit.life_context,
  ];
  const filled = fields.filter(v => v !== undefined && v !== null && v !== 0).length;
  return Math.round((filled / fields.length) * 100) / 100;
}

export function canAskQuestion(field: string): boolean {
  const p = getProfile();

  // 1セッション最大2問まで
  if (p.meta.session_question_count >= 2) return false;

  // 同一フィールドは14日以内に再質問しない
  const lastAsked = p.meta.field_last_asked[field];
  if (lastAsked) {
    const diff = Date.now() - new Date(lastAsked).getTime();
    const days14 = 14 * 24 * 60 * 60 * 1000;
    if (diff < days14) return false;
  }

  return true;
}

export function markQuestionAsked(field: string): void {
  const p = getProfile();
  p.meta.session_question_count += 1;
  p.meta.field_last_asked[field] = new Date().toISOString();
  saveProfile(p);
}
