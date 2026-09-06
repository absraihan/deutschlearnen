import { CEFR_LEVELS, type CefrLevel } from './types';

/**
 * The CEFR difficulty engine.
 *
 * Everything the AI needs in order to speak at the learner's level is declared
 * here rather than being scattered through prompt strings, so the behaviour of
 * A1 vs B2 can be tuned in one file.
 */
export interface LevelProfile {
  level: CefrLevel;
  /** Human label used in the UI, e.g. "A1 - Beginner". */
  label: string;
  labelDe: string;
  /** Topics the tutor may draw on at this level. */
  topics: string[];
  /** Grammar the learner is expected to be working on. */
  grammar: string[];
  /** Target length of the AI reply, in words. */
  replyWords: { min: number; max: number };
  /** Target length of the expected learner answer, in words. */
  expectedUserWords: { min: number; max: number };
  /** Max clauses per AI sentence. */
  maxClausesPerSentence: number;
  /** TTS rate multiplier the tutor should be spoken at by default. */
  speechRate: number;
  /** How aggressive correction should be: 1 = only blocking errors, 0 = everything. */
  correctionThreshold: number;
  /** Instruction fragment describing register/complexity for the prompt. */
  languageGuidance: string;
  /** How explanations should be phrased at this level. */
  explanationStyle: string;
  /** Whether grammar terminology (Akkusativ, Nebensatz...) may be used. */
  allowsGrammarTerminology: boolean;
  /** Share of non-German support allowed in explanations, 0-1. */
  supportLanguageRatio: number;
}

export const LEVEL_PROFILES: Record<CefrLevel, LevelProfile> = {
  A1: {
    level: 'A1',
    label: 'A1 - Beginner',
    labelDe: 'A1 - Anfänger',
    topics: [
      'sich vorstellen',
      'Familie',
      'Zahlen',
      'Uhrzeit',
      'Wochentage',
      'Essen und Trinken',
      'Einkaufen',
      'Wohnen',
      'Hobbys',
      'Wetter',
      'einfache Reisen',
    ],
    grammar: [
      'sein',
      'haben',
      'regelmäßige Verben',
      'häufige unregelmäßige Verben',
      'Personalpronomen',
      'Artikel (der/die/das)',
      'Nominativ',
      'Akkusativ (Grundlagen)',
      'Modalverben',
      'W-Fragen und Ja/Nein-Fragen',
      'Negation (nicht/kein)',
      'einfache Satzstellung',
      'Präsens',
      'Perfekt (Grundlagen)',
    ],
    replyWords: { min: 8, max: 25 },
    expectedUserWords: { min: 3, max: 12 },
    maxClausesPerSentence: 1,
    speechRate: 0.8,
    correctionThreshold: 0.75,
    languageGuidance:
      'Use very short main clauses. Present tense and simple Perfekt only. High-frequency everyday words. No subordinate clauses. One idea per sentence.',
    explanationStyle:
      'Explain with a corrected example, not with rules. Avoid grammar jargon entirely. Maximum one short sentence.',
    allowsGrammarTerminology: false,
    supportLanguageRatio: 0.5,
  },
  A2: {
    level: 'A2',
    label: 'A2 - Elementary',
    labelDe: 'A2 - Grundlegende Kenntnisse',
    topics: [
      'Tagesablauf',
      'Reisen',
      'Gesundheit',
      'Arbeit',
      'Termine',
      'Erlebnisse',
      'Pläne',
      'Probleme beim Einkaufen',
      'Restaurant',
      'öffentliche Verkehrsmittel',
    ],
    grammar: [
      'Perfekt',
      'Präteritum häufiger Verben',
      'Dativ',
      'Wechselpräpositionen',
      'Nebensätze',
      'weil',
      'dass',
      'wenn',
      'Komparativ',
      'reflexive Verben',
      'trennbare Verben',
      'Adjektive (Grundlagen)',
    ],
    replyWords: { min: 15, max: 40 },
    expectedUserWords: { min: 8, max: 25 },
    maxClausesPerSentence: 2,
    speechRate: 0.9,
    correctionThreshold: 0.6,
    languageGuidance:
      'Short main clauses plus occasional weil/dass/wenn clauses. Perfekt for the past. Everyday vocabulary with a few new words per session.',
    explanationStyle:
      'One short German sentence explaining the rule in plain words. Simple terms like "Vergangenheit" are fine.',
    allowsGrammarTerminology: false,
    supportLanguageRatio: 0.3,
  },
  B1: {
    level: 'B1',
    label: 'B1 - Intermediate',
    labelDe: 'B1 - Fortgeschrittene Sprachverwendung',
    topics: [
      'Arbeit und Beruf',
      'Bildung',
      'Technik',
      'Beziehungen',
      'Gesellschaft',
      'Umwelt',
      'Nachrichten',
      'eigene Meinung',
      'Zukunftspläne',
      'Probleme und Lösungen',
    ],
    grammar: [
      'komplexe Nebensätze',
      'Relativsätze',
      'Passiv (Grundlagen)',
      'Konjunktiv II',
      'indirekte Fragen',
      'Konnektoren (deshalb, trotzdem, obwohl)',
      'erweiterte Satzstellung',
      'erweiterte Präpositionen',
      'Nomen-Verb-Verbindungen',
    ],
    replyWords: { min: 25, max: 60 },
    expectedUserWords: { min: 15, max: 45 },
    maxClausesPerSentence: 3,
    speechRate: 1.0,
    correctionThreshold: 0.45,
    languageGuidance:
      'Natural connected speech. Relative clauses, obwohl/trotzdem/deshalb, Konjunktiv II for politeness and hypotheses. Ask for reasons and opinions.',
    explanationStyle:
      'Grammar terminology may be used (Nebensatz, Akkusativ, Relativpronomen). Keep the explanation to one or two sentences.',
    allowsGrammarTerminology: true,
    supportLanguageRatio: 0.15,
  },
  B2: {
    level: 'B2',
    label: 'B2 - Upper intermediate',
    labelDe: 'B2 - Selbständige Sprachverwendung',
    topics: [
      'Politik',
      'Wirtschaft',
      'Technologie',
      'künstliche Intelligenz',
      'Kultur',
      'Gesellschaft',
      'Diskussionen am Arbeitsplatz',
      'abstrakte Themen',
      'Debatte',
      'Argumentation',
      'Präsentationen',
      'aktuelle Themen',
    ],
    grammar: [
      'erweiterte Konnektoren',
      'Passiv in allen Zeiten',
      'Konjunktiv II',
      'indirekte Rede (Konjunktiv I)',
      'komplexe Relativsätze',
      'Nominalisierung',
      'formelles Deutsch',
      'nuancierter Wortschatz',
      'idiomatische Wendungen',
    ],
    replyWords: { min: 35, max: 90 },
    expectedUserWords: { min: 25, max: 80 },
    maxClausesPerSentence: 4,
    speechRate: 1.0,
    correctionThreshold: 0.3,
    languageGuidance:
      'Near-native register. Argue, concede, nuance. Use idiomatic expressions and precise vocabulary. Challenge the learner to justify positions.',
    explanationStyle:
      'Full grammatical explanation plus a more idiomatic alternative formulation the learner could have used.',
    allowsGrammarTerminology: true,
    supportLanguageRatio: 0.05,
  },
};

