import {
  clamp,
  createId,
  formatDuration,
  formatMinutes,
  relativeDayLabel,
  toBool,
  todayKey,
  weekdayLabelDe,
} from '@/lib/util';

describe('createId', () => {
  it('produces unique ids', () => {
    const ids = new Set(Array.from({ length: 500 }, () => createId('msg')));
    expect(ids.size).toBe(500);
  });

  it('keeps the prefix so ids are readable in the database', () => {
    expect(createId('ses').startsWith('ses_')).toBe(true);
    expect(createId()).not.toContain('_');
  });
});

describe('todayKey', () => {
  it('formats the local date, not UTC, so streaks follow the learner day', () => {
    // 23:30 local on the 6th must still be the 6th, even though it is the 7th in UTC+2.
    const late = new Date(2026, 8, 6, 23, 30, 0);
    expect(todayKey(late)).toBe('2026-09-06');
  });

  it('zero-pads months and days', () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('formatDuration', () => {
  it('formats seconds as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(600)).toBe('10:00');
  });

  it('never renders a negative duration', () => {
    expect(formatDuration(-30)).toBe('0:00');
  });
});

describe('formatMinutes', () => {
  it('switches to hours past 60 minutes', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(128)).toBe('2 h 8 min');
  });
});

describe('German date labels', () => {
  it('uses German weekday abbreviations', () => {
    expect(weekdayLabelDe('2026-09-06')).toBe('So');
    expect(weekdayLabelDe('2026-09-07')).toBe('Mo');
  });

  it('says Heute for today', () => {
    expect(relativeDayLabel(todayKey())).toBe('Heute');
  });

  it('says Gestern for yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(relativeDayLabel(todayKey(yesterday))).toBe('Gestern');
  });
});

describe('small helpers', () => {
  it('clamps into range', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('reads SQLite integer booleans', () => {
    expect(toBool(1)).toBe(true);
    expect(toBool(0)).toBe(false);
    expect(toBool(null)).toBe(false);
    expect(toBool(undefined)).toBe(false);
  });
});
