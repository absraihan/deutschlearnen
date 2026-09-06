import { describe, expect, it } from 'vitest';
import {
  computeHeuristicScores,
  computeStreak,
  deriveWeakAreas,
  fillProgressWindow,
  normalizeForComparison,
  recentAccuracy,
  turnWordStats,
  type TurnStat,
} from '../src/scoring';
import { mergeSummaries, trimConversation, truncateWords } from '../src/context';

function turn(overrides: Partial<TurnStat> = {}): TurnStat {
  return {
    words: 10,
    uniqueWords: 9,
    hadCorrection: false,
    severity: null,
    accuracy: null,
    sttConfidence: null,
    ...overrides,
  };
}

describe('turnWordStats', () => {
  it('counts German words with umlauts and eszett as single tokens', () => {
    const stats = turnWordStats('Ich möchte einen großen Kaffee, bitte schön!');
    expect(stats.words).toBe(7);
    expect(stats.uniqueWords).toBe(7);
  });

  it('detects repetition', () => {
    const stats = turnWordStats('ja ja ja ja');
    expect(stats.words).toBe(4);
    expect(stats.uniqueWords).toBe(1);
  });
});

describe('computeHeuristicScores', () => {
  it('returns zeros for an empty session rather than NaN', () => {
    const scores = computeHeuristicScores([], 'A1');
    expect(scores.overallScore).toBe(0);
    expect(scores.pronunciationScore).toBeNull();
  });

  it('scores a clean session above a mistake-heavy one', () => {
    const clean = computeHeuristicScores(
      Array.from({ length: 6 }, () => turn({ words: 8, uniqueWords: 8 })),
      'A1',
    );
    const messy = computeHeuristicScores(
      Array.from({ length: 6 }, () =>
        turn({ words: 8, uniqueWords: 8, hadCorrection: true, severity: 'critical' }),
      ),
      'A1',
    );
    expect(clean.grammarScore).toBeGreaterThan(messy.grammarScore);
    expect(clean.overallScore).toBeGreaterThan(messy.overallScore);
  });

  it('judges relative to the level: short answers are fine at A1, weak at B2', () => {
    const shortTurns = Array.from({ length: 5 }, () => turn({ words: 6, uniqueWords: 6 }));
    const a1 = computeHeuristicScores(shortTurns, 'A1');
    const b2 = computeHeuristicScores(shortTurns, 'B2');
    expect(a1.fluencyScore).toBeGreaterThan(b2.fluencyScore);
  });

  it('only reports a pronunciation score when the recogniser supplied confidence', () => {
    const withoutConfidence = computeHeuristicScores([turn(), turn()], 'A2');
    const withConfidence = computeHeuristicScores(
      [turn({ sttConfidence: 0.9 }), turn({ sttConfidence: 0.85 })],
      'A2',
    );
    expect(withoutConfidence.pronunciationScore).toBeNull();
    expect(withConfidence.pronunciationScore).toBeGreaterThan(80);
  });

  it('keeps every score inside 0-100', () => {
    const extreme = computeHeuristicScores(
      Array.from({ length: 10 }, () =>
        turn({ words: 200, uniqueWords: 200, severity: 'critical', hadCorrection: true }),
      ),
      'A1',
    );
    for (const value of Object.values(extreme)) {
      if (value === null) continue;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});

describe('recentAccuracy', () => {
  it('prefers AI accuracy when present', () => {
    expect(recentAccuracy([turn({ accuracy: 0.4 }), turn({ accuracy: 0.6 })])).toBeCloseTo(0.5);
  });

  it('falls back to the share of uncorrected turns', () => {
    const value = recentAccuracy([
      turn({ hadCorrection: true }),
      turn({ hadCorrection: false }),
      turn({ hadCorrection: false }),
      turn({ hadCorrection: false }),
    ]);
    expect(value).toBeCloseTo(0.75);
  });

  it('returns null with no turns', () => {
    expect(recentAccuracy([])).toBeNull();
  });
});

describe('computeStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(computeStreak(['2026-09-04', '2026-09-05', '2026-09-06'], '2026-09-06')).toBe(3);
  });

  it('does not break the streak before today is over', () => {
    expect(computeStreak(['2026-09-04', '2026-09-05'], '2026-09-06')).toBe(2);
  });

  it('resets after a missed day', () => {
    expect(computeStreak(['2026-09-01', '2026-09-02'], '2026-09-06')).toBe(0);
  });

  it('handles no activity at all', () => {
    expect(computeStreak([], '2026-09-06')).toBe(0);
  });
});

describe('fillProgressWindow', () => {
  it('pads missing days so charts never have holes', () => {
    const week = fillProgressWindow(
      [
        {
          date: '2026-09-06',
          speakingMinutes: 12,
          sessions: 1,
          messages: 20,
          grammarScore: 80,
          vocabularyScore: 70,
          fluencyScore: 75,
          pronunciationScore: null,
          overallScore: 76,
          newWords: 5,
          mistakesMade: 3,
        },
      ],
      '2026-09-06',
    );
    expect(week).toHaveLength(7);
    expect(week[0]?.date).toBe('2026-08-31');
    expect(week[6]?.speakingMinutes).toBe(12);
    expect(week[3]?.speakingMinutes).toBe(0);
  });
});

describe('deriveWeakAreas', () => {
  it('ranks German-labelled categories by total count', () => {
    const areas = deriveWeakAreas([
      { category: 'auxiliary-verb', count: 7 },
      { category: 'word-order', count: 3 },
      { category: 'auxiliary-verb', count: 2 },
      { category: 'article', count: 1 },
    ]);
    expect(areas[0]).toBe('Hilfsverb (sein/haben)');
    expect(areas[1]).toBe('Satzstellung');
  });
});

describe('normalizeForComparison', () => {
  it('treats punctuation and casing differences as the same mistake', () => {
    expect(normalizeForComparison('Ich habe gegangen.')).toBe(
      normalizeForComparison('ich habe  gegangen'),
    );
  });
});

describe('conversation trimming', () => {
  const messages = Array.from({ length: 20 }, (_, i) => ({
    speaker: (i % 2 === 0 ? 'user' : 'ai') as 'user' | 'ai',
    text: `Nachricht ${i}`,
  }));

  it('sends everything verbatim for a short conversation', () => {
    const short = messages.slice(0, 6);
    const trimmed = trimConversation(short);
    expect(trimmed.history).toHaveLength(6);
    expect(trimmed.needsSummary).toBe(false);
  });

  it('folds old turns into a summary once the conversation grows', () => {
    const trimmed = trimConversation(messages);
    expect(trimmed.needsSummary).toBe(true);
    expect(trimmed.history).toHaveLength(10);
    expect(trimmed.toSummarise).toHaveLength(10);
    expect(trimmed.history[0]?.text).toBe('Nachricht 10');
  });

  it('caps the verbatim block by characters as well as turns', () => {
    const long = Array.from({ length: 20 }, () => ({
      speaker: 'user' as const,
      text: 'x'.repeat(500),
    }));
    const trimmed = trimConversation(long);
    const chars = trimmed.history.reduce((s, m) => s + m.text.length, 0);
    expect(chars).toBeLessThanOrEqual(3000);
  });

  it('merges summaries into one bounded line', () => {
    const merged = mergeSummaries('Alter Teil.', 'Neuer Teil.');
    expect(merged).toBe('Alter Teil. Neuer Teil.');
    expect(truncateWords('a b c d e', 3)).toBe('a b c...');
  });
});
