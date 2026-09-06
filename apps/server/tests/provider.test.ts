import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatBasedProvider } from '../src/providers/ai/base';
import { AIProviderError, type AIUsage, type ChatMessage } from '../src/providers/ai/types';
import { estimateWhisperConfidence } from '../src/providers/speech';
import { makeApp, respondBody } from './helpers';

/** A provider whose chat() returns whatever the test queued up. */
class ScriptedProvider extends ChatBasedProvider {
  readonly name = 'scripted';
  readonly model = 'scripted-1';
  calls: ChatMessage[][] = [];

  constructor(private readonly responses: Array<string | Error>) {
    super();
  }

  async chat(messages: ChatMessage[]): Promise<{ text: string; usage: AIUsage | null }> {
    this.calls.push(messages);
    const next = this.responses.shift();
    if (next === undefined) throw new Error('ScriptedProvider ran out of responses');
    if (next instanceof Error) throw next;
    return { text: next, usage: { promptTokens: 100, completionTokens: 50, cached: false } };
  }
}

const goodTurn = JSON.stringify({
  reply: 'Schön! Was machst du beruflich?',
  correction: null,
  vocabulary: [],
  difficulty: 'A1',
  followUpQuestion: 'Was machst du beruflich?',
  turnAccuracy: 0.9,
  needsRetry: false,
});

let app: FastifyInstance | null = null;
afterEach(async () => {
  await app?.close();
  app = null;
});

describe('invalid AI JSON handling', () => {
  it('unwraps a markdown fence without a retry', async () => {
    const ai = new ScriptedProvider([`Here you go:\n\`\`\`json\n${goodTurn}\n\`\`\``]);
    app = await makeApp({ ai });
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Hallo'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().turn.reply).toContain('beruflich');
    expect(ai.calls).toHaveLength(1);
  });

  it('retries once with a repair instruction when the JSON is unusable', async () => {
    const ai = new ScriptedProvider(['I cannot produce JSON right now.', goodTurn]);
    app = await makeApp({ ai });
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Hallo'),
    });
    expect(res.statusCode).toBe(200);
    expect(ai.calls).toHaveLength(2);
    expect(ai.calls[1]!.at(-1)!.content).toContain('not valid JSON');
  });

  it('fails with a friendly German message when both attempts are unusable', async () => {
    const ai = new ScriptedProvider(['nope', 'still nope']);
    app = await makeApp({ ai });
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Hallo'),
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('invalid_ai_json');
    expect(res.json().error.userMessage).toContain('Tutor');
    expect(res.json().error.retryable).toBe(true);
  });

  it('rejects JSON that parses but breaks the schema', async () => {
    const bad = JSON.stringify({ reply: 'Hallo', difficulty: 'C2' });
    const ai = new ScriptedProvider([bad, bad]);
    app = await makeApp({ ai });
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Hallo'),
    });
    expect(res.statusCode).toBe(502);
  });
});

describe('provider transport failures', () => {
  it('turns a network failure into a retryable German error', async () => {
    const ai = new ScriptedProvider([
      new AIProviderError({
        code: 'network_error',
        message: 'socket hang up',
        userMessage: 'Keine Verbindung zum Tutor. Prüfe dein Internet.',
        retryable: true,
        status: 503,
      }),
    ]);
    app = await makeApp({ ai });
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Hallo'),
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.userMessage).toContain('Internet');
    expect(res.json().error.retryable).toBe(true);
  });

  it('maps a rate limit to 429 with wait-and-retry wording', async () => {
    const ai = new ScriptedProvider([
      new AIProviderError({
        code: 'rate_limited',
        message: '429',
        userMessage: 'Zu viele Anfragen. Warte einen Moment und sprich dann weiter.',
        retryable: true,
        status: 429,
      }),
    ]);
    app = await makeApp({ ai });
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Hallo'),
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.userMessage).toContain('Warte');
  });

  it('never leaks the API key into an error body', async () => {
    const ai = new ScriptedProvider([new Error('Bearer sk-test-abc123 was rejected')]);
    app = await makeApp({ ai });
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Hallo'),
    });
    expect(res.json().error.userMessage).not.toContain('sk-test');
  });
});

describe('context management', () => {
  it('summarises old turns instead of resending them', async () => {
    const ai = new ScriptedProvider(['Der Lernende hat über seine Familie gesprochen.', goodTurn]);
    app = await makeApp({ ai });

    const history = Array.from({ length: 20 }, (_, i) => ({
      speaker: i % 2 === 0 ? ('user' as const) : ('ai' as const),
      text: `Nachricht ${i}`,
    }));

    const res = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Und jetzt?', { history }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().runningSummary).toContain('Familie');

    // The turn call must carry far fewer messages than the raw history.
    const turnCall = ai.calls[1]!;
    expect(turnCall.length).toBeLessThan(history.length);
    expect(turnCall[0]!.content).toContain('EARLIER IN THIS CONVERSATION');
  });

  it('still answers when summarisation itself fails', async () => {
    const ai = new ScriptedProvider([new Error('summary provider down'), goodTurn]);
    app = await makeApp({ ai });
    const history = Array.from({ length: 20 }, (_, i) => ({
      speaker: i % 2 === 0 ? ('user' as const) : ('ai' as const),
      text: `Nachricht ${i}`,
    }));
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Und jetzt?', { history }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().turn.reply).toContain('beruflich');
  });

  it('sends the whole history verbatim for a short conversation', async () => {
    const ai = new ScriptedProvider([goodTurn]);
    app = await makeApp({ ai });
    await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Hallo', {
        history: [
          { speaker: 'ai', text: 'Guten Tag!' },
          { speaker: 'user', text: 'Hallo!' },
        ],
      }),
    });
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]!).toHaveLength(4); // system + 2 history + current
  });
});

describe('low speech confidence', () => {
  it('warns the model that the transcript may be wrong', async () => {
    const ai = new ScriptedProvider([goodTurn]);
    app = await makeApp({ ai });
    await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Ich mokte ein kafi', { sttConfidence: 0.3 }),
    });
    expect(ai.calls[0]!.at(-1)!.content).toContain('confidence was low');
  });

  it('says nothing extra when confidence is good', async () => {
    const ai = new ScriptedProvider([goodTurn]);
    app = await makeApp({ ai });
    await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Ich möchte einen Kaffee', { sttConfidence: 0.95 }),
    });
    expect(ai.calls[0]!.at(-1)!.content).not.toContain('confidence was low');
  });
});

describe('estimateWhisperConfidence', () => {
  it('returns null when the provider gave no segments', () => {
    expect(estimateWhisperConfidence(undefined)).toBeNull();
    expect(estimateWhisperConfidence([])).toBeNull();
  });

  it('scores clear speech high and unclear speech low', () => {
    const clear = estimateWhisperConfidence([{ avg_logprob: -0.1, no_speech_prob: 0.01 }]);
    const unclear = estimateWhisperConfidence([{ avg_logprob: -1.2, no_speech_prob: 0.6 }]);
    expect(clear).toBeGreaterThan(0.8);
    expect(unclear).toBeLessThan(0.3);
  });

  it('stays inside 0-1 for extreme values', () => {
    const value = estimateWhisperConfidence([{ avg_logprob: -10, no_speech_prob: 1 }]);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  });
});
