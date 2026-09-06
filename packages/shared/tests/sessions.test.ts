import { describe, expect, it } from 'vitest';
import {
  DAILY_CURRICULUM,
  buildSchedule,
  dayNumberSince,
  examTasksForLevel,
  lessonForDay,
  phaseAt,
} from '../src/sessions';
import { CONVERSATION_MODES, modesForLevel, roleplaysForLevel } from '../src/modes';

describe('session schedule', () => {
  it('covers the whole session with no gaps or overlap', () => {
    const schedule = buildSchedule(10);
    expect(schedule[0]?.startSec).toBe(0);
    expect(schedule[schedule.length - 1]?.endSec).toBe(600);
    for (let i = 1; i < schedule.length; i += 1) {
      expect(schedule[i]?.startSec).toBe(schedule[i - 1]?.endSec);
    }
  });

  it('matches the 10-minute structure from the spec', () => {
    const schedule = buildSchedule(10);
    expect(schedule.map((p) => p.kind)).toEqual([
      'warmup',
      'conversation',
      'roleplay',
      'correction',
      'review',
    ]);
    expect(schedule[0]?.endSec).toBe(60);
  });

  it('drops roleplay and correction from a 5-minute session', () => {
    expect(buildSchedule(5).map((p) => p.kind)).toEqual(['warmup', 'conversation', 'review']);
  });

  it('resolves the active phase from elapsed time', () => {
    const schedule = buildSchedule(10);
    expect(phaseAt(schedule, 30).kind).toBe('warmup');
    expect(phaseAt(schedule, 200).kind).toBe('conversation');
    expect(phaseAt(schedule, 599).kind).toBe('review');
    expect(phaseAt(schedule, 99_999).kind).toBe('review');
  });
});

describe('daily curriculum', () => {
  it('cycles through seven days', () => {
    expect(DAILY_CURRICULUM).toHaveLength(7);
    expect(lessonForDay(1).titleDe).toBe('Vorstellung');
    expect(lessonForDay(8).titleDe).toBe('Vorstellung');
    expect(lessonForDay(7).titleDe).toBe('Wochenrückblick');
  });

  it('handles day 0 and negative input without crashing', () => {
    expect(lessonForDay(0).day).toBeGreaterThan(0);
    expect(lessonForDay(-3).day).toBeGreaterThan(0);
  });

  it('advances one lesson per calendar day', () => {
    expect(dayNumberSince('2026-09-01', '2026-09-01')).toBe(1);
    expect(dayNumberSince('2026-09-01', '2026-09-06')).toBe(6);
    expect(dayNumberSince('not-a-date', '2026-09-06')).toBe(1);
  });

  it('gives every lesson a topic for every level it offers', () => {
    for (const lesson of DAILY_CURRICULUM) {
      expect(Object.keys(lesson.topic).length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('modes and roleplays', () => {
  it('ships all twenty conversation modes', () => {
    expect(CONVERSATION_MODES).toHaveLength(20);
  });

  it('gives every mode an opening for every level it claims to support', () => {
    for (const mode of CONVERSATION_MODES) {
      for (const level of mode.levels) {
        expect(mode.openings[level], `${mode.id} is missing an opening for ${level}`).toBeTruthy();
      }
    }
  });

  it('hides debate from beginners', () => {
    expect(modesForLevel('A1').map((m) => m.id)).not.toContain('debate');
    expect(modesForLevel('B2').map((m) => m.id)).toContain('debate');
  });

  it('has at least one roleplay scenario per level', () => {
    for (const level of ['A1', 'A2', 'B1', 'B2'] as const) {
      expect(roleplaysForLevel(level).length).toBeGreaterThan(0);
    }
  });
});

describe('exam tasks', () => {
  it('provides ordered exam-style tasks for every level', () => {
    for (const level of ['A1', 'A2', 'B1', 'B2'] as const) {
      const tasks = examTasksForLevel(level);
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks.map((t) => t.part)).toEqual([...tasks.map((t) => t.part)].sort());
    }
  });
});
