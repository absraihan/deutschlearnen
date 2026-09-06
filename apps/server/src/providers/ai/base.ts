import {
  EXERCISE_PROMPT,
  ExerciseSetSchema,
  GRAMMAR_ANALYSIS_PROMPT,
  GrammarAnalysisSchema,
  InvalidAIResponseError,
  LISTENING_PROMPT,
  ListeningItemSchema,
  PRONUNCIATION_PROMPT,
  PronunciationAnalysisSchema,
  SESSION_EVALUATION_PROMPT,
  SHADOWING_PROMPT,
  SessionEvaluationSchema,
  ShadowingSetSchema,
  TutorTurnSchema,
  VOCABULARY_PROMPT,
  VocabularySuggestionSchema,
  CONTEXT_SUMMARY_PROMPT,
  buildTutorSystemPrompt,
  computeHeuristicScores,
  getLevelProfile,
  parseAIJson,
  renderTranscript,
  turnWordStats,
  type AnalyzeRequest,
  type EvaluateSpeakingRequest,
  type ExerciseSet,
  type GenerateExerciseRequest,
  type GenerateVocabularyRequest,
  type GrammarAnalysis,
  type ListeningItem,
  type ListeningRequest,
  type PronunciationAnalysis,
  type RespondRequest,
  type SessionEvaluation,
  type SessionSummaryRequest,
  type ShadowingRequest,
  type ShadowingSet,
  type TutorTurn,
  type VocabularySuggestion,
} from '@deutschcoach/shared';
import { z } from 'zod';
import {
  AIProviderError,
  type AIProvider,
  type AIResult,
  type ChatBackend,
  type ChatMessage,
  type ChatOptions,
} from './types';

/**
 * Everything an AIProvider does, expressed in terms of a single `chat()` call.
 *
 * A new provider therefore only has to implement transport: build the request,
 * return the text. Prompt construction, JSON validation, retry-on-bad-JSON and
 * the degraded fallbacks all live here, so every provider behaves the same.
 */
export abstract class ChatBasedProvider implements AIProvider, ChatBackend {
  abstract readonly name: string;
  abstract readonly model: string;

  abstract chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<{ text: string; usage: AIResult<unknown>['usage'] }>;

