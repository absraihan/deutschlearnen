import { z } from 'zod';
import {
  CEFR_LEVELS,
  CORRECTION_MODES,
  EXPLANATION_LANGUAGES,
  MISTAKE_CATEGORIES,
  SESSION_KINDS,
} from './types';

/**
 * Every contract in the app - AI output and HTTP payloads - is declared here as
 * a Zod schema. The AI is asked for JSON that matches `TutorTurnSchema`; if it
 * drifts, validation fails loudly and the caller falls back gracefully instead
 * of silently rendering nonsense.
 */

export const CefrLevelSchema = z.enum(CEFR_LEVELS);
export const CorrectionModeSchema = z.enum(CORRECTION_MODES);
export const MistakeCategorySchema = z.enum(MISTAKE_CATEGORIES);
export const SessionKindSchema = z.enum(SESSION_KINDS);
export const ExplanationLanguageSchema = z.enum(EXPLANATION_LANGUAGES);
export const SpeakerSchema = z.enum(['user', 'ai']);

/* ------------------------------------------------------------------ *
 * Structured AI output
 * ------------------------------------------------------------------ */

export const CorrectionSchema = z.object({
  hasError: z.boolean(),
  /** The learner sentence as spoken. */
  original: z.string().default(''),
  /** The corrected German sentence. */
  corrected: z.string().default(''),
  /** Short explanation, in German. */
  explanation: z.string().default(''),
  /** Optional Bangla explanation when the learner enabled it. */
  explanationBn: z.string().nullable().default(null),
  /** Optional English explanation when the learner enabled it. */
  explanationEn: z.string().nullable().default(null),
  category: MistakeCategorySchema.default('other'),
  severity: z.enum(['minor', 'important', 'critical']).default('important'),
  /** A more idiomatic way to say the same thing (mostly B1/B2). */
  naturalAlternative: z.string().nullable().default(null),
});
export type Correction = z.infer<typeof CorrectionSchema>;

export const VocabularySuggestionSchema = z.object({
  german: z.string(),
  english: z.string().default(''),
  bangla: z.string().nullable().default(null),
  /** der/die/das for nouns. */
  article: z.string().nullable().default(null),
  wordType: z.string().nullable().default(null),
  example: z.string().default(''),
  exampleTranslation: z.string().nullable().default(null),
  level: CefrLevelSchema.default('A1'),
  category: z.string().default('allgemein'),
});
export type VocabularySuggestion = z.infer<typeof VocabularySuggestionSchema>;

/** The single structured object every conversation turn returns. */
export const TutorTurnSchema = z.object({
  /** What the tutor says, in German. Spoken aloud by TTS. */
  reply: z.string().min(1),
  correction: CorrectionSchema.nullable().default(null),
  /** 0-2 words worth saving from this exchange. */
  vocabulary: z.array(VocabularySuggestionSchema).max(4).default([]),
  /** The level the reply was actually written at. */
  difficulty: CefrLevelSchema,
  /** One follow-up question, already contained in `reply`; repeated for the UI. */
  followUpQuestion: z.string().nullable().default(null),
  /** 0-1 estimate of how correct and appropriate the learner turn was. */
  turnAccuracy: z.number().min(0).max(1).nullable().default(null),
  /** True when the learner input was too short/unclear to work with. */
  needsRetry: z.boolean().default(false),
});
export type TutorTurn = z.infer<typeof TutorTurnSchema>;

/** Deeper, on-demand analysis of one sentence (used by the correction screen). */
export const GrammarAnalysisSchema = z.object({
  original: z.string(),
  corrected: z.string(),
  isCorrect: z.boolean(),
  issues: z
    .array(
      z.object({
        category: MistakeCategorySchema,
        excerpt: z.string().default(''),
        explanation: z.string(),
        explanationBn: z.string().nullable().default(null),
        explanationEn: z.string().nullable().default(null),
        severity: z.enum(['minor', 'important', 'critical']).default('important'),
      }),
    )
    .default([]),
  naturalAlternatives: z.array(z.string()).default([]),
  /** 0-100. */
  score: z.number().min(0).max(100).default(100),
});
export type GrammarAnalysis = z.infer<typeof GrammarAnalysisSchema>;

/**
 * Pronunciation feedback. `method` makes the confidence explicit: we never
 * present a transcript-based estimate as if it were verified phoneme scoring.
 */
