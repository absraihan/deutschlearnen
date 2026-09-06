import type { CefrLevel } from './types';

/**
 * Session structure and the daily practice curriculum.
 *
 * A session is a sequence of timed phases. The conversation screen drives the
 * phases from a plan so a "10 minute session" is a real structure rather than
 * just a timer.
 */

export type PhaseKind = 'warmup' | 'conversation' | 'roleplay' | 'correction' | 'review';

export interface SessionPhase {
  kind: PhaseKind;
  title: string;
  titleDe: string;
  /** Share of total session time, phases sum to 1. */
  share: number;
  /** Instruction appended to the tutor prompt while this phase is active. */
  instruction: string;
}

export const SESSION_DURATIONS = [5, 10, 15, 20, 30] as const;
export type SessionDuration = (typeof SESSION_DURATIONS)[number];

const PHASE_LIBRARY: Record<PhaseKind, Omit<SessionPhase, 'share'>> = {
  warmup: {
    kind: 'warmup',
    title: 'Warm-up',
    titleDe: 'Aufwärmen',
    instruction:
      'Warm-up phase: two or three very easy questions to get the learner talking. Do not correct anything unless it blocks understanding.',
  },
  conversation: {
    kind: 'conversation',
    title: 'Conversation',
    titleDe: 'Gespräch',
    instruction:
      'Main conversation phase: go deeper on the topic, ask follow-up questions, let the learner produce longer turns.',
  },
  roleplay: {
    kind: 'roleplay',
    title: 'Roleplay',
    titleDe: 'Rollenspiel',
    instruction:
      'Roleplay phase: move into a concrete situation related to the topic and stay in character while the learner handles it.',
  },
  correction: {
    kind: 'correction',
    title: 'Correction practice',
    titleDe: 'Korrektur-Übung',
    instruction:
      'Correction phase: pick the one or two mistakes that came up most in this session and have the learner say corrected versions aloud. Give short, targeted drills.',
  },
  review: {
    kind: 'review',
    title: 'Review',
    titleDe: 'Rückblick',
    instruction:
      'Review phase: briefly recap in German what was practised, name one strength and one thing to work on, and close the conversation warmly.',
  },
};

function phase(kind: PhaseKind, share: number): SessionPhase {
  return { ...PHASE_LIBRARY[kind], share };
}

/** Phase plan per session length. Mirrors the 10-minute structure in the spec. */
export const SESSION_PLANS: Record<SessionDuration, SessionPhase[]> = {
  5: [phase('warmup', 0.2), phase('conversation', 0.6), phase('review', 0.2)],
  10: [
    phase('warmup', 0.1),
    phase('conversation', 0.3),
    phase('roleplay', 0.3),
    phase('correction', 0.2),
    phase('review', 0.1),
  ],
  15: [
    phase('warmup', 0.1),
    phase('conversation', 0.33),
    phase('roleplay', 0.27),
    phase('correction', 0.2),
    phase('review', 0.1),
  ],
  20: [
    phase('warmup', 0.08),
    phase('conversation', 0.32),
    phase('roleplay', 0.3),
    phase('correction', 0.22),
    phase('review', 0.08),
  ],
  30: [
    phase('warmup', 0.07),
    phase('conversation', 0.33),
    phase('roleplay', 0.3),
    phase('correction', 0.23),
    phase('review', 0.07),
  ],
};

export interface ScheduledPhase extends SessionPhase {
  /** Seconds from session start. */
  startSec: number;
  endSec: number;
}

/** Expand a plan into absolute second boundaries. */
export function buildSchedule(durationMinutes: SessionDuration): ScheduledPhase[] {
  const plan = SESSION_PLANS[durationMinutes];
  const total = durationMinutes * 60;
  let cursor = 0;
  return plan.map((p, i) => {
    const length = i === plan.length - 1 ? total - cursor : Math.round(total * p.share);
    const scheduled: ScheduledPhase = { ...p, startSec: cursor, endSec: cursor + length };
    cursor += length;
    return scheduled;
  });
}

export function phaseAt(schedule: ScheduledPhase[], elapsedSec: number): ScheduledPhase {
  return (
    schedule.find((p) => elapsedSec >= p.startSec && elapsedSec < p.endSec) ??
    schedule[schedule.length - 1]!
  );
}

