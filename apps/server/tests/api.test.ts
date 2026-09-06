import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { TutorTurnSchema } from '@deutschlearnen/shared';
import { makeApp, respondBody, learnerA1 } from './helpers';

let app: FastifyInstance | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
});

describe('health and capabilities', () => {
  it('reports which providers are wired up', async () => {
    app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.ai.provider).toBe('mock');
    expect(body.authRequired).toBe(false);
  });

  it('never claims speech features it does not have', async () => {
    app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/speech/capabilities' });
    const body = res.json();
    expect(body.stt.available).toBe(false);
    expect(body.stt.supportsPronunciationScoring).toBe(false);
    expect(body.stt.locale).toBe('de-DE');
  });
});

describe('POST /api/conversation/respond', () => {
  it('returns a schema-valid tutor turn', async () => {
    app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Hallo. Ich heiße Raihan. Ich wohne in Dhaka.'),
    });
    expect(res.statusCode).toBe(200);
    const parsed = TutorTurnSchema.parse(res.json().turn);
    expect(parsed.reply.length).toBeGreaterThan(0);
    expect(parsed.difficulty).toBe('A1');
  });

  it('does not lecture when the learner made no mistake', async () => {
    app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Hallo!'),
    });
    const turn = res.json().turn;
    expect(turn.correction).toBeNull();
    expect(turn.reply).not.toMatch(/grammatically correct/i);
    expect(turn.reply).not.toMatch(/korrekt/i);
  });

  it('corrects the spec example and keeps talking', async () => {
    app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Gestern ich habe zum Markt gegangen.'),
    });
    const turn = res.json().turn;
    expect(turn.correction.corrected).toBe('Gestern bin ich zum Markt gegangen.');
    expect(turn.correction.category).toBe('auxiliary-verb');
    expect(turn.followUpQuestion).toBeTruthy();
    expect(turn.reply).toContain('?');
  });

  it('honours correction mode OFF', async () => {
    app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Ich habe gegangen.', {
        learner: { ...learnerA1, correctionMode: 'OFF' },
      }),
    });
    expect(res.json().turn.correction).toBeNull();
  });

  it('omits the explanation in MINIMAL mode but still corrects', async () => {
    app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Ich habe gegangen.', {
        learner: { ...learnerA1, correctionMode: 'MINIMAL' },
      }),
    });
    const correction = res.json().turn.correction;
    expect(correction.corrected).toBe('Ich bin gegangen.');
    expect(correction.explanation).toBe('');
  });

  it('includes a Bangla explanation only when requested', async () => {
    app = await makeApp();
    const withBangla = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Ich habe gegangen.'),
    });
    const germanOnly = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Ich habe gegangen.', {
        learner: { ...learnerA1, explanationLanguages: ['de'] },
      }),
    });
    expect(withBangla.json().turn.correction.explanationBn).toBeTruthy();
    expect(germanOnly.json().turn.correction.explanationBn).toBeNull();
  });

  it('asks the learner to repeat instead of guessing at empty speech', async () => {
    app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('a'),
    });
    const turn = res.json().turn;
    expect(turn.needsRetry).toBe(true);
    expect(turn.reply).toContain('Ich habe dich nicht ganz verstanden');
  });

  it('rejects an empty utterance with a 400 rather than calling the model', async () => {
    app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody(''),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_request');
    expect(res.json().error.userMessage).toBeTruthy();
  });

  it('rejects an unknown CEFR level', async () => {
    app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Hallo', { learner: { ...learnerA1, level: 'C1' } }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('refuses a conversation that has grown past the cost guard', async () => {
    app = await makeApp({}, { MAX_PROMPT_TOKENS: 1200 });
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Hallo', {
        history: Array.from({ length: 10 }, (_, i) => ({
          speaker: i % 2 === 0 ? 'user' : 'ai',
          text: 'x'.repeat(400),
        })),
      }),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('context_too_large');
    expect(res.json().error.userMessage).toContain('Sitzung');
  });
});

describe('openings', () => {
  it('serves a deterministic opening for a mode and level', async () => {
    app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/conversation/opening?modeId=restaurant&level=A1',
    });
    expect(res.json().opening).toContain('Was möchten Sie trinken?');
  });

  it('prefers the roleplay opening when one is given', async () => {
    app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/conversation/opening?roleplayId=cafe-order&level=A1',
    });
    expect(res.json().source).toBe('roleplay');
    expect(res.json().opening).toContain('Was darf es sein?');
  });

  it('falls back safely for an unknown mode', async () => {
    app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/conversation/opening?modeId=does-not-exist&level=B2',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().opening.length).toBeGreaterThan(0);
  });
});

