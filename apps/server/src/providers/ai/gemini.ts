import { request } from 'undici';
import { ChatBasedProvider } from './base';
import { AIProviderError, type AIUsage, type ChatMessage, type ChatOptions } from './types';

export interface GeminiProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
  };
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string; code?: number };
}

/**
 * Google Gemini provider.
 *
 * The reason this exists: Gemini is the only major provider with a genuinely
 * free tier, so a learner can have real conversations without a paid account.
 *
 * Two shape differences from the OpenAI-style API, both handled here so nothing
 * above this file has to care:
 *  - the system prompt is a separate `systemInstruction`, not a message
 *  - turns are `contents` with roles `user` / `model`, and they must alternate
 *    starting with `user`
 */
export class GeminiProvider extends ChatBasedProvider {
  readonly name = 'gemini';
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: GeminiProviderOptions) {
    super();
    if (!options.apiKey) {
      throw new AIProviderError({
        code: 'missing_api_key',
        message: 'GEMINI_API_KEY is not set',
        userMessage: 'Der Tutor ist nicht konfiguriert.',
        retryable: false,
        status: 500,
      });
    }
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (
      options.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta'
    ).replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 45_000;
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): Promise<{ text: string; usage: AIUsage | null }> {
    const systemText = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const contents = toGeminiContents(messages);

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 800,
        // Gemini can be constrained to emit JSON at the API level, which makes
        // the schema validation upstream a check rather than a gamble.
        ...(options.json ? { responseMimeType: 'application/json' } : {}),
      },
    };
    if (systemText) {
      body.systemInstruction = { parts: [{ text: systemText }] };
    }

    let response;
    try {
      response = await request(
        `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            // Header rather than a query parameter, so the key cannot leak
            // into logs or proxy access records via the URL.
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify(body),
          headersTimeout: this.timeoutMs,
          bodyTimeout: this.timeoutMs,
        },
      );
    } catch (error) {
      throw new AIProviderError({
        code: 'network_error',
        message: `Gemini request failed: ${(error as Error).message}`,
        userMessage: 'Keine Verbindung zum Tutor. Prüfe dein Internet.',
        retryable: true,
        status: 503,
      });
    }

    const payload = (await response.body.json()) as GeminiResponse;

    if (response.statusCode >= 400) {
      throw mapGeminiError(response.statusCode, payload, this.model);
    }

    // A safety block returns 200 with no candidate. Treat it as a retryable
    // turn rather than a crash: the learner just says something else.
    if (payload.promptFeedback?.blockReason) {
      throw new AIProviderError({
        code: 'content_blocked',
        message: `Gemini blocked the prompt: ${payload.promptFeedback.blockReason}`,
        userMessage: 'Darüber kann ich gerade nicht sprechen. Sag bitte etwas anderes.',
        retryable: false,
        status: 422,
      });
    }

    const text =
      payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';

    if (!text.trim()) {
      const reason = payload.candidates?.[0]?.finishReason;
      throw new AIProviderError({
        code: reason === 'MAX_TOKENS' ? 'response_truncated' : 'empty_response',
        message: `Gemini returned no usable text (finishReason: ${reason ?? 'none'})`,
        userMessage: 'Der Tutor hat nicht geantwortet. Bitte noch einmal.',
        retryable: true,
      });
    }

    const usage: AIUsage = {
      promptTokens: payload.usageMetadata?.promptTokenCount ?? null,
      completionTokens: payload.usageMetadata?.candidatesTokenCount ?? null,
      cached: (payload.usageMetadata?.cachedContentTokenCount ?? 0) > 0,
    };

    return { text, usage };
  }
}

/**
 * Convert chat messages into Gemini `contents`.
 *
 * Gemini rejects a conversation that does not start with a user turn, and
 * merges badly if two turns share a role, so consecutive same-role messages are
 * combined and a leading model turn is dropped.
 */
export function toGeminiContents(
  messages: ChatMessage[],
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  const turns = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
      text: m.content,
    }));

  // The opening tutor line is an assistant turn; Gemini needs a user turn first.
  while (turns.length > 0 && turns[0]!.role === 'model') turns.shift();

  const merged: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (const turn of turns) {
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) {
      last.parts.push({ text: turn.text });
    } else {
      merged.push({ role: turn.role, parts: [{ text: turn.text }] });
    }
  }

  if (merged.length === 0) {
    merged.push({ role: 'user', parts: [{ text: 'Beginne bitte das Gespräch.' }] });
  }
  return merged;
}

function mapGeminiError(
  status: number,
  payload: GeminiResponse,
  model: string,
): AIProviderError {
  const message = payload.error?.message ?? `Gemini responded with ${status}`;

  if (status === 400 && /API key not valid/i.test(message)) {
    return new AIProviderError({
      code: 'auth_error',
      message,
      userMessage: 'Der API-Schlüssel des Tutors ist ungültig.',
      retryable: false,
      status: 500,
    });
  }
  if (status === 401 || status === 403) {
    return new AIProviderError({
      code: 'auth_error',
      message,
      userMessage: 'Der API-Schlüssel des Tutors ist ungültig.',
      retryable: false,
      status: 500,
    });
  }
  if (status === 404) {
    return new AIProviderError({
      code: 'model_not_found',
      message: `${message} (model "${model}" - set GEMINI_MODEL to one your key can access, e.g. gemini-2.0-flash)`,
      userMessage: 'Das Tutor-Modell ist nicht verfügbar. Prüfe GEMINI_MODEL.',
      retryable: false,
      status: 500,
    });
  }
  if (status === 429) {
    return new AIProviderError({
      code: 'rate_limited',
      message,
      userMessage: 'Das kostenlose Kontingent ist gerade erschöpft. Warte einen Moment.',
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
