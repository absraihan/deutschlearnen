import type { Env } from './env';
import { createAIProvider, AIProviderError, type AIProvider } from './providers/ai';
import {
  createSTTProvider,
  createTTSProvider,
  type SpeechToTextProvider,
  type TextToSpeechProvider,
} from './providers/speech';
import { ConversationService } from './services/conversation';

/**
 * Everything a route needs, assembled once at boot.
 * Passing this explicitly (rather than reaching for module singletons) is what
 * lets the tests build a server with a MockProvider in two lines.
 */
export interface AppContext {
  env: Env;
  /**
   * The server's own provider. Null when the server holds no key of its own,
   * which is the shareable configuration: every request brings the caller's.
   */
  ai: AIProvider | null;
  /**
   * The provider to use for one request.
   *
   * A learner may supply their own AI key in Settings, which arrives as a
   * header and is used for that request only. That is what makes the app
   * shareable: with `ALLOW_SERVER_KEY_FALLBACK=false` the server spends nobody's
   * quota but the caller's own.
   */
  aiFor: (userKey?: string) => AIProvider;
  stt: SpeechToTextProvider;
  tts: TextToSpeechProvider;
  conversation: ConversationService;
}

/**
 * Building a provider is cheap, but not free, and a learner makes one request
 * every few seconds. Cache per key, bounded so a hostile caller cannot grow it
 * without limit by sending a new key each time.
 */
const MAX_CACHED_USER_PROVIDERS = 20;

export function createContext(
  env: Env,
  overrides: Partial<Omit<AppContext, 'env'>> = {},
): AppContext {
  /**
   * Constructing this throws when the selected provider has no key. Once
   * ALLOW_SERVER_KEY_FALLBACK is off that is a valid configuration, so a
   * missing key means "no server provider" rather than a boot failure.
   */
  const ai =
    overrides.ai ??
    (() => {
      try {
        return createAIProvider(env);
      } catch {
        return null;
      }
    })();
  const stt = overrides.stt ?? createSTTProvider(env);
  const tts = overrides.tts ?? createTTSProvider(env);

  const userProviders = new Map<string, AIProvider>();

  const aiFor =
    overrides.aiFor ??
    ((userKey?: string): AIProvider => {
      const key = userKey?.trim();

      if (!key) {
        if (!env.ALLOW_SERVER_KEY_FALLBACK || !ai) {
          throw new AIProviderError({
            code: 'user_key_required',
            message: 'No user AI key supplied and server-key fallback is disabled',
            userMessage:
              'Bitte trage deinen eigenen KI-Schlüssel in den Einstellungen ein, damit der Tutor antworten kann.',
            retryable: false,
            status: 402,
          });
        }
        return ai;
      }

      const cached = userProviders.get(key);
      if (cached) return cached;

      // Same provider type as the server is configured for, different key.
      const provider = createAIProvider({ ...env, GEMINI_API_KEY: key, OPENAI_API_KEY: key, ANTHROPIC_API_KEY: key });

      if (userProviders.size >= MAX_CACHED_USER_PROVIDERS) {
        const oldest = userProviders.keys().next().value;
        if (oldest) userProviders.delete(oldest);
      }
      userProviders.set(key, provider);
      return provider;
    });

  const conversation =
    overrides.conversation ??
    new ConversationService(ai, { maxPromptTokens: env.MAX_PROMPT_TOKENS });

  return { env, ai, aiFor, stt, tts, conversation };
}

/**
 * Pull the learner's own AI key off a request.
 *
 * Deliberately a header rather than part of the JSON body: it keeps the key out
 * of anything that logs request payloads, and out of the schemas that the rest
 * of the app passes around.
 */
export function userAiKeyFrom(headers: Record<string, unknown>): string | undefined {
  const raw = headers['x-user-ai-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}
