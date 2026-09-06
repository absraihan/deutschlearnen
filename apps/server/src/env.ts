import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

// Load .env from the server directory first, then the repo root, so a single
// root .env works for a solo developer but per-app overrides are still possible.
loadDotenv({ path: path.resolve(process.cwd(), '.env') });
loadDotenv({ path: path.resolve(process.cwd(), '../../.env') });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),

  APP_NAME: z.string().default('DeutschCoach AI'),

  /** Which AIProvider implementation to construct. */
  AI_PROVIDER: z.enum(['openai', 'anthropic', 'mock']).default('mock'),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_BASE_URL: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5'),
  ANTHROPIC_BASE_URL: z.string().optional(),

  /** Speech-to-text: 'openai-whisper' or 'none' (device recognition only). */
  STT_PROVIDER: z.enum(['openai-whisper', 'none']).default('none'),
  STT_MODEL: z.string().default('whisper-1'),

  /** Server-side text-to-speech: 'openai' or 'none' (device TTS only). */
  TTS_PROVIDER: z.enum(['openai', 'none']).default('none'),
  TTS_MODEL: z.string().default('gpt-4o-mini-tts'),
  TTS_VOICE: z.string().default('alloy'),

  /**
   * Shared secret the mobile app sends as x-api-token. Optional in development;
   * strongly recommended once the server is reachable from your phone.
   */
  API_TOKEN: z.string().optional(),

  /** Comma-separated allowed origins, or '*' for any. */
  CORS_ORIGIN: z.string().default('*'),

  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),

  /** Refuse a turn whose prompt would exceed this, as a cost guard. */
  MAX_PROMPT_TOKENS: z.coerce.number().int().positive().default(6000),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const env = parsed.data;

  // Fail fast on a provider selected without its key, rather than at the first
  // conversation turn the learner tries to have.
  if (env.AI_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
    throw new Error('AI_PROVIDER=openai requires OPENAI_API_KEY. See .env.example.');
  }
  if (env.AI_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
    throw new Error('AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY. See .env.example.');
  }
  if (env.STT_PROVIDER === 'openai-whisper' && !env.OPENAI_API_KEY) {
    throw new Error('STT_PROVIDER=openai-whisper requires OPENAI_API_KEY. See .env.example.');
  }
  if (env.TTS_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
    throw new Error('TTS_PROVIDER=openai requires OPENAI_API_KEY. See .env.example.');
  }

  return env;
}

let cached: Env | null = null;

export function getEnv(): Env {
  if (!cached) cached = parseEnv();
  return cached;
}

/** Test helper: force a fresh read of process.env. */
export function resetEnvCache(): void {
  cached = null;
}
