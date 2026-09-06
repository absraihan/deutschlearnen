import { describe, expect, it } from 'vitest';
import {
  adjustDifficulty,
  compareLevels,
  cumulativeGrammar,
  difficultyGuidance,
  getLevelProfile,
  isValidLevel,
  nextLevel,
  previousLevel,
} from '../src/cefr';

describe('CEFR level helpers', () => {
  it('orders levels A1 < A2 < B1 < B2', () => {
    expect(compareLevels('A1', 'B2')).toBeLessThan(0);
    expect(compareLevels('B2', 'A1')).toBeGreaterThan(0);
    expect(compareLevels('B1', 'B1')).toBe(0);
  });

  it('never steps beyond the supported range', () => {
    expect(nextLevel('B2')).toBe('B2');
    expect(previousLevel('A1')).toBe('A1');
    expect(nextLevel('A1')).toBe('A2');
    expect(previousLevel('B2')).toBe('B1');
  });

  it('validates unknown level strings', () => {
    expect(isValidLevel('A1')).toBe(true);
    expect(isValidLevel('C1')).toBe(false);
    expect(isValidLevel(null)).toBe(false);
  });

  it('accumulates grammar from A1 upwards', () => {
    const b1 = cumulativeGrammar('B1');
    expect(b1).toContain('sein');
    expect(b1).toContain('Perfekt');
    expect(b1).toContain('Relativsätze');
    expect(b1).not.toContain('Nominalisierung');
  });

  it('gives longer replies and lower correction thresholds at higher levels', () => {
    const a1 = getLevelProfile('A1');
    const b2 = getLevelProfile('B2');
    expect(b2.replyWords.max).toBeGreaterThan(a1.replyWords.max);
    expect(b2.correctionThreshold).toBeLessThan(a1.correctionThreshold);
    expect(a1.allowsGrammarTerminology).toBe(false);
    expect(b2.allowsGrammarTerminology).toBe(true);
  });
});

describe('adaptive difficulty', () => {
  it('does not move on too little evidence', () => {
    const state = { level: 'A1' as const, progress: 0.5 };
    expect(adjustDifficulty(state, { accuracy: 1, turns: 2 })).toEqual(state);
  });

  it('raises difficulty inside the band before promoting', () => {
    const after = adjustDifficulty({ level: 'A1', progress: 0.5 }, { accuracy: 0.9, turns: 6 });
    expect(after.level).toBe('A1');
    expect(after.progress).toBeGreaterThan(0.5);
  });

  it('promotes only one level at a time and resets low in the new band', () => {
    let state = { level: 'A1' as const, progress: 0.95 };
    const after = adjustDifficulty(state, { accuracy: 0.95, turns: 10 });
    expect(after.level).toBe('A2');
    expect(after.progress).toBeLessThan(0.5);
  });

  it('never jumps from A1 to B2 in one step even with a perfect run', () => {
    let state: { level: 'A1' | 'A2' | 'B1' | 'B2'; progress: number } = {
      level: 'A1',
      progress: 0.99,
    };
    const seen: string[] = [state.level];
    for (let i = 0; i < 3; i += 1) {
      state = adjustDifficulty(state, { accuracy: 1, turns: 10 });
      seen.push(state.level);
    }
    expect(seen[0]).toBe('A1');
    expect(seen[1]).toBe('A2');
    // one promotion per adjustment, so B2 is unreachable in two steps
    expect(seen[2]).toBe('A2');
  });

  it('demotes faster than it promotes when the learner struggles', () => {
    const struggling = adjustDifficulty({ level: 'B1', progress: 0.1 }, { accuracy: 0.2, turns: 6 });
    expect(struggling.level).toBe('A2');
    expect(struggling.progress).toBeGreaterThan(0.5);
  });

  it('floors at A1 and caps at B2', () => {
    expect(adjustDifficulty({ level: 'A1', progress: 0 }, { accuracy: 0, turns: 8 })).toEqual({
      level: 'A1',
      progress: 0,
    });
    expect(adjustDifficulty({ level: 'B2', progress: 1 }, { accuracy: 1, turns: 8 })).toEqual({
      level: 'B2',
      progress: 1,
    });
  });

  it('describes where in the band the learner sits', () => {
    expect(difficultyGuidance({ level: 'A2', progress: 0.1 })).toMatch(/easy end/);
    expect(difficultyGuidance({ level: 'A2', progress: 0.9 })).toMatch(/next level/);
  });
});
