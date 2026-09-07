import {
  estimateTokens,
  mergeSummaries,
  renderTranscript,
  trimConversation,
  type RespondRequest,
  type RespondResponse,
} from '@deutschlearnen/shared';
import type { AIProvider } from '../providers/ai/types';
import { AIProviderError } from '../providers/ai/types';

/**
 * Conversation orchestration.
 *
 * The one job that does not belong in a provider: deciding how much history to
 * send. Older turns are folded into a single German summary line, recent turns
 * go verbatim. That keeps every request roughly constant in size no matter how
 * long the learner talks, which is the main lever on cost.
 */
export class ConversationService {
  constructor(
    private readonly ai: AIProvider | null,
    private readonly options: { maxPromptTokens: number },
  ) {}

  /**
   * @param provider the AI to use for this turn. Defaults to the server's own,
   *   but a learner supplying their own key gets a provider built from it.
   */
  async respond(request: RespondRequest, provider?: AIProvider): Promise<RespondResponse> {
    const ai = provider ?? this.ai;
    if (!ai) {
      throw new AIProviderError({
        code: 'user_key_required',
        message: 'No AI provider available for this request',
        userMessage:
          'Bitte trage deinen eigenen KI-Schlüssel in den Einstellungen ein.',
        retryable: false,
        status: 402,
      });
    }

    const trimmed = trimConversation(request.history);

    let runningSummary = request.runningSummary ?? null;

    // Only summarise when there is genuinely something to fold away; a
    // summarisation call on a three-turn conversation is wasted money.
    if (trimmed.needsSummary && trimmed.toSummarise.length >= 4) {
      try {
        const summary = await ai.summarizeContext(renderTranscript(trimmed.toSummarise));
        runningSummary = mergeSummaries(runningSummary, summary.value);
      } catch {
        // A failed summary must not fail the learner's turn: fall back to the
        // previous summary and send slightly less context.
        runningSummary = request.runningSummary ?? null;
      }
    }

    const effective: RespondRequest = {
      ...request,
      history: trimmed.history,
      runningSummary,
    };

    this.assertWithinBudget(effective);

    const result = await ai.generateConversationResponse(effective);

    return {
      turn: result.value,
      runningSummary,
      usage: result.usage,
    };
  }

  /**
   * Cost guard. Rejects a request that would send an unreasonable prompt rather
   * than silently billing for it - which can only happen if a client ignores
   * the history limits, so it is a bug signal as much as a budget one.
   */
  private assertWithinBudget(request: RespondRequest): void {
    const approximate =
      request.userText.length +
      (request.runningSummary?.length ?? 0) +
      request.history.reduce((sum, m) => sum + m.text.length, 0) +
      request.learner.knownVocabulary.join('').length +
      4000; // system prompt

    if (estimateTokens('x'.repeat(approximate)) > this.options.maxPromptTokens) {
      throw new AIProviderError({
        code: 'context_too_large',
        message: `Prompt would exceed MAX_PROMPT_TOKENS (${this.options.maxPromptTokens})`,
        userMessage:
          'Dieses Gespräch ist sehr lang geworden. Beende die Sitzung und starte eine neue.',
        retryable: false,
        status: 413,
      });
    }
  }
}
