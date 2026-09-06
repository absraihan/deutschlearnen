import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  InvalidAIResponseError,
  extractJsonBlock,
  parseAIJson,
  parseAIJsonSafe,
  parseLooseJson,
} from '../src/json';
import { TutorTurnSchema } from '../src/schemas';

const validTurn = {
  reply: 'Sehr gut! Was hast du dort gekauft?',
  correction: {
    hasError: true,
    original: 'Gestern ich habe zum Markt gegangen.',
    corrected: 'Gestern bin ich zum Markt gegangen.',
    explanation: 'Bei "gehen" benutzen wir im Perfekt "sein".',
    category: 'auxiliary-verb',
    severity: 'important',
  },
  vocabulary: [],
  difficulty: 'A2',
  followUpQuestion: 'Was hast du dort gekauft?',
  turnAccuracy: 0.6,
  needsRetry: false,
};

describe('extractJsonBlock', () => {
  it('unwraps a markdown fence', () => {
    const raw = '```json\n{"a":1}\n```';
    expect(extractJsonBlock(raw)).toBe('{"a":1}');
  });

  it('drops prose before and after the object', () => {
    const raw = 'Sure! Here you go:\n{"a":1}\nHope that helps.';
    expect(extractJsonBlock(raw)).toBe('{"a":1}');
  });
});

describe('parseLooseJson', () => {
  it('repairs trailing commas', () => {
    expect(parseLooseJson('{"a":1,"b":2,}')).toEqual({ a: 1, b: 2 });
  });

  it('repairs smart quotes', () => {
    expect(parseLooseJson('{“a”:1}')).toEqual({ a: 1 });
  });

  it('throws a typed error on unrecoverable output', () => {
    expect(() => parseLooseJson('completely not json')).toThrow(InvalidAIResponseError);
  });
});

describe('parseAIJson with the tutor schema', () => {
  it('accepts a well formed turn', () => {
    const parsed = parseAIJson(JSON.stringify(validTurn), TutorTurnSchema);
    expect(parsed.reply).toContain('gekauft');
    expect(parsed.correction?.corrected).toBe('Gestern bin ich zum Markt gegangen.');
    expect(parsed.correction?.category).toBe('auxiliary-verb');
  });

  it('preserves umlauts and eszett through the whole pipeline', () => {
    const turn = {
      ...validTurn,
      reply: 'Schön! Grüße aus München. Wie groß ist deine Straße?',
      correction: {
        ...validTurn.correction,
        corrected: 'Ich möchte einen Kaffee für die Prüfung, bitte schön.',
        explanation: 'Nach "möchten" steht der Akkusativ: einen Kaffee.',
      },
    };
    const parsed = parseAIJson(`\`\`\`json\n${JSON.stringify(turn)}\n\`\`\``, TutorTurnSchema);
    expect(parsed.reply).toBe('Schön! Grüße aus München. Wie groß ist deine Straße?');
    expect(parsed.correction?.corrected).toContain('möchte');
    expect(parsed.correction?.explanation).toContain('Akkusativ');
  });

  it('applies defaults for omitted optional fields', () => {
    const minimal = { reply: 'Hallo!', difficulty: 'A1' };
    const parsed = parseAIJson(JSON.stringify(minimal), TutorTurnSchema);
    expect(parsed.correction).toBeNull();
    expect(parsed.vocabulary).toEqual([]);
    expect(parsed.needsRetry).toBe(false);
  });

  it('rejects a turn with an unknown correction category', () => {
    const bad = {
      ...validTurn,
      correction: { ...validTurn.correction, category: 'quantum-grammar' },
    };
    expect(() => parseAIJson(JSON.stringify(bad), TutorTurnSchema)).toThrow(InvalidAIResponseError);
  });

  it('rejects an empty reply', () => {
    expect(() => parseAIJson(JSON.stringify({ ...validTurn, reply: '' }), TutorTurnSchema)).toThrow(
      InvalidAIResponseError,
    );
  });

  it('reports which field failed', () => {
    try {
      parseAIJson(JSON.stringify({ reply: 'Hallo', difficulty: 'C1' }), TutorTurnSchema);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidAIResponseError);
      expect((error as InvalidAIResponseError).issues.join()).toContain('difficulty');
    }
  });
});

describe('parseAIJsonSafe', () => {
  const fallback = { ok: true } as unknown;
  const schema = z.object({ ok: z.boolean() });

  it('returns the parsed value when valid', () => {
    const result = parseAIJsonSafe('{"ok":false}', schema, fallback as { ok: boolean });
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ ok: false });
  });

  it('falls back instead of throwing when the model misbehaves', () => {
    const result = parseAIJsonSafe('garbage', schema, fallback as { ok: boolean });
    expect(result.ok).toBe(false);
    expect(result.value).toEqual({ ok: true });
    expect(result.error).toBeInstanceOf(InvalidAIResponseError);
  });
});
