import {
  AnalyzeRequestSchema,
  RespondRequestSchema,
  type CefrLevel,
} from '@deutschlearnen/shared';
import type { FastifyInstance } from 'fastify';
import { userAiKeyFrom, type AppContext } from '../context';

export async function conversationRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<void> {
  /**
   * One turn of conversation. This is the endpoint the microphone button
   * ultimately drives, and the only one on the hot path of a session.
   */
  app.post('/api/conversation/respond', async (request, reply) => {
    const body = RespondRequestSchema.parse(request.body);
    const result = await ctx.conversation.respond(body, ctx.aiFor(userAiKeyFrom(request.headers)));

    request.log.info(
      {
        sessionId: body.sessionId,
        level: body.learner.level,
        mode: body.modeId,
        promptTokens: result.usage?.promptTokens ?? null,
        completionTokens: result.usage?.completionTokens ?? null,
        corrected: Boolean(result.turn.correction?.hasError),
      },
      'conversation turn',
    );

    return reply.send(result);
  });

  /** Deep analysis of a single sentence, used by the correction detail screen. */
  app.post('/api/conversation/analyze', async (request, reply) => {
    const body = AnalyzeRequestSchema.parse(request.body);
    const result = await ctx.aiFor(userAiKeyFrom(request.headers)).analyzeGrammar(body);
    return reply.send({ analysis: result.value, usage: result.usage });
  });

  /**
   * The opening line for a new session. Deterministic and local (it comes from
   * the mode catalogue), so starting a session costs nothing and works offline.
   */
  app.get('/api/conversation/opening', async (request, reply) => {
    const query = request.query as { modeId?: string; level?: string; roleplayId?: string };
    const { getMode, getRoleplay, CEFR_LEVELS } = await import('@deutschlearnen/shared');

    const level = (CEFR_LEVELS as readonly string[]).includes(query.level ?? '')
      ? (query.level as CefrLevel)
      : 'A1';

    if (query.roleplayId) {
      const scenario = getRoleplay(query.roleplayId);
      if (scenario) {
        return reply.send({ opening: scenario.opening, source: 'roleplay' });
      }
    }

    const mode = getMode(query.modeId ?? 'free');
    const opening =
      mode?.openings[level] ?? 'Hallo! Schön, dass du da bist. Wie geht es dir heute?';
    return reply.send({ opening, source: 'mode' });
  });
}
