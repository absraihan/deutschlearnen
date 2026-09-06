import { getLevelProfile } from './cefr';
import type { CefrLevel, MistakeCategory, ProgressRecord } from './types';

/**
 * Local, deterministic scoring.
 *
 * The AI produces the nuanced end-of-session evaluation, but the app must still
 * work when the network is down and must never show an empty score screen.
 * These heuristics are the offline fallback and also sanity-bound the AI output.
 */

export interface TurnStat {
  /** Words in the learner turn. */
  words: number;
  /** Distinct words in the learner turn. */
  uniqueWords: number;
  hadCorrection: boolean;
  severity: 'minor' | 'important' | 'critical' | null;
  /** 0-1 from the AI, when available. */
  accuracy: number | null;
  /** Speech recogniser confidence, when the turn came from the microphone. */
  sttConfidence: number | null;
}

export interface HeuristicScores {
  grammarScore: number;
  vocabularyScore: number;
  fluencyScore: number;
  pronunciationScore: number | null;
  overallScore: number;
}

const SEVERITY_PENALTY: Record<'minor' | 'important' | 'critical', number> = {
  minor: 4,
  important: 9,
  critical: 15,
};

function clamp(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, n));
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Score a session from its turns, judged relative to the level: an A1 learner
 * producing 6 correct words is doing well, a B2 learner is not.
 */
export function computeHeuristicScores(
  turns: TurnStat[],
  level: CefrLevel,
): HeuristicScores {
  if (turns.length === 0) {
    return {
      grammarScore: 0,
      vocabularyScore: 0,
      fluencyScore: 0,
      pronunciationScore: null,
      overallScore: 0,
    };
  }

  const profile = getLevelProfile(level);

  // Grammar: start at 100, subtract weighted penalties per turn.
  const penalty =
    turns.reduce((sum, t) => sum + (t.severity ? SEVERITY_PENALTY[t.severity] : 0), 0) /
    turns.length;
  const aiAccuracy = turns.filter((t) => t.accuracy !== null);
  const aiGrammar =
    aiAccuracy.length > 0
      ? (aiAccuracy.reduce((s, t) => s + (t.accuracy ?? 0), 0) / aiAccuracy.length) * 100
      : null;
  const grammarHeuristic = clamp(100 - penalty * 2.2);
  const grammarScore =
    aiGrammar === null ? grammarHeuristic : clamp(aiGrammar * 0.6 + grammarHeuristic * 0.4);

  // Vocabulary: lexical variety against the expected range for the level.
  const totalWords = turns.reduce((s, t) => s + t.words, 0);
  const totalUnique = turns.reduce((s, t) => s + t.uniqueWords, 0);
  const variety = totalWords > 0 ? totalUnique / totalWords : 0;
  const avgWords = totalWords / turns.length;
  const lengthRatio = clamp((avgWords / profile.expectedUserWords.min) * 60, 0, 100);
  const vocabularyScore = clamp(variety * 55 + lengthRatio * 0.55);

  // Fluency: turn length against the level target, plus consistency across turns.
  const target = (profile.expectedUserWords.min + profile.expectedUserWords.max) / 2;
  const lengthScore = clamp(100 - (Math.abs(avgWords - target) / target) * 70);
  const spread =
    turns.length > 1
      ? Math.sqrt(
          turns.reduce((s, t) => s + (t.words - avgWords) ** 2, 0) / (turns.length - 1),
        )
      : 0;
  const consistency = clamp(100 - (spread / Math.max(target, 1)) * 45);
  const fluencyScore = clamp(lengthScore * 0.65 + consistency * 0.35);

  // Pronunciation: only an estimate, and only when the recogniser gave confidence.
  const confidences = turns.map((t) => t.sttConfidence).filter((c): c is number => c !== null);
  const pronunciationScore =
    confidences.length >= 2
      ? clamp((confidences.reduce((s, c) => s + c, 0) / confidences.length) * 100)
      : null;

  const overallScore = clamp(
    grammarScore * 0.4 +
      fluencyScore * 0.3 +
      vocabularyScore * 0.2 +
      (pronunciationScore ?? fluencyScore) * 0.1,
  );

  return {
    grammarScore: round(grammarScore),
    vocabularyScore: round(vocabularyScore),
    fluencyScore: round(fluencyScore),
    pronunciationScore: pronunciationScore === null ? null : round(pronunciationScore),
    overallScore: round(overallScore),
  };
}

/** Words / unique words for one learner utterance, umlaut- and ß-aware. */
export function turnWordStats(text: string): { words: number; uniqueWords: number } {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return { words: tokens.length, uniqueWords: new Set(tokens).size };
}

