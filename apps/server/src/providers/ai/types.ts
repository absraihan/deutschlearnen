import type {
  AnalyzeRequest,
  EvaluateSpeakingRequest,
  Exercise,
  ExerciseSet,
  GenerateExerciseRequest,
  GenerateVocabularyRequest,
  GrammarAnalysis,
  ListeningItem,
  ListeningRequest,
  PronunciationAnalysis,
  RespondRequest,
  SessionEvaluation,
  SessionSummaryRequest,
  ShadowingRequest,
  ShadowingSet,
  TutorTurn,
  VocabularySuggestion,
} from '@deutschlearnen/shared';

/**
 * The AI abstraction.
 *
 * Everything the app asks a model to do goes through this interface. Swapping
 * provider means writing one new class and changing AI_PROVIDER in .env - no
 * route, service or screen changes. Providers own their prompt-to-JSON plumbing
 * but share the prompts from @deutschlearnen/shared, so tutor behaviour stays
 * identical across providers.
 */
export interface AIProvider {
  /** Stable identifier used in logs and health output. */
  readonly name: string;
  /** Model identifier actually in use. */
  readonly model: string;

  /** One conversation turn: reply + optional correction + vocabulary. */
  generateConversationResponse(request: RespondRequest): Promise<AIResult<TutorTurn>>;

  /** Deep analysis of a single sentence, for the correction screen. */
  analyzeGrammar(request: AnalyzeRequest): Promise<AIResult<GrammarAnalysis>>;

  /**
   * Pronunciation feedback. Implementations that cannot hear audio MUST return
   * method 'estimated-from-transcript' so the UI can label it honestly.
   */
  analyzePronunciation(
    request: EvaluateSpeakingRequest,
  ): Promise<AIResult<PronunciationAnalysis>>;

  /** Targeted drills built from the learner's recurring mistakes. */
  generateExercise(request: GenerateExerciseRequest): Promise<AIResult<ExerciseSet>>;

  /** Vocabulary items for a topic and level. */
  generateVocabulary(
    request: GenerateVocabularyRequest,
  ): Promise<AIResult<VocabularySuggestion[]>>;

  /** End-of-session scores and feedback. */
  evaluateSpeakingSession(
    request: SessionSummaryRequest,
  ): Promise<AIResult<SessionEvaluation>>;

  /** Listening comprehension passages plus a question each. */
  generateListening(request: ListeningRequest): Promise<AIResult<ListeningItem[]>>;

  /** Shadowing sentences for pronunciation practice. */
  generateShadowing(request: ShadowingRequest): Promise<AIResult<ShadowingSet>>;

  /** Collapse older conversation turns into one German line. */
  summarizeContext(transcript: string): Promise<AIResult<string>>;
}

/** Token accounting, surfaced so cost can be watched without a dashboard. */
export interface AIUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  cached: boolean;
}

export interface AIResult<T> {
  value: T;
  usage: AIUsage | null;
  /** True when the model produced invalid JSON and a repair/fallback was used. */
  degraded?: boolean;
}

export const EMPTY_USAGE: AIUsage = {
  promptTokens: null,
  completionTokens: null,
  cached: false,
};

/** Raised for provider/transport problems; carries a learner-safe German message. */
export class AIProviderError extends Error {
  readonly code: string;
  readonly userMessage: string;
  readonly retryable: boolean;
  readonly status: number;

  constructor(options: {
    code: string;
    message: string;
    userMessage?: string;
    retryable?: boolean;
    status?: number;
  }) {
    super(options.message);
    this.name = 'AIProviderError';
    this.code = options.code;
    this.userMessage =
      options.userMessage ?? 'Es gab ein Problem mit dem Tutor. Bitte versuche es noch einmal.';
    this.retryable = options.retryable ?? true;
    this.status = options.status ?? 502;
  }
}

/** Minimal chat shape every provider maps onto its own API. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** Ask the provider for strict JSON where it supports it. */
  json?: boolean;
}

export interface ChatCompletion {
  text: string;
  usage: AIUsage | null;
}

/** Shared surface for providers that are ultimately a chat endpoint. */
export interface ChatBackend {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatCompletion>;
}

export type { Exercise };
