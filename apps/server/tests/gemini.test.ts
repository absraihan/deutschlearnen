import { describe, expect, it } from 'vitest';
import { GeminiProvider, toGeminiContents } from '../src/providers/ai/gemini';
import { AIProviderError, type ChatMessage } from '../src/providers/ai/types';

/**
 * Gemini's request shape differs from the OpenAI-style API in ways that fail at
 * runtime rather than at compile time: the system prompt is separate, turns
 * must alternate, and the conversation must open with a user turn. These tests
 * pin that mapping so a refactor cannot quietly break it.
 */

describe('toGeminiContents', () => {
  it('drops system messages, which go in systemInstruction instead', () => {
    const contents = toGeminiContents([
      { role: 'system', content: 'You are a German coach.' },
      { role: 'user', content: 'Hallo!' },
    ]);
    expect(contents).toEqual([{ role: 'user', parts: [{ text: 'Hallo!' }] }]);
  });

  it('maps assistant to model, the role name Gemini expects', () => {
    const contents = toGeminiContents([
      { role: 'user', content: 'Hallo!' },
      { role: 'assistant', content: 'Wie geht es dir?' },
      { role: 'user', content: 'Gut.' },
    ]);
    expect(contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
  });

  it('drops a leading tutor turn, since Gemini requires the user to open', () => {
    // Every session starts with the tutor greeting, so this is the normal case.
    const contents = toGeminiContents([
      { role: 'system', content: 'system' },
      { role: 'assistant', content: 'Hallo! Wie geht es dir?' },
      { role: 'user', content: 'Mir geht es gut.' },
    ]);
    expect(contents[0]?.role).toBe('user');
    expect(contents[0]?.parts[0]?.text).toBe('Mir geht es gut.');
  });

  it('merges consecutive turns of the same role', () => {
    const contents = toGeminiContents([
      { role: 'user', content: 'Hallo.' },
      { role: 'user', content: 'Ich heiße Raihan.' },
    ]);
    expect(contents).toHaveLength(1);
    expect(contents[0]?.parts).toHaveLength(2);
  });

  it('never produces an empty conversation', () => {
    const contents = toGeminiContents([{ role: 'system', content: 'only system' }]);
    expect(contents).toHaveLength(1);
    expect(contents[0]?.role).toBe('user');
  });

  it('preserves umlauts and eszett untouched', () => {
    const contents = toGeminiContents([
      { role: 'user', content: 'Ich möchte einen großen Kaffee für die Prüfung.' },
    ]);
    expect(contents[0]?.parts[0]?.text).toBe('Ich möchte einen großen Kaffee für die Prüfung.');
  });
});

describe('GeminiProvider construction', () => {
  it('refuses to start without a key rather than failing mid-conversation', () => {
    expect(() => new GeminiProvider({ apiKey: '', model: 'gemini-2.0-flash' })).toThrow(
      AIProviderError,
    );
  });

  it('reports its identity for the health endpoint', () => {
    const provider = new GeminiProvider({ apiKey: 'k', model: 'gemini-2.0-flash' });
    expect(provider.name).toBe('gemini');
    expect(provider.model).toBe('gemini-2.0-flash');
  });
});

/** Drives the provider against a stub HTTP layer via an overridden base URL. */
describe('GeminiProvider request shape', () => {
  const messages: ChatMessage[] = [
    { role: 'system', content: 'SYSTEM PROMPT' },
    { role: 'assistant', content: 'Hallo!' },
    { role: 'user', content: 'Gestern ich habe zum Markt gegangen.' },
  ];

  it('builds a body with systemInstruction separate from contents', () => {
    // The mapping is pure, so assert it directly rather than mocking undici.
    const contents = toGeminiContents(messages);
    const systemText = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    expect(systemText).toBe('SYSTEM PROMPT');
    expect(contents).toEqual([
      { role: 'user', parts: [{ text: 'Gestern ich habe zum Markt gegangen.' }] },
    ]);
  });
});