export const PronunciationAnalysisSchema = z.object({
  method: z.enum(['estimated-from-transcript', 'verified-audio-scoring']),
  /** 0-100, null when the provider cannot support it. */
  score: z.number().min(0).max(100).nullable().default(null),
  confidenceNote: z.string().default(''),
  difficultSounds: z
    .array(
      z.object({
        sound: z.string(),
        word: z.string().default(''),
        advice: z.string(),
      }),
    )
    .default([]),
  rhythmAdvice: z.string().nullable().default(null),
  wordStressAdvice: z.string().nullable().default(null),
});
export type PronunciationAnalysis = z.infer<typeof PronunciationAnalysisSchema>;

export const ExerciseSchema = z.object({
  type: z.enum(['fill-blank', 'reorder', 'transform', 'speak']),
  prompt: z.string(),
  answer: z.string(),
  hint: z.string().nullable().default(null),
  explanation: z.string().nullable().default(null),
  level: CefrLevelSchema,
});
export type Exercise = z.infer<typeof ExerciseSchema>;

export const ExerciseSetSchema = z.object({
  intro: z.string().default(''),
  exercises: z.array(ExerciseSchema).min(1).max(10),
});
export type ExerciseSet = z.infer<typeof ExerciseSetSchema>;

export const SessionEvaluationSchema = z.object({
  overallScore: z.number().min(0).max(100),
  grammarScore: z.number().min(0).max(100),
  vocabularyScore: z.number().min(0).max(100),
  fluencyScore: z.number().min(0).max(100),
  pronunciationScore: z.number().min(0).max(100).nullable().default(null),
  /** Encouraging German summary, 1-3 sentences. */
  summary: z.string(),
  summaryEn: z.string().nullable().default(null),
  strengths: z.array(z.string()).default([]),
  focusAreas: z.array(z.string()).default([]),
  /** Compact German memory line carried into future sessions. */
  longTermNote: z.string().default(''),
  recommendedLevel: CefrLevelSchema.nullable().default(null),
});
export type SessionEvaluation = z.infer<typeof SessionEvaluationSchema>;

export const ListeningItemSchema = z.object({
  text: z.string(),
  question: z.string(),
  expectedAnswer: z.string(),
  translationEn: z.string().nullable().default(null),
});
export type ListeningItem = z.infer<typeof ListeningItemSchema>;

export const ShadowingSetSchema = z.object({
  sentences: z.array(
    z.object({
      text: z.string(),
      focus: z.string().default(''),
      translationEn: z.string().nullable().default(null),
    }),
  ),
});
export type ShadowingSet = z.infer<typeof ShadowingSetSchema>;

/* ------------------------------------------------------------------ *
 * Learner context sent to the server (kept intentionally small)
 * ------------------------------------------------------------------ */

export const LearnerContextSchema = z.object({
  level: CefrLevelSchema,
  targetLevel: CefrLevelSchema.default('B2'),
  correctionMode: CorrectionModeSchema.default('NORMAL'),
  explanationLanguages: z.array(ExplanationLanguageSchema).default(['de']),
  frequentMistakes: z
    .array(
      z.object({
        category: MistakeCategorySchema,
        wrongText: z.string(),
        correctText: z.string(),
        count: z.number().int().nonnegative(),
      }),
    )
    .max(8)
    .default([]),
  knownVocabulary: z.array(z.string()).max(60).default([]),
  weakAreas: z.array(z.string()).max(8).default([]),
  longTermSummary: z.string().nullable().default(null),
  recentAccuracy: z.number().min(0).max(1).nullable().default(null),
  difficultyProgress: z.number().min(0).max(1).default(0.5),
});

export const TurnMessageSchema = z.object({
  speaker: SpeakerSchema,
  text: z.string(),
});

/* ------------------------------------------------------------------ *
 * HTTP contracts
 * ------------------------------------------------------------------ */

export const RespondRequestSchema = z.object({
  sessionId: z.string(),
  kind: SessionKindSchema.default('conversation'),
  modeId: z.string().default('free'),
  roleplayId: z.string().nullable().default(null),
  topic: z.string().nullable().default(null),
  /** Recent turns only. The server trims further. */
  history: z.array(TurnMessageSchema).max(40).default([]),
  /** Running summary of everything older than `history`. */
  runningSummary: z.string().nullable().default(null),
  userText: z.string().min(1),
  /** Speech recogniser confidence when the turn came from the microphone. */
  sttConfidence: z.number().min(0).max(1).nullable().default(null),
  learner: LearnerContextSchema,
});
export type RespondRequest = z.infer<typeof RespondRequestSchema>;