export function getLevelProfile(level: CefrLevel): LevelProfile {
  return LEVEL_PROFILES[level];
}

export function levelIndex(level: CefrLevel): number {
  return CEFR_LEVELS.indexOf(level);
}

export function isValidLevel(value: unknown): value is CefrLevel {
  return typeof value === 'string' && (CEFR_LEVELS as readonly string[]).includes(value);
}

/** One step up, capped at B2. Never jumps two levels. */
export function nextLevel(level: CefrLevel): CefrLevel {
  const i = levelIndex(level);
  return CEFR_LEVELS[Math.min(i + 1, CEFR_LEVELS.length - 1)]!;
}

/** One step down, floored at A1. */
export function previousLevel(level: CefrLevel): CefrLevel {
  const i = levelIndex(level);
  return CEFR_LEVELS[Math.max(i - 1, 0)]!;
}

/** Negative when a is easier than b. */
export function compareLevels(a: CefrLevel, b: CefrLevel): number {
  return levelIndex(a) - levelIndex(b);
}

/** Grammar from A1 up to and including the given level. */
export function cumulativeGrammar(level: CefrLevel): string[] {
  const upTo = levelIndex(level);
  return CEFR_LEVELS.slice(0, upTo + 1).flatMap((l) => LEVEL_PROFILES[l].grammar);
}

export function cumulativeTopics(level: CefrLevel): string[] {
  const upTo = levelIndex(level);
  return CEFR_LEVELS.slice(0, upTo + 1).flatMap((l) => LEVEL_PROFILES[l].topics);
}

/**
 * Fractional position inside a CEFR band, 0-1. Adaptive difficulty moves this
 * smoothly so the learner never jumps a whole band mid-conversation.
 * 0 = easiest end of the band, 1 = ready for the next band.
 */
export interface DifficultyState {
  level: CefrLevel;
  progress: number;
}

export const DIFFICULTY_STEP_UP = 0.12;
export const DIFFICULTY_STEP_DOWN = 0.18;

/**
 * Adjust difficulty from the accuracy of recent turns. Demotion is faster than
 * promotion so a struggling learner gets relief quickly, and promotion only
 * happens after sustained success at the top of a band.
 */
export function adjustDifficulty(
  state: DifficultyState,
  input: { accuracy: number; turns: number },
): DifficultyState {
  if (input.turns < 3) return state;
  const { accuracy } = input;
  let { level, progress } = state;

  if (accuracy >= 0.85) progress += DIFFICULTY_STEP_UP;
  else if (accuracy <= 0.5) progress -= DIFFICULTY_STEP_DOWN;
  else if (accuracy >= 0.7) progress += DIFFICULTY_STEP_UP / 2;

  if (progress >= 1) {
    const promoted = nextLevel(level);
    if (promoted === level) {
      progress = 1;
    } else {
      level = promoted;
      progress = 0.25;
    }
  } else if (progress < 0) {
    const demoted = previousLevel(level);
    if (demoted === level) {
      progress = 0;
    } else {
      level = demoted;
      progress = 0.7;
    }
  }

  return { level, progress: Math.min(1, Math.max(0, progress)) };
}

/**
 * Turn a difficulty state into a prompt nudge, so the tutor can sit at the easy
 * or hard end of a band without the band itself changing.
 */
export function difficultyGuidance(state: DifficultyState): string {
  if (state.progress < 0.33) {
    return 'The learner is at the easy end of this level: keep sentences at the shorter end of the range and reuse familiar vocabulary.';
  }
  if (state.progress < 0.7) {
    return 'The learner is comfortable at this level: use the full range of structures for this level.';
  }
  return 'The learner is close to the next level: use the longer end of the range and introduce a few structures from the next level.';
}