/* ------------------------------------------------------------------ *
 * Daily practice curriculum
 * ------------------------------------------------------------------ */

export interface DailyLesson {
  /** 1-based day within the repeating cycle. */
  day: number;
  title: string;
  titleDe: string;
  emoji: string;
  modeId: string;
  /** Topic passed to the tutor. */
  topic: Partial<Record<CefrLevel, string>>;
  /** Optional roleplay for the roleplay phase. */
  roleplayId?: Partial<Record<CefrLevel, string>>;
  focus: string;
}

/** A repeating 7-day cycle. Day 7 is always review of the week. */
export const DAILY_CURRICULUM: DailyLesson[] = [
  {
    day: 1,
    title: 'Introduction',
    titleDe: 'Vorstellung',
    emoji: '👋',
    modeId: 'free',
    topic: {
      A1: 'sich vorstellen',
      A2: 'sich und den eigenen Hintergrund vorstellen',
      B1: 'der eigene Werdegang',
      B2: 'die eigene Identität und Herkunft',
    },
    roleplayId: { A1: 'introduce-neighbour' },
    focus: 'Personalpronomen und Präsens',
  },
  {
    day: 2,
    title: 'Family',
    titleDe: 'Familie',
    emoji: '👨‍👩‍👧',
    modeId: 'family',
    topic: {
      A1: 'Familie',
      A2: 'Familie und Verwandte',
      B1: 'die Rolle der Familie',
      B2: 'Familienbilder im Vergleich',
    },
    focus: 'Possessivartikel und Akkusativ',
  },
  {
    day: 3,
    title: 'Daily routine',
    titleDe: 'Tagesablauf',
    emoji: '🌅',
    modeId: 'daily-life',
    topic: {
      A1: 'Tagesablauf',
      A2: 'Tagesablauf und Gewohnheiten',
      B1: 'Zeitmanagement im Alltag',
      B2: 'Work-Life-Balance',
    },
    focus: 'trennbare Verben und Zeitangaben',
  },
  {
    day: 4,
    title: 'Shopping',
    titleDe: 'Einkaufen',
    emoji: '🛒',
    modeId: 'shopping',
    topic: {
      A1: 'Einkaufen im Supermarkt',
      A2: 'Kleidung kaufen und umtauschen',
      B1: 'Preis oder Qualität',
      B2: 'Konsumverhalten',
    },
    roleplayId: { A1: 'bakery', A2: 'apartment-viewing', B1: 'complaint' },
    focus: 'Akkusativ und Zahlen',
  },
  {
    day: 5,
    title: 'Restaurant',
    titleDe: 'Restaurant',
    emoji: '🍽️',
    modeId: 'restaurant',
    topic: {
      A1: 'im Café bestellen',
      A2: 'im Restaurant bestellen und bezahlen',
      B1: 'sich im Restaurant beschweren',
      B2: 'Esskultur und Ernährung',
    },
    roleplayId: { A1: 'cafe-order' },
    focus: 'höfliche Formen und Modalverben',
  },
  {
    day: 6,
    title: 'Travel',
    titleDe: 'Reisen',
    emoji: '✈️',
    modeId: 'travel',
    topic: {
      A1: 'eine kurze Reise',
      A2: 'die letzte Reise',
      B1: 'Reiseerlebnisse und Probleme',
      B2: 'nachhaltiges Reisen',
    },
    roleplayId: { A2: 'train-station' },
    focus: 'Perfekt und Präpositionen',
  },
  {
    day: 7,
    title: 'Weekly review',
    titleDe: 'Wochenrückblick',
    emoji: '🔁',
    modeId: 'free',
    topic: {
      A1: 'Wiederholung der Woche',
      A2: 'Wiederholung und eigene Fehler',
      B1: 'Wiederholung und freie Diskussion',
      B2: 'Wiederholung und Argumentation',
    },
    focus: 'die häufigsten Fehler dieser Woche',
  },
];

/** The lesson for a given day index, cycling through the curriculum. */
export function lessonForDay(dayNumber: number): DailyLesson {
  const index = ((dayNumber - 1) % DAILY_CURRICULUM.length + DAILY_CURRICULUM.length) %
    DAILY_CURRICULUM.length;
  return DAILY_CURRICULUM[index]!;
}

/** Days since a start date, 1-based, so the curriculum advances daily. */
export function dayNumberSince(startDate: string, today: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(now)) return 1;
  return Math.floor((now - start) / 86_400_000) + 1;
}

