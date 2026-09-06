/** Small helpers used across the app. Kept dependency-free on purpose. */

/**
 * Collision-resistant id without pulling in a uuid package.
 * Randomness plus a time prefix, which also makes ids sort roughly by creation.
 */
export function createId(prefix = ''): string {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}${prefix ? '_' : ''}${time}${random}`;
}

/** Local calendar date as YYYY-MM-DD. Local, not UTC: streaks follow the learner's day. */
export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${`${s}`.padStart(2, '0')}`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Short German weekday label, for the weekly chart. */
export function weekdayLabelDe(dateKey: string): string {
  const parsed = new Date(`${dateKey}T00:00:00`);
  return ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][parsed.getDay()] ?? '';
}

export function relativeDayLabel(dateKey: string): string {
  const today = todayKey();
  if (dateKey === today) return 'Heute';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateKey === todayKey(yesterday)) return 'Gestern';
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'short',
  });
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function toBool(value: unknown): boolean {
  return value === 1 || value === true || value === '1';
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
