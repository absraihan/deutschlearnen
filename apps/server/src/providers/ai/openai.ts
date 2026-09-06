import { request } from 'undici';
import { ChatBasedProvider } from './base';
import { AIProviderError, type AIUsage, type ChatMessage, type ChatOptions } from './types';

export interface OpenAIProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
  error?: { message?: string; type?: string; code?: string };
}

/**
 * OpenAI chat-completions provider.
 *
 * Uses response_format json_object so the model is constrained to JSON at the
 * API level; the schema validation in ChatBasedProvider is still the source of
 * truth, since json_object guarantees syntax but not shape.
 */
export class OpenAIProvider extends ChatBasedProvider {
  readonly name = 'openai';
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: OpenAIProviderOptions) {
    super();
    if (!options.apiKey) {
      throw new AIProviderError({
        code: 'missing_api_key',
        message: 'OPENAI_API_KEY is not set',
        userMessage: 'Der Tutor ist nicht konfiguriert.',
        retryable: false,
        status: 500,
      });
    }
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 45_000;
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): Promise<{ text: string; usage: AIUsage | null }> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 800,
    };
    if (options.json) body.response_format = { type: 'json_object' };

    let response;
    try {
      response = await request(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        headersTimeout: this.timeoutMs,
        bodyTimeout: this.timeoutMs,
      });
    } catch (error) {
      throw new AIProviderError({
        code: 'network_error',
        message: `OpenAI request failed: ${(error as Error).message}`,
        userMessage: 'Keine Verbindung zum Tutor. Prüfe dein Internet.',
        retryable: true,
        status: 503,
      });
    }

    const payload = (await response.body.json()) as OpenAIChatResponse;

    if (response.statusCode >= 400) {
      throw mapOpenAIError(response.statusCode, payload);
    }

    const text = payload.choices?.[0]?.message?.content ?? '';
    if (!text.trim()) {
      throw new AIProviderError({
        code: 'empty_response',
        message: 'OpenAI returned an empty completion',
        userMessage: 'Der Tutor hat nicht geantwortet. Bitte noch einmal.',
        retryable: true,
      });
    }

    const usage: AIUsage = {
      promptTokens: payload.usage?.prompt_tokens ?? null,
      completionTokens: payload.usage?.completion_tokens ?? null,
      cached: (payload.usage?.prompt_tokens_details?.cached_tokens ?? 0) > 0,
    };

    return { text, usage };
  }
}

function mapOpenAIError(status: number, payload: OpenAIChatResponse): AIProviderError {
  const message = payload.error?.message ?? `OpenAI responded with ${status}`;
  if (status === 401 || status === 403) {
    return new AIProviderError({
      code: 'auth_error',
      message,
      userMessage: 'Der API-Schlüssel des Tutors ist ungültig.',
      retryable: false,
      status: 500,
    });
  }
  if (status === 429) {
    return new AIProviderError({
      code: 'rate_limited',
      message,
      userMessage: 'Zu viele Anfragen. Warte einen Moment und sprich dann weiter.',
      retryable: true,
      status: 429,
    });
  }
  if (status >= 500) {
    return new AIProviderError({
      code: 'provider_unavailable',
      message,
      userMessage: 'Der Tutor ist gerade nicht erreichbar. Versuche es gleich noch einmal.',
      retryable: true,
      status: 503,
    });
  }
  return new AIProviderError({
    code: 'provider_error',
    message,
    userMessage: 'Es gab ein Problem mit dem Tutor.',
    retryable: false,
    status: 502,
  });
}
