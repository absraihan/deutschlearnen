import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodError } from 'zod';
import { AIProviderError } from '../providers/ai/types';

/**
 * Error identification is by shape, not `instanceof`.
 *
 * @deutschlearnen/shared is consumed as a CommonJS build while the server source
 * is ESM under the bundler, so a ZodError thrown by a shared schema is a
 * *different class object* from the one `import { ZodError } from 'zod'` gives
 * us here. `instanceof` silently returns false and every validation failure
 * becomes a 500. Duck typing is the correct check across module realms.
 */
function isZodError(error: unknown): error is ZodError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'ZodError' &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

function isInvalidAIResponseError(
  error: unknown,
): error is { message: string; issues: string[] } {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'InvalidAIResponseError'
  );
}

function isAIProviderError(error: unknown): error is AIProviderError {
  return (
    error instanceof AIProviderError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { name?: string }).name === 'AIProviderError')
  );
}

/**
 * One place that turns any thrown error into the ApiError contract.
 * Every error the mobile app can receive carries a German `userMessage` that is
 * safe to show directly, so no screen has to invent its own wording.
 */
export interface ErrorBody {
  error: {
    code: string;
    message: string;
    userMessage: string;
    retryable: boolean;
  };
}

export function toErrorBody(error: unknown): { status: number; body: ErrorBody } {
  if (isAIProviderError(error)) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          userMessage: error.userMessage,
          retryable: error.retryable,
        },
      },
    };
  }

  if (isInvalidAIResponseError(error)) {
    return {
      status: 502,
      body: {
        error: {
          code: 'invalid_ai_json',
          message: error.message,
          userMessage: 'Der Tutor hat gerade unverständlich geantwortet. Bitte noch einmal.',
          retryable: true,
        },
      },
    };
  }

  if (isZodError(error)) {
    return {
      status: 400,
      body: {
        error: {
          code: 'invalid_request',
          message: error.issues
            .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
            .join('; '),
          userMessage: 'Die Anfrage war ungültig.',
          retryable: false,
        },
      },
    };
  }

  const fastifyError = error as { statusCode?: number; code?: string; message?: string };
  if (fastifyError?.statusCode === 429) {
    return {
      status: 429,
      body: {
        error: {
          code: 'rate_limited',
          message: fastifyError.message ?? 'Too many requests',
          userMessage: 'Zu viele Anfragen. Warte kurz und sprich dann weiter.',
          retryable: true,
        },
      },
    };
  }

  return {
    status: fastifyError?.statusCode && fastifyError.statusCode >= 400 ? fastifyError.statusCode : 500,
    body: {
      error: {
        code: fastifyError?.code ?? 'internal_error',
        message: fastifyError?.message ?? 'Unexpected error',
        userMessage: 'Etwas ist schiefgelaufen. Bitte versuche es noch einmal.',
        retryable: true,
      },
    },
  };
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
    const { status, body } = toErrorBody(error);
    if (status >= 500) {
      request.log.error({ err: error }, 'request failed');
    } else {
      request.log.warn({ code: body.error.code, msg: body.error.message }, 'request rejected');
    }
    reply.status(status).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: 'not_found',
        message: `No route for ${request.method} ${request.url}`,
        userMessage: 'Diese Funktion gibt es nicht.',
        retryable: false,
      },
    } satisfies ErrorBody);
  });
}