export const RespondResponseSchema = z.object({
  turn: TutorTurnSchema,
  /** Set when the running summary was refreshed this turn. */
  runningSummary: z.string().nullable().default(null),
  usage: z
    .object({
      promptTokens: z.number().nullable().default(null),
      completionTokens: z.number().nullable().default(null),
      cached: z.boolean().default(false),
    })
    .nullable()
    .default(null),
});
export type RespondResponse = z.infer<typeof RespondResponseSchema>;

export const AnalyzeRequestSchema = z.object({
  text: z.string().min(1),
  level: CefrLevelSchema,
  explanationLanguages: z.array(ExplanationLanguageSchema).default(['de']),
  context: z.string().nullable().default(null),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const EvaluateSpeakingRequestSchema = z.object({
  transcript: z.string().min(1),
  targetText: z.string().nullable().default(null),
  level: CefrLevelSchema,
  sttConfidence: z.number().min(0).max(1).nullable().default(null),
  hasAudioScoring: z.boolean().default(false),
});
export type EvaluateSpeakingRequest = z.infer<typeof EvaluateSpeakingRequestSchema>;

export const GenerateVocabularyRequestSchema = z.object({
  level: CefrLevelSchema,
  topic: z.string(),
  count: z.number().int().min(1).max(20).default(8),
  includeBangla: z.boolean().default(true),
  exclude: z.array(z.string()).max(100).default([]),
});
export type GenerateVocabularyRequest = z.infer<typeof GenerateVocabularyRequestSchema>;

export const GenerateExerciseRequestSchema = z.object({
  level: CefrLevelSchema,
  count: z.number().int().min(1).max(10).default(5),
  /** Mistakes to build targeted drills from. */
  mistakes: z
    .array(
      z.object({
        category: MistakeCategorySchema,
        wrongText: z.string(),
        correctText: z.string(),
        explanation: z.string().default(''),
      }),
    )
    .max(10)
    .default([]),
  focusArea: z.string().nullable().default(null),
  includeBangla: z.boolean().default(false),
});
export type GenerateExerciseRequest = z.infer<typeof GenerateExerciseRequestSchema>;

export const SessionSummaryRequestSchema = z.object({
  sessionId: z.string(),
  level: CefrLevelSchema,
  kind: SessionKindSchema.default('conversation'),
  topic: z.string().nullable().default(null),
  durationSec: z.number().nonnegative().default(0),
  messages: z.array(TurnMessageSchema).max(60),
  corrections: z
    .array(
      z.object({
        category: MistakeCategorySchema,
        original: z.string(),
        corrected: z.string(),
      }),
    )
    .max(40)
    .default([]),
  explanationLanguages: z.array(ExplanationLanguageSchema).default(['de']),
  hasPronunciationData: z.boolean().default(false),
});
export type SessionSummaryRequest = z.infer<typeof SessionSummaryRequestSchema>;

export const ListeningRequestSchema = z.object({
  level: CefrLevelSchema,
  topic: z.string().default('Alltag'),
  count: z.number().int().min(1).max(6).default(3),
});
export type ListeningRequest = z.infer<typeof ListeningRequestSchema>;

export const ShadowingRequestSchema = z.object({
  level: CefrLevelSchema,
  topic: z.string().default('Alltag'),
  count: z.number().int().min(1).max(10).default(5),
  /** Sounds the learner struggles with, to bias sentence selection. */
  focusSounds: z.array(z.string()).max(8).default([]),
});
export type ShadowingRequest = z.infer<typeof ShadowingRequestSchema>;

export const TranscribeResponseSchema = z.object({
  text: z.string(),
  language: z.string().default('de'),
  confidence: z.number().min(0).max(1).nullable().default(null),
  durationSec: z.number().nullable().default(null),
});
export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;

export const SpeakRequestSchema = z.object({
  text: z.string().min(1).max(2000),
  voice: z.string().nullable().default(null),
  speed: z.number().min(0.5).max(1.5).default(1),
  format: z.enum(['mp3']).default('mp3'),
});
export type SpeakRequest = z.infer<typeof SpeakRequestSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    /** German message safe to show to the learner. */
    userMessage: z.string(),
    retryable: z.boolean().default(false),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
