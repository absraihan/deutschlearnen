import { ApiClientError, api } from '@/services/api';

/**
 * The API client is the only place network failure is translated into something
 * the learner reads, so every branch has to produce a German message.
 */
describe('ApiClientError mapping', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function mockFetch(impl: () => Promise<Response> | never): void {
    global.fetch = jest.fn(impl) as unknown as typeof fetch;
  }

  function jsonResponse(status: number, body: unknown): Response {
    return {
      ok: status < 400,
      status,
      json: async () => body,
    } as unknown as Response;
  }

  it('turns a dropped connection into an offline message', async () => {
    mockFetch(() => Promise.reject(new TypeError('Network request failed')));
    await expect(api.health()).rejects.toMatchObject({
      code: 'offline',
      retryable: true,
    });
    await expect(api.health()).rejects.toThrow(ApiClientError);
  });

  it('mentions the server address so a wrong IP is diagnosable', async () => {
    mockFetch(() => Promise.reject(new TypeError('Network request failed')));
    try {
      await api.health();
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as ApiClientError).userMessage).toMatch(/Server-Adresse|Internet/);
    }
  });

  it('passes the German message from the server through untouched', async () => {
    mockFetch(async () =>
      jsonResponse(429, {
        error: {
          code: 'rate_limited',
          message: 'Too many requests',
          userMessage: 'Zu viele Anfragen. Warte einen Moment und sprich dann weiter.',
          retryable: true,
        },
      }),
    );

    try {
      await api.health();
      throw new Error('should have thrown');
    } catch (error) {
      const apiError = error as ApiClientError;
      expect(apiError.code).toBe('rate_limited');
      expect(apiError.userMessage).toContain('Warte einen Moment');
      expect(apiError.retryable).toBe(true);
    }
  });

  it('still produces a usable error when the body is not JSON', async () => {
    mockFetch(async () => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    }) as unknown as Response);

    try {
      await api.health();
      throw new Error('should have thrown');
    } catch (error) {
      const apiError = error as ApiClientError;
      expect(apiError.code).toBe('http_502');
      expect(apiError.userMessage.length).toBeGreaterThan(0);
      expect(apiError.retryable).toBe(true);
    }
  });

  it('treats a 4xx as not worth retrying automatically', async () => {
    mockFetch(async () => jsonResponse(400, {}));
    try {
      await api.health();
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as ApiClientError).retryable).toBe(false);
    }
  });

  it('returns the parsed body on success', async () => {
    mockFetch(async () =>
      jsonResponse(200, {
        status: 'ok',
        appName: 'DeutschCoach AI',
        ai: { provider: 'mock', model: 'rule-based-offline' },
        stt: { provider: 'none' },
        tts: { provider: 'none' },
        authRequired: false,
      }),
    );
    const health = await api.health();
    expect(health.ai.provider).toBe('mock');
  });

  it('sends the shared token when one is configured', async () => {
    process.env.EXPO_PUBLIC_API_TOKEN = 'test-token';
    const spy = jest.fn(async () => jsonResponse(200, { status: 'ok' }));
    global.fetch = spy as unknown as typeof fetch;

    await api.health();

    const headers = (spy.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(headers['x-api-token']).toBe('test-token');
    delete process.env.EXPO_PUBLIC_API_TOKEN;
  });
});