/* ------------------------------------------------------------------ *
 * Exam-style tasks
 * ------------------------------------------------------------------ */

export interface ExamTask {
  id: string;
  level: CefrLevel;
  part: number;
  title: string;
  titleDe: string;
  /** The task as the learner sees it. */
  prompt: string;
  /** Guidance injected into the tutor prompt. */
  instruction: string;
  /** Suggested speaking time in seconds. */
  suggestedSec: number;
}

export const EXAM_TASKS: ExamTask[] = [
  {
    id: 'a1-1',
    level: 'A1',
    part: 1,
    title: 'Introduce yourself',
    titleDe: 'Sich vorstellen',
    prompt:
      'Stellen Sie sich vor: Name, Alter, Land, Wohnort, Sprachen, Beruf, Hobby.',
    instruction:
      'Ask the learner to introduce themselves using the seven standard points. Prompt gently for any point they leave out.',
    suggestedSec: 90,
  },
  {
    id: 'a1-2',
    level: 'A1',
    part: 2,
    title: 'Ask and answer',
    titleDe: 'Fragen stellen',
    prompt: 'Thema: Essen. Stellen Sie eine Frage und antworten Sie auf meine Frage.',
    instruction:
      'Give the learner a keyword (for example "Frühstück") and have them form a question, then answer their question and ask one back.',
    suggestedSec: 90,
  },
  {
    id: 'a2-1',
    level: 'A2',
    part: 1,
    title: 'Talk about your daily routine',
    titleDe: 'Über den Tagesablauf sprechen',
    prompt: 'Beschreiben Sie Ihren typischen Tagesablauf von morgens bis abends.',
    instruction:
      'Let the learner describe a full day. Prompt for time expressions and connectors (dann, danach, später).',
    suggestedSec: 120,
  },
  {
    id: 'a2-2',
    level: 'A2',
    part: 2,
    title: 'Plan something together',
    titleDe: 'Gemeinsam etwas planen',
    prompt: 'Wir planen zusammen einen Ausflug am Wochenende. Machen Sie Vorschläge.',
    instruction:
      'Negotiate a weekend trip together: the learner proposes, you raise small obstacles (time, price, weather).',
    suggestedSec: 150,
  },
  {
    id: 'b1-1',
    level: 'B1',
    part: 1,
    title: 'Give your opinion',
    titleDe: 'Meinung äußern',
    prompt:
      'Äußern Sie Ihre Meinung zum Thema Online-Lernen. Nennen Sie Vor- und Nachteile und begründen Sie.',
    instruction:
      'Have the learner state a position with at least two supporting reasons, then ask one probing follow-up.',
    suggestedSec: 180,
  },
  {
    id: 'b1-2',
    level: 'B1',
    part: 2,
    title: 'Present an experience',
    titleDe: 'Ein Erlebnis präsentieren',
    prompt: 'Erzählen Sie von einem Erlebnis, das Sie überrascht hat. Strukturieren Sie Ihren Vortrag.',
    instruction:
      'Ask for a structured mini-presentation: Einleitung, Hauptteil, Schluss. Then ask two questions about it.',
    suggestedSec: 210,
  },
  {
    id: 'b2-1',
    level: 'B2',
    part: 1,
    title: 'Discuss advantages and disadvantages',
    titleDe: 'Vor- und Nachteile diskutieren',
    prompt:
      'Diskutieren Sie Vor- und Nachteile von künstlicher Intelligenz. Beziehen Sie am Ende Stellung.',
    instruction:
      'Require balanced argumentation and a clear final position. Push back on any unsupported claim.',
    suggestedSec: 240,
  },
  {
    id: 'b2-2',
    level: 'B2',
    part: 2,
    title: 'Reach an agreement',
    titleDe: 'Zu einer Einigung kommen',
    prompt:
      'Ihr Team soll ein Budget kürzen. Diskutieren Sie mit mir und finden Sie einen Kompromiss.',
    instruction:
      'Hold a firm opposing position and require the learner to concede, counter and finally negotiate a compromise.',
    suggestedSec: 240,
  },
];

export function examTasksForLevel(level: CefrLevel): ExamTask[] {
  return EXAM_TASKS.filter((t) => t.level === level).sort((a, b) => a.part - b.part);
}