  /**
   * Ask for JSON and validate it. One retry with an explicit repair instruction,
   * because a second attempt is far cheaper than failing the learner's turn.
   */
  protected async chatJson<T extends z.ZodTypeAny>(
    messages: ChatMessage[],
    schema: T,
    options: ChatOptions = {},
  ): Promise<{ value: z.infer<T>; usage: AIResult<unknown>['usage']; degraded: boolean }> {
    const first = await this.chat(messages, { ...options, json: true });
    try {
      return { value: parseAIJson(first.text, schema), usage: first.usage, degraded: false };
    } catch (error) {
      if (!(error instanceof InvalidAIResponseError)) throw error;

      const retry = await this.chat(
        [
          ...messages,
          { role: 'assistant', content: first.text.slice(0, 2000) },
          {
            role: 'user',
            content: `That was not valid JSON for the required schema. Problems: ${
              error.issues.join('; ') || error.message
            }. Return ONLY the corrected JSON object, nothing else.`,
          },
        ],
        { ...options, json: true },
      );

      try {
        return { value: parseAIJson(retry.text, schema), usage: retry.usage, degraded: true };
      } catch (retryError) {
        throw new AIProviderError({
          code: 'invalid_ai_json',
          message: `${this.name} returned unusable JSON twice: ${(retryError as Error).message}`,
          userMessage: 'Der Tutor hat gerade unverständlich geantwortet. Bitte noch einmal.',
          retryable: true,
        });
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * Conversation
   * ---------------------------------------------------------------- */

  async generateConversationResponse(request: RespondRequest): Promise<AIResult<TutorTurn>> {
    const system = buildTutorSystemPrompt({
      learner: {
        ...request.learner,
        longTermSummary: request.learner.longTermSummary ?? null,
      },
      modeId: request.modeId,
      roleplayId: request.roleplayId,
      topic: request.topic,
      kind: request.kind,
      runningSummary: request.runningSummary,
    });

    const messages: ChatMessage[] = [{ role: 'system', content: system }];
    for (const turn of request.history) {
      messages.push({
        role: turn.speaker === 'user' ? 'user' : 'assistant',
        content: turn.text,
      });
    }

    const confidenceNote =
      request.sttConfidence !== null && request.sttConfidence < 0.55
        ? '\n\n[System note: speech recognition confidence was low, the transcript may be inaccurate. If it looks garbled, ask the learner to repeat instead of correcting it.]'
        : '';

    messages.push({ role: 'user', content: request.userText + confidenceNote });

    const profile = getLevelProfile(request.learner.level);
    const result = await this.chatJson(messages, TutorTurnSchema, {
      temperature: 0.7,
      maxTokens: Math.max(400, profile.replyWords.max * 12),
    });

    return { value: result.value, usage: result.usage, degraded: result.degraded };
  }

  /* ---------------------------------------------------------------- *
   * Analysis
   * ---------------------------------------------------------------- */

  async analyzeGrammar(request: AnalyzeRequest): Promise<AIResult<GrammarAnalysis>> {
    const profile = getLevelProfile(request.level);
    const messages: ChatMessage[] = [
      { role: 'system', content: GRAMMAR_ANALYSIS_PROMPT },
      {
        role: 'user',
        content: [
          `Learner level: ${request.level}.`,
          `Grammar in scope at this level: ${profile.grammar.join(', ')}.`,
          `Explanation languages: ${request.explanationLanguages.join(', ')}.`,
          request.context ? `Conversation context: ${request.context}` : '',
          `Sentence: ${request.text}`,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ];

    const result = await this.chatJson(messages, GrammarAnalysisSchema, {
      temperature: 0.2,
      maxTokens: 700,
    });
    return { value: result.value, usage: result.usage, degraded: result.degraded };
  }

  async analyzePronunciation(
    request: EvaluateSpeakingRequest,
  ): Promise<AIResult<PronunciationAnalysis>> {
    const messages: ChatMessage[] = [
      { role: 'system', content: PRONUNCIATION_PROMPT },
      {
        role: 'user',
        content: [
          `Learner level: ${request.level}.`,
          request.targetText ? `Target sentence: ${request.targetText}` : 'No target sentence.',
          `Recognised transcript: ${request.transcript}`,
          request.sttConfidence !== null
            ? `Recogniser confidence: ${request.sttConfidence.toFixed(2)}`
            : 'Recogniser confidence: unknown',
          `Verified audio scoring available: ${request.hasAudioScoring ? 'yes' : 'no'}`,
        ].join('\n'),
      },
    ];

    const result = await this.chatJson(messages, PronunciationAnalysisSchema, {
      temperature: 0.3,
      maxTokens: 600,
    });

    // Never let a model claim verified scoring when no audio was analysed.
    const value: PronunciationAnalysis = {
      ...result.value,
      method: request.hasAudioScoring ? result.value.method : 'estimated-from-transcript',
      confidenceNote:
        result.value.confidenceNote ||
        'Geschätztes Feedback auf Basis der Spracherkennung, keine gemessene Aussprachebewertung.',
    };
    return { value, usage: result.usage, degraded: result.degraded };
  }

  /* ---------------------------------------------------------------- *
   * Generation
   * ---------------------------------------------------------------- */

  async generateExercise(request: GenerateExerciseRequest): Promise<AIResult<ExerciseSet>> {
    const mistakeList = request.mistakes.length
      ? request.mistakes
          .map(
            (m, i) =>
              `${i + 1}. [${m.category}] "${m.wrongText}" should be "${m.correctText}". ${m.explanation}`,
          )
          .join('\n')
      : 'No specific mistakes recorded; drill the core grammar of this level instead.';

    const messages: ChatMessage[] = [
      { role: 'system', content: EXERCISE_PROMPT },
      {
        role: 'user',
        content: [
          `Level: ${request.level}. Produce exactly ${request.count} exercises.`,
          request.focusArea ? `Focus area: ${request.focusArea}.` : '',
          request.includeBangla ? 'Add a short Bangla hint in "hint".' : '',
          'Mistakes to target:',
          mistakeList,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ];

    const result = await this.chatJson(messages, ExerciseSetSchema, {
      temperature: 0.6,
      maxTokens: 1200,
    });
    return { value: result.value, usage: result.usage, degraded: result.degraded };
  }

  async generateVocabulary(
    request: GenerateVocabularyRequest,
  ): Promise<AIResult<VocabularySuggestion[]>> {
    const schema = z.object({ items: z.array(VocabularySuggestionSchema).min(1) });
    const messages: ChatMessage[] = [
      { role: 'system', content: VOCABULARY_PROMPT },
      {
        role: 'user',
        content: [
          `Level: ${request.level}. Topic: ${request.topic}. Count: ${request.count}.`,
          request.includeBangla
            ? 'Include Bangla meanings in Bangla script.'
            : 'Set "bangla" to null.',
          request.exclude.length
            ? `Do not use any of these: ${request.exclude.slice(0, 80).join(', ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ];

    const result = await this.chatJson(messages, schema, { temperature: 0.6, maxTokens: 1400 });
    return { value: result.value.items, usage: result.usage, degraded: result.degraded };
  }

  async generateListening(request: ListeningRequest): Promise<AIResult<ListeningItem[]>> {
    const schema = z.object({ items: z.array(ListeningItemSchema).min(1) });
    const messages: ChatMessage[] = [
      { role: 'system', content: LISTENING_PROMPT },
      {
        role: 'user',
        content: `Level: ${request.level}. Topic: ${request.topic}. Produce ${request.count} items.`,
      },
    ];
    const result = await this.chatJson(messages, schema, { temperature: 0.7, maxTokens: 1200 });
    return { value: result.value.items, usage: result.usage, degraded: result.degraded };
  }

  async generateShadowing(request: ShadowingRequest): Promise<AIResult<ShadowingSet>> {
    const messages: ChatMessage[] = [
      { role: 'system', content: SHADOWING_PROMPT },
      {
        role: 'user',
        content: [
          `Level: ${request.level}. Topic: ${request.topic}. Produce ${request.count} sentences.`,
          request.focusSounds.length
            ? `Focus on these sounds: ${request.focusSounds.join(', ')}.`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ];
    const result = await this.chatJson(messages, ShadowingSetSchema, {
      temperature: 0.7,
      maxTokens: 900,
    });
    return { value: result.value, usage: result.usage, degraded: result.degraded };
  }

  /* ---------------------------------------------------------------- *
   * Session evaluation
   * ---------------------------------------------------------------- */

  async evaluateSpeakingSession(
    request: SessionSummaryRequest,
  ): Promise<AIResult<SessionEvaluation>> {
    const userTurns = request.messages.filter((m) => m.speaker === 'user');
    const correctionsByCategory = new Map<string, number>();
    for (const c of request.corrections) {
      correctionsByCategory.set(c.category, (correctionsByCategory.get(c.category) ?? 0) + 1);
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: SESSION_EVALUATION_PROMPT },
      {
        role: 'user',
        content: [
          `Level: ${request.level}. Kind: ${request.kind}. Topic: ${request.topic ?? 'frei'}.`,
          `Duration: ${Math.round(request.durationSec / 60)} minutes, ${userTurns.length} learner turns.`,
          `Explanation languages: ${request.explanationLanguages.join(', ')}.`,
          `Pronunciation data available: ${request.hasPronunciationData ? 'yes' : 'no'}.`,
          correctionsByCategory.size
            ? `Corrections by category: ${[...correctionsByCategory.entries()]
                .map(([c, n]) => `${c} x${n}`)
                .join(', ')}.`
            : 'No corrections were needed.',
          '',
          'Transcript:',
          renderTranscript(request.messages),
        ].join('\n'),
      },
    ];

    const result = await this.chatJson(messages, SessionEvaluationSchema, {
      temperature: 0.4,
      maxTokens: 900,
    });

    // Bound the model against the deterministic heuristic so a hallucinated 98
    // on a session full of critical errors cannot reach the learner.
    const heuristic = computeHeuristicScores(
      userTurns.map((t) => {
        const stats = turnWordStats(t.text);
        return {
          words: stats.words,
          uniqueWords: stats.uniqueWords,
          hadCorrection: false,
          severity: null,
          accuracy: null,
          sttConfidence: null,
        };
      }),
      request.level,
    );

    const bounded: SessionEvaluation = {
      ...result.value,
      overallScore: blend(result.value.overallScore, heuristic.overallScore),
      grammarScore: blend(result.value.grammarScore, heuristic.grammarScore),
      vocabularyScore: blend(result.value.vocabularyScore, heuristic.vocabularyScore),
      fluencyScore: blend(result.value.fluencyScore, heuristic.fluencyScore),
      pronunciationScore: request.hasPronunciationData ? result.value.pronunciationScore : null,
    };

    return { value: bounded, usage: result.usage, degraded: result.degraded };
  }

  async summarizeContext(transcript: string): Promise<AIResult<string>> {
    const completion = await this.chat(
      [
        { role: 'system', content: CONTEXT_SUMMARY_PROMPT },
        { role: 'user', content: transcript },
      ],
      { temperature: 0.3, maxTokens: 120 },
    );
    return { value: completion.text.trim().replace(/^["']|["']$/g, ''), usage: completion.usage };
  }
}

/**
 * Keep the model's judgement dominant but pull it toward the deterministic
 * score when the two disagree wildly.
 */
function blend(modelScore: number, heuristicScore: number): number {
  const diff = Math.abs(modelScore - heuristicScore);
  if (diff <= 20) return Math.round(modelScore);
  return Math.round(modelScore * 0.65 + heuristicScore * 0.35);
}
