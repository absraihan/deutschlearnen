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
        appName: 'DeutschLearnen',
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

/**
 * Cold-start resilience.
 *
 * Free hosting sleeps when idle. On a real device this surfaced as "no
 * connection" on a perfectly good mobile network, because the first request
 * after the server slept was refused outright.
 */
describe('transport retry and warm-up', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const ok = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

  it('retries once when the connection is refused, then succeeds', async () => {
    const spy = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(ok({ status: 'ok' }));
    global.fetch = spy as unknown as typeof fetch;

    await expect(api.health()).resolves.toMatchObject({ status: 'ok' });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('gives up after one retry rather than hanging the learner', async () => {
    const spy = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    global.fetch = spy as unknown as typeof fetch;

    await expect(api.health()).rejects.toMatchObject({ code: 'offline' });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('does not retry a real HTTP error, which is an answer not a dropped call', async () => {
    const spy = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'unauthorized', userMessage: 'x', retryable: false } }),
    } as unknown as Response);
    global.fetch = spy as unknown as typeof fetch;

    await expect(api.health()).rejects.toMatchObject({ code: 'unauthorized' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('warmUp never throws, even when the server is unreachable', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Network request failed')) as unknown as typeof fetch;
    expect(() => api.warmUp()).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});