describe('analysis and generation endpoints', () => {
  it('analyses a sentence and reports the issue', async () => {
    app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversation/analyze',
      payload: { text: 'Ich finde, dass Homeoffice ist besser.', level: 'B2', explanationLanguages: ['de'] },
    });
    const analysis = res.json().analysis;
    expect(analysis.isCorrect).toBe(false);
    expect(analysis.corrected).toBe('Ich finde, dass Homeoffice besser ist.');
  });

  it('labels pronunciation feedback as an estimate, never as measured', async () => {
    app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/speaking/evaluate',
      payload: {
        transcript: 'Ich möchte über Bücher sprechen.',
        level: 'A2',
        sttConfidence: 0.8,
        hasAudioScoring: true,
      },
    });
    const p = res.json().pronunciation;
    expect(p.method).toBe('estimated-from-transcript');
    expect(p.confidenceNote).toContain('keine gemessene');
  });

  it('scores a session and returns a German summary', async () => {
    app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/session/summary',
      payload: {
        sessionId: 's1',
        level: 'A1',
        kind: 'conversation',
        topic: 'Familie',
        durationSec: 600,
        messages: [
          { speaker: 'ai', text: 'Hallo! Wie geht es dir?' },
          { speaker: 'user', text: 'Mir geht es gut, danke.' },
          { speaker: 'ai', text: 'Was machst du heute?' },
          { speaker: 'user', text: 'Ich arbeite und dann koche ich.' },
        ],
        corrections: [],
        explanationLanguages: ['de'],
        hasPronunciationData: false,
      },
    });
    const evaluation = res.json().evaluation;
    expect(evaluation.overallScore).toBeGreaterThan(0);
    expect(evaluation.overallScore).toBeLessThanOrEqual(100);
    expect(evaluation.pronunciationScore).toBeNull();
    expect(evaluation.summary.length).toBeGreaterThan(0);
  });

  it('generates vocabulary and respects the exclusion list', async () => {
    app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/vocabulary/generate',
      payload: { level: 'A2', topic: 'Reisen', count: 3, includeBangla: true, exclude: ['Bahnhof'] },
    });
    const items = res.json().items;
    expect(items).toHaveLength(3);
    expect(items.map((i: { german: string }) => i.german)).not.toContain('Bahnhof');
    expect(items[0].bangla).toBeTruthy();
  });

  it('deduplicates mistakes and ranks them by frequency', async () => {
    app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/mistakes',
      payload: {
        level: 'A2',
        mistakes: [
          { category: 'auxiliary-verb', wrongText: 'Ich habe gegangen.', correctText: 'Ich bin gegangen.', count: 3 },
          { category: 'auxiliary-verb', wrongText: 'ich habe gegangen', correctText: 'ich bin gegangen', count: 4 },
          { category: 'word-order', wrongText: 'Gestern ich gehe.', correctText: 'Gestern gehe ich.', count: 2 },
        ],
        generateDrills: true,
        drillCount: 3,
      },
    });
    const body = res.json();
    expect(body.ranked).toHaveLength(2);
    expect(body.ranked[0].count).toBe(7);
    expect(body.weakAreas[0]).toBe('Hilfsverb (sein/haben)');
    expect(body.drills.exercises).toHaveLength(3);
  });

  it('returns the mistake taxonomy with German labels', async () => {
    app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/mistakes' });
    const body = res.json();
    expect(body.storage).toBe('device-local');
    expect(body.categories.find((c: { id: string }) => c.id === 'word-order').labelDe).toBe(
      'Satzstellung',
    );
  });

  it('returns level benchmarks for the dashboard', async () => {
    app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/progress' });
    expect(res.json().levels).toHaveLength(4);
  });
});

describe('speech endpoints without a configured provider', () => {
  it('explains that server transcription is off instead of crashing', async () => {
    app = await makeApp();
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(4096)], { type: 'audio/m4a' }), 'a.m4a');
    const res = await app.inject({
      method: 'POST',
      url: '/api/speech/transcribe',
      payload: form,
    });
    expect(res.statusCode).toBe(501);
    expect(res.json().error.code).toBe('stt_not_configured');
    expect(res.json().error.userMessage).toContain('Gerät');
  });

  it('rejects a transcription request with no audio at all', async () => {
    app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/speech/transcribe',
      payload: new FormData(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('no_audio');
  });

  it('explains that server TTS is off, so the device can speak instead', async () => {
    app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/speech/speak',
      payload: { text: 'Guten Tag!', speed: 1 },
    });
    expect(res.statusCode).toBe(501);
    expect(res.json().error.code).toBe('tts_not_configured');
  });
});

describe('auth', () => {
  it('rejects requests without the shared token when one is configured', async () => {
    app = await makeApp({}, { API_TOKEN: 'secret-token' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      payload: respondBody('Hallo'),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthorized');
  });

  it('accepts the token via x-api-token', async () => {
    app = await makeApp({}, { API_TOKEN: 'secret-token' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/conversation/respond',
      headers: { 'x-api-token': 'secret-token' },
      payload: respondBody('Hallo'),
    });
    expect(res.statusCode).toBe(200);
  });

  it('keeps /health open so the app can test reachability', async () => {
    app = await makeApp({}, { API_TOKEN: 'secret-token' });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });
});

describe('unknown routes', () => {
  it('returns a friendly German message', async () => {
    app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.userMessage).toBeTruthy();
  });
});
