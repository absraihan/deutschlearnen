import type { FastifyInstance } from 'fastify';
import type { Env } from '../env';

/**
 * Shared-token auth.
 *
 * The server holds the AI keys, so once it is reachable from the phone it must
 * not be open to anyone on the network. A single shared token is the right
 * amount of security for a personal app: no accounts, no sessions, but nobody
 * else can spend your API budget.
 *
 * When API_TOKEN is unset the server runs open and logs a warning - convenient
 * on localhost, called out loudly so it is not shipped by accident.
 */
export function registerAuth(app: FastifyInstance, env: Env): void {
  if (!env.API_TOKEN) {
    app.log.warn(
      'API_TOKEN is not set: the server accepts unauthenticated requests. Set it before exposing this server beyond localhost.',
    );
    return;
  }

  const token = env.API_TOKEN;

  app.addHook('onRequest', async (request, reply) => {
    // Health stays open so a phone can check reachability before it has a token.
    if (request.url === '/health' || request.url === '/') return;

    const provided =
      (request.headers['x-api-token'] as string | undefined) ??
      (request.headers.authorization ?? '').replace(/^Bearer\s+/i, '');

    if (!provided || !safeEqual(provided, token)) {
      reply.status(401).send({
        error: {
          code: 'unauthorized',
          message: 'Missing or invalid x-api-token',
          userMessage: 'Die App ist nicht mit dem Server verbunden. Prüfe die Einstellungen.',
          retryable: false,
        },
      });
    }
  });
}

/** Constant-time comparison so the token cannot be guessed by timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
