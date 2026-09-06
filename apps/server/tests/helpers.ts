import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import type { AppContext } from '../src/context';
import type { Env } from '../src/env';

export const testEnv: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  HOST: '127.0.0.1',
  APP_NAME: 'DeutschCoach AI',
  AI_PROVIDER: 'mock',
  OPENAI_MODEL: 'gpt-4o-mini',
  ANTHROPIC_MODEL: 'claude-sonnet-5',
  STT_PROVIDER: 'none',
  STT_MODEL: 'whisper-1',
  TTS_PROVIDER: 'none',
  TTS_MODEL: 'gpt-4o-mini-tts',
  TTS_VOICE: 'alloy',
  CORS_ORIGIN: '*',
  REQUEST_TIMEOUT_MS: 45_000,
  RATE_LIMIT_MAX: 10_000,
  RATE_LIMIT_WINDOW: '1 minute',
  MAX_PROMPT_TOKENS: 6000,
  LOG_LEVEL: 'error',
};

export async function makeApp(
  overrides: Partial<Omit<AppContext, 'env'>> = {},
  envOverrides: Partial<Env> = {},
): Promise<FastifyInstance> {
  return buildApp({ env: { ...testEnv, ...envOverrides }, overrides });
}

export const learnerA1 = {
  level: 'A1' as const,
  targetLevel: 'B2' as const,
  correctionMode: 'NORMAL' as const,
  explanationLanguages: ['de' as const, 'bn' as const],
  frequentMistakes: [],
  knownVocabulary: [],
  weakAreas: [],
  longTermSummary: null,
  recentAccuracy: null,
  difficultyProgress: 0.5,
};

export function respondBody(userText: string, overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'session-1',
    kind: 'conversation',
    modeId: 'free',
    roleplayId: null,
    topic: null,
    history: [],
    runningSummary: null,
    userText,
    sttConfidence: null,
    learner: learnerA1,
    ...overrides,
  };
}
