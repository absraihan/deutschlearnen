import type { Env } from '../../env';
import { AnthropicProvider } from './anthropic';
import { MockProvider } from './mock';
import { OpenAIProvider } from './openai';
import type { AIProvider } from './types';

export * from './types';
export { ChatBasedProvider } from './base';
export { OpenAIProvider } from './openai';
export { AnthropicProvider } from './anthropic';
export { MockProvider } from './mock';
export { checkGerman } from './rules';

/**
 * The single place a concrete provider is chosen.
 * Adding a provider means adding a case here and nothing else.
 */
export function createAIProvider(env: Env): AIProvider {
  switch (env.AI_PROVIDER) {
    case 'openai':
      return new OpenAIProvider({
        apiKey: env.OPENAI_API_KEY ?? '',
        model: env.OPENAI_MODEL,
        baseUrl: env.OPENAI_BASE_URL,
        timeoutMs: env.REQUEST_TIMEOUT_MS,
      });
    case 'anthropic':
      return new AnthropicProvider({
        apiKey: env.ANTHROPIC_API_KEY ?? '',
        model: env.ANTHROPIC_MODEL,
        baseUrl: env.ANTHROPIC_BASE_URL,
        timeoutMs: env.REQUEST_TIMEOUT_MS,
      });
    case 'mock':
    default:
      return new MockProvider();
  }
}