/** Rolling accuracy over the most recent turns, used by adaptive difficulty. */
export function recentAccuracy(turns: TurnStat[], window = 8): number | null {
  const slice = turns.slice(-window);
  if (slice.length === 0) return null;
  const withAccuracy = slice.filter((t) => t.accuracy !== null);
  if (withAccuracy.length > 0) {
    return (
      withAccuracy.reduce((s, t) => s + (t.accuracy ?? 0), 0) / withAccuracy.length
    );
  }
  const clean = slice.filter((t) => !t.hadCorrection).length;
  return clean / slice.length;
}

/**
 * Consecutive-day streak ending today (or yesterday, so an unfinished today
 * does not reset a streak the learner is about to continue).
 */
export function computeStreak(activeDates: string[], today: string): number {
  const set = new Set(activeDates);
  const start = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return 0;

  let cursor = new Date(start);
  if (!set.has(toDateKey(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!set.has(toDateKey(cursor))) return 0;
  }

  let streak = 0;
  while (set.has(toDateKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Last `days` days ending today, filling gaps with empty records. */
export function fillProgressWindow(
  records: ProgressRecord[],
  today: string,
  days = 7,
): ProgressRecord[] {
  const byDate = new Map(records.map((r) => [r.date, r]));
  const out: ProgressRecord[] = [];
  const end = new Date(`${today}T00:00:00Z`);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    const key = toDateKey(d);
    out.push(
      byDate.get(key) ?? {
        date: key,
        speakingMinutes: 0,
        sessions: 0,
        messages: 0,
        grammarScore: null,
        vocabularyScore: null,
        fluencyScore: null,
        pronunciationScore: null,
        overallScore: null,
        newWords: 0,
        mistakesMade: 0,
      },
    );
  }
  return out;
}

/** Grammar areas to focus on, most damaging first. */
export function deriveWeakAreas(
  mistakes: Array<{ category: MistakeCategory; count: number }>,
  limit = 5,
): string[] {
  const totals = new Map<MistakeCategory, number>();
  for (const m of mistakes) {
    totals.set(m.category, (totals.get(m.category) ?? 0) + m.count);
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([category]) => CATEGORY_LABELS_DE[category]);
}

export const CATEGORY_LABELS_DE: Record<MistakeCategory, string> = {
  article: 'Artikel',
  case: 'Kasus',
  gender: 'Genus',
  'verb-conjugation': 'Verbkonjugation',
  tense: 'Zeitform',
  'auxiliary-verb': 'Hilfsverb (sein/haben)',
  'word-order': 'Satzstellung',
  preposition: 'Präpositionen',
  'adjective-ending': 'Adjektivendungen',
  plural: 'Plural',
  negation: 'Negation',
  'separable-verb': 'trennbare Verben',
  reflexive: 'reflexive Verben',
  'subordinate-clause': 'Nebensätze',
  connector: 'Konnektoren',
  vocabulary: 'Wortschatz',
  spelling: 'Rechtschreibung',
  pronunciation: 'Aussprache',
  'unnatural-phrasing': 'unnatürliche Formulierung',
  'missing-word': 'fehlende Wörter',
  other: 'Sonstiges',
};

export const CATEGORY_LABELS_EN: Record<MistakeCategory, string> = {
  article: 'Articles',
  case: 'Cases',
  gender: 'Gender',
  'verb-conjugation': 'Verb conjugation',
  tense: 'Tense',
  'auxiliary-verb': 'Auxiliary verb (sein/haben)',
  'word-order': 'Word order',
  preposition: 'Prepositions',
  'adjective-ending': 'Adjective endings',
  plural: 'Plurals',
  negation: 'Negation',
  'separable-verb': 'Separable verbs',
  reflexive: 'Reflexive verbs',
  'subordinate-clause': 'Subordinate clauses',
  connector: 'Connectors',
  vocabulary: 'Vocabulary',
  spelling: 'Spelling',
  pronunciation: 'Pronunciation',
  'unnatural-phrasing': 'Unnatural phrasing',
  'missing-word': 'Missing words',
  other: 'Other',
};

/**
 * A mistake counts as mastered once the learner has produced the structure
 * correctly several times in a row after having got it wrong.
 */
export const MASTERY_STREAK = 4;

export function isMastered(record: { correctStreak: number; mastered: boolean }): boolean {
  return record.mastered || record.correctStreak >= MASTERY_STREAK;
}

/** Normalise a sentence for duplicate-mistake detection. */
export function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:"'()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
