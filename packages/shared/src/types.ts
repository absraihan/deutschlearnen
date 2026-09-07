/**
 * Core domain types for DeutschLearnen.
 * These are shared by the mobile app, the server and the AI layer, so that a
 * change to the learning model is a change in exactly one place.
 */

/** CEFR levels supported by the app. */
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** How much correction feedback the learner wants to see. */
export const CORRECTION_MODES = ['OFF', 'MINIMAL', 'NORMAL', 'DETAILED'] as const;
export type CorrectionMode = (typeof CORRECTION_MODES)[number];

/** Practice surfaces. Each one reuses the same tutor core with a different framing. */
export const SESSION_KINDS = [
  'conversation',
  'roleplay',
  'daily',
  'listening',
  'shadowing',
  'exam',
  'mistake-drill',
  'text',
] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

/** Who produced a message. */
export type Speaker = 'user' | 'ai';

/** Explanation languages available next to German. */
export const EXPLANATION_LANGUAGES = ['de', 'en', 'bn'] as const;
export type ExplanationLanguage = (typeof EXPLANATION_LANGUAGES)[number];

/** Grammar/vocabulary error families used by the mistake memory. */
export const MISTAKE_CATEGORIES = [
  'article',
  'case',
  'gender',
  'verb-conjugation',
  'tense',
  'auxiliary-verb',
  'word-order',
  'preposition',
  'adjective-ending',
  'plural',
  'negation',
  'separable-verb',
  'reflexive',
  'subordinate-clause',
  'connector',
  'vocabulary',
  'spelling',
  'pronunciation',
  'unnatural-phrasing',
  'missing-word',
  'other',
] as const;
export type MistakeCategory = (typeof MISTAKE_CATEGORIES)[number];

export type VocabularyStatus = 'new' | 'learning' | 'mastered';

/** Persisted user preferences. Single row (id = 1) in the local database. */
export interface UserSettings {
  appName: string;
  currentLevel: CefrLevel;
  targetLevel: CefrLevel;
  correctionMode: CorrectionMode;
  /** TTS rate multiplier, 0.5 - 1.5. */
  voiceSpeed: number;
  /** Preferred TTS voice identifier, provider specific. Empty = system default. */
  aiVoice: string;
  /** Daily speaking goal in minutes. */
  dailyGoalMinutes: number;
  banglaExplanations: boolean;
  englishExplanations: boolean;
  autoCorrection: boolean;
  saveConversations: boolean;
  saveAudioRecordings: boolean;
  /** 'cloud' = record and transcribe on the server, 'native' = on-device recognizer. */
  speechEngine: 'cloud' | 'native';
  /** 'device' = expo-speech, 'server' = server TTS provider. */
  ttsEngine: 'device' | 'server';
  adaptiveDifficulty: boolean;
  hapticsEnabled: boolean;
  theme: 'system' | 'light' | 'dark';
  /**
   * The learner's own AI key, stored only on this device and sent per request.
   * Empty means the server uses its own key, when it is configured to allow it.
   */
  userAiKey: string;
}

export interface ConversationSession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  level: CefrLevel;
  topicId: string;
  modeId: string;
  kind: SessionKind;
  /** Seconds of elapsed session time. */
  durationSec: number;
  messageCount: number;
  overallScore: number | null;
  grammarScore: number | null;
  fluencyScore: number | null;
  vocabularyScore: number | null;
  pronunciationScore: number | null;
  /** Short German summary used as long-term context for later sessions. */
  summary: string | null;
  completed: boolean;
}

export interface ConversationMessage {
  id: string;
  sessionId: string;
  speaker: Speaker;
  text: string;
  createdAt: string;
  audioUri: string | null;
  correctedText: string | null;
  /** Speech recogniser confidence 0-1 when available. */
  confidence: number | null;
}

export interface CorrectionRecord {
  id: string;
  sessionId: string;
  messageId: string;
  original: string;
  corrected: string;
  explanation: string;
  explanationBn: string | null;
  explanationEn: string | null;
  category: MistakeCategory;
  severity: 'minor' | 'important' | 'critical';
  naturalAlternative: string | null;
  createdAt: string;
}

export interface MistakeRecord {
  id: string;
  category: MistakeCategory;
  wrongText: string;
  correctText: string;
  explanation: string;
  level: CefrLevel;
  count: number;
  firstSeen: string;
  lastSeen: string;
  /** Successful drill repetitions since the last failure. */
  correctStreak: number;
  mastered: boolean;
}

export interface VocabularyItem {
  id: string;
  german: string;
  english: string;
  bangla: string | null;
  /** 'der' | 'die' | 'das' for nouns, null otherwise. */
  article: string | null;
  wordType: string | null;
  exampleSentence: string;
  exampleTranslation: string | null;
  level: CefrLevel;
  category: string;
  status: VocabularyStatus;
  favorite: boolean;
  timesSeen: number;
  timesCorrect: number;
  createdAt: string;
  lastReviewedAt: string | null;
  /** Next spaced-repetition due date (ISO). Extension point for full SRS. */
  dueAt: string | null;
}

export interface PracticeExercise {
  id: string;
  mistakeId: string | null;
  type: 'fill-blank' | 'reorder' | 'transform' | 'speak';
  prompt: string;
  answer: string;
  hint: string | null;
  explanation: string | null;
  level: CefrLevel;
  createdAt: string;
  completedAt: string | null;
  wasCorrect: boolean | null;
}

export interface DailyGoalRecord {
  /** YYYY-MM-DD */
  date: string;
  goalMinutes: number;
  achievedMinutes: number;
  sessionsCompleted: number;
  completed: boolean;
}

export interface ProgressRecord {
  /** YYYY-MM-DD */
  date: string;
  speakingMinutes: number;
  sessions: number;
  messages: number;
  grammarScore: number | null;
  vocabularyScore: number | null;
  fluencyScore: number | null;
  pronunciationScore: number | null;
  overallScore: number | null;
  newWords: number;
  mistakesMade: number;
}

/** Aggregate shown on the dashboard. */
export interface ProgressSummary {
  currentLevel: CefrLevel;
  targetLevel: CefrLevel;
  streakDays: number;
  totalSpeakingMinutes: number;
  totalSessions: number;
  totalMessages: number;
  wordsLearned: number;
  activeMistakes: number;
  averageOverallScore: number | null;
  averageGrammarScore: number | null;
  averageVocabularyScore: number | null;
  averageFluencyScore: number | null;
  todayMinutes: number;
  dailyGoalMinutes: number;
  weekly: ProgressRecord[];
}

/** Compact learner profile sent to the AI. Deliberately small to control cost. */
export interface LearnerContext {
  level: CefrLevel;
  targetLevel: CefrLevel;
  correctionMode: CorrectionMode;
  explanationLanguages: ExplanationLanguage[];
  /** At most a handful, highest-count first. */
  frequentMistakes: Array<{
    category: MistakeCategory;
    wrongText: string;
    correctText: string;
    count: number;
  }>;
  /** Words the learner already met, so the AI can reuse them. */
  knownVocabulary: string[];
  /** Grammar areas the learner is weak in, derived from mistake counts. */
  weakAreas: string[];
  /** One-line German summary of previous sessions. */
  longTermSummary: string | null;
  /** Rolling accuracy 0-1 across recent turns, drives adaptive difficulty. */
  recentAccuracy: number | null;
}

export interface TurnMessage {
  speaker: Speaker;
  text: string;
}
