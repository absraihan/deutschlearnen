import { describe, expect, it } from 'vitest';
import { buildTutorSystemPrompt } from '../src/prompts';
import type { LearnerContext } from '../src/types';

function learner(overrides: Partial<LearnerContext> = {}): LearnerContext {
  return {
    level: 'A1',
    targetLevel: 'B2',
    correctionMode: 'NORMAL',
    explanationLanguages: ['de'],
    frequentMistakes: [],
    knownVocabulary: [],
    weakAreas: [],
    longTermSummary: null,
    recentAccuracy: null,
    ...overrides,
  };
}

describe('buildTutorSystemPrompt', () => {
  it('always states the conversation-first priority and the JSON contract', () => {
    const prompt = buildTutorSystemPrompt({ learner: learner(), modeId: 'free' });
    expect(prompt).toContain('Conversation comes first');
    expect(prompt).toContain('"reply"');
    expect(prompt).toContain('OUTPUT FORMAT');
  });

  it('never lets the tutor announce that a sentence is correct', () => {
    const prompt = buildTutorSystemPrompt({ learner: learner(), modeId: 'free' });
    expect(prompt).toContain('your sentence is grammatically correct');
    expect(prompt).toContain('Never say things like');
  });

  it('embeds level-specific behaviour', () => {
    const a1 = buildTutorSystemPrompt({ learner: learner({ level: 'A1' }), modeId: 'free' });
    const b2 = buildTutorSystemPrompt({ learner: learner({ level: 'B2' }), modeId: 'free' });
    expect(a1).toContain('LEVEL A1 BEHAVIOUR');
    expect(a1).toContain('No subordinate clauses');
    expect(b2).toContain('LEVEL B2 BEHAVIOUR');
    expect(b2).toContain('idioms');
    expect(a1).not.toContain('LEVEL B2 BEHAVIOUR');
  });

  it('turns corrections off completely in OFF mode', () => {
    const prompt = buildTutorSystemPrompt({
      learner: learner({ correctionMode: 'OFF' }),
      modeId: 'free',
    });
    expect(prompt).toContain('CORRECTION MODE: OFF');
    expect(prompt).toContain('Set correction to null on every turn');
  });

  it('asks for a natural alternative only in DETAILED mode', () => {
    const normal = buildTutorSystemPrompt({
      learner: learner({ correctionMode: 'NORMAL' }),
      modeId: 'free',
    });
    const detailed = buildTutorSystemPrompt({
      learner: learner({ correctionMode: 'DETAILED' }),
      modeId: 'free',
    });
    expect(detailed).toContain('naturalAlternative');
    expect(normal).toContain('CORRECTION MODE: NORMAL');
  });

  it('requests Bangla and English explanations only when enabled', () => {
    const both = buildTutorSystemPrompt({
      learner: learner({ explanationLanguages: ['de', 'bn', 'en'] }),
      modeId: 'free',
    });
    const germanOnly = buildTutorSystemPrompt({ learner: learner(), modeId: 'free' });
    expect(both).toContain('one-line Bangla version');
    expect(both).toContain('one-line English version');
    expect(germanOnly).toContain('Leave "explanationBn" null');
    expect(germanOnly).toContain('Leave "explanationEn" null');
  });

  it('injects the roleplay character and keeps corrections out of the spoken reply', () => {
    const prompt = buildTutorSystemPrompt({
      learner: learner({ level: 'A1' }),
      modeId: 'roleplay',
      roleplayId: 'cafe-order',
    });
    expect(prompt).toContain('a friendly barista');
    expect(prompt).toContain('Stay in character');
    expect(prompt).toContain('never into the spoken reply while in character');
    expect(prompt).toContain('Sie (formal)');
  });

  it('feeds recurring mistakes back to the tutor', () => {
    const prompt = buildTutorSystemPrompt({
      learner: learner({
        frequentMistakes: [
          {
            category: 'auxiliary-verb',
            wrongText: 'Ich habe gegangen.',
            correctText: 'Ich bin gegangen.',
            count: 7,
          },
        ],
        weakAreas: ['Hilfsverb (sein/haben)'],
      }),
      modeId: 'free',
    });
    expect(prompt).toContain('Ich bin gegangen.');
    expect(prompt).toContain('7x');
    expect(prompt).toContain('Weak areas: Hilfsverb (sein/haben)');
  });

  it('adds the low-confidence retry line verbatim', () => {
    const prompt = buildTutorSystemPrompt({ learner: learner(), modeId: 'free' });
    expect(prompt).toContain('Ich habe dich nicht ganz verstanden.');
  });

  it('refuses to claim an official exam in exam mode', () => {
    const prompt = buildTutorSystemPrompt({
      learner: learner({ level: 'B1' }),
      modeId: 'exam',
      kind: 'exam',
    });
    expect(prompt).toContain('Never claim it is an official Goethe');
  });

  it('carries the running summary instead of the full history', () => {
    const prompt = buildTutorSystemPrompt({
      learner: learner(),
      modeId: 'free',
      runningSummary: 'Der Lernende hat über seine Familie in Dhaka gesprochen.',
    });
    expect(prompt).toContain('EARLIER IN THIS CONVERSATION');
    expect(prompt).toContain('Dhaka');
  });
});
