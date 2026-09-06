import type { Env } from './env';
import { createAIProvider, type AIProvider } from './providers/ai';
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
  ai: AIProvider;
  stt: SpeechToTextProvider;
  tts: TextToSpeechProvider;
  conversation: ConversationService;
}

export function createContext(
  env: Env,
  overrides: Partial<Omit<AppContext, 'env'>> = {},
): AppContext {
  const ai = overrides.ai ?? createAIProvider(env);
  const stt = overrides.stt ?? createSTTProvider(env);
  const tts = overrides.tts ?? createTTSProvider(env);
  const conversation =
    overrides.conversation ??
    new ConversationService(ai, { maxPromptTokens: env.MAX_PROMPT_TOKENS });

  return { env, ai, stt, tts, conversation };
}
