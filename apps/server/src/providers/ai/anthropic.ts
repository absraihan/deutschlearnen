import { request } from 'undici';
import { ChatBasedProvider } from './base';
import { AIProviderError, type AIUsage, type ChatMessage, type ChatOptions } from './types';

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
  };
  error?: { message?: string; type?: string };
}

/**
 * Anthropic Messages API provider.
 *
 * Included as the second implementation of the abstraction, which is what keeps
 * the abstraction honest: switching AI_PROVIDER=anthropic changes nothing above
 * this file. Anthropic has no json_object mode, so JSON is enforced by the
 * prompt plus the prefill trick and validated by Zod as usual.
 */
export class AnthropicProvider extends ChatBasedProvider {
  readonly name = 'anthropic';
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: AnthropicProviderOptions) {
    super();
    if (!options.apiKey) {
      throw new AIProviderError({
        code: 'missing_api_key',
        message: 'ANTHROPIC_API_KEY is not set',
        userMessage: 'Der Tutor ist nicht konfiguriert.',
        retryable: false,
        status: 500,
      });
    }
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (options.baseUrl || 'https://api.anthropic.com/v1').replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 45_000;
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): Promise<{ text: string; usage: AIUsage | null }> {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const turns = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // Anthropic requires the first message to be from the user.
    if (turns.length === 0 || turns[0]!.role !== 'user') {
      turns.unshift({ role: 'user', content: 'Beginne bitte das Gespräch.' });
    }

    // Prefilling an opening brace makes the model continue inside JSON.
    if (options.json) {
      turns.push({ role: 'assistant', content: '{' });
    }

    const body = {
      model: this.model,
      system: system || undefined,
      messages: turns,
      max_tokens: options.maxTokens ?? 800,
      temperature: options.temperature ?? 0.7,
    };

    let response;
    try {
      response = await request(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        headersTimeout: this.timeoutMs,
        bodyTimeout: this.timeoutMs,
      });
    } catch (error) {
      throw new AIProviderError({
        code: 'network_error',
        message: `Anthropic request failed: ${(error as Error).message}`,
        userMessage: 'Keine Verbindung zum Tutor. Prüfe dein Internet.',
        retryable: true,
        status: 503,
      });
    }

    const payload = (await response.body.json()) as AnthropicResponse;

    if (response.statusCode >= 400) {
      throw mapAnthropicError(response.statusCode, payload);
    }

    let text =
      payload.content
        ?.filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('') ?? '';

    // Put the prefilled brace back so the result is a complete JSON document.
    if (options.json && text.trim() && !text.trimStart().startsWith('{')) {
      text = `{${text}`;
    }

    if (!text.trim()) {
      throw new AIProviderError({
        code: 'empty_response',
        message: 'Anthropic returned an empty completion',
        userMessage: 'Der Tutor hat nicht geantwortet. Bitte noch einmal.',
        retryable: true,
      });
    }

    const usage: AIUsage = {
      promptTokens: payload.usage?.input_tokens ?? null,
      completionTokens: payload.usage?.output_tokens ?? null,
      cached: (payload.usage?.cache_read_input_tokens ?? 0) > 0,
    };

    return { text, usage };
  }
}

function mapAnthropicError(status: number, payload: AnthropicResponse): AIProviderError {
  const message = payload.error?.message ?? `Anthropic responded with ${status}`;
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
