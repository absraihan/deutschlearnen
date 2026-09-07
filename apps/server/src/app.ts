import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { DEFAULT_APP_NAME } from '@deutschlearnen/shared';
import { createContext, type AppContext } from './context';
import type { Env } from './env';
import { registerAuth } from './middleware/auth';
import { registerErrorHandler } from './middleware/errors';
import { conversationRoutes } from './routes/conversation';
import { learningRoutes } from './routes/learning';
import { speakingRoutes } from './routes/speaking';

export interface BuildAppOptions {
  env: Env;
  /** Injected providers, used by the tests to run without network or keys. */
  overrides?: Partial<Omit<AppContext, 'env'>>;
}

export async function buildApp({ env, overrides }: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL },
    bodyLimit: 2 * 1024 * 1024,
  });

  const ctx = createContext(env, overrides);

  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization', 'x-api-token'],
  });

  await app.register(multipart, {
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    // The health check must stay usable even when the learner is being noisy.
    allowList: (request) => request.url === '/health',
  });

  registerErrorHandler(app);
  registerAuth(app, env);

  app.get('/', async (_request, reply) =>
    reply.send({ name: env.APP_NAME || DEFAULT_APP_NAME, status: 'ok' }),
  );

  // Set by the platform (Render exposes RENDER_GIT_COMMIT). Lets us tell which
  // build is actually live instead of guessing whether a deploy landed.
  const commit = (process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? 'dev').slice(0, 8);
  const startedAt = new Date().toISOString();

  app.get('/health', async (_request, reply) =>
    reply.send({
      status: 'ok',
      appName: env.APP_NAME,
      commit,
      startedAt,
      ai: { provider: ctx.ai.name, model: ctx.ai.model },
      stt: { provider: ctx.stt.name },
      tts: { provider: ctx.tts.name },
      authRequired: Boolean(env.API_TOKEN),
      time: new Date().toISOString(),
    }),
  );

  await app.register(async (instance) => conversationRoutes(instance, ctx));
  await app.register(async (instance) => speakingRoutes(instance, ctx));
  await app.register(async (instance) => learningRoutes(instance, ctx));

  return app;
}
