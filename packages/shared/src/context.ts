import type { TurnMessage } from './types';

/**
 * AI context management.
 *
 * Cost control (§43) and quality both come from the same idea: send a small,
 * relevant slice of the conversation instead of the whole history. Older turns
 * collapse into a one-line running summary, recent turns go verbatim.
 */

/** How many recent turns are sent verbatim. */
export const VERBATIM_TURNS = 10;
/** Once the history is longer than this, older turns get summarised. */
export const SUMMARISE_AFTER_TURNS = 14;
/** Hard cap on characters of verbatim history, protects against long monologues. */
export const MAX_VERBATIM_CHARS = 3000;

export interface TrimmedContext {
  /** Turns to send verbatim, oldest first. */
  history: TurnMessage[];
  /** Turns that should be folded into the running summary. */
  toSummarise: TurnMessage[];
  /** True when a summarisation call is worth making. */
  needsSummary: boolean;
}

/**
 * Split a conversation into "send verbatim" and "fold into summary".
 * Never makes a summarisation call for a short conversation.
 */
export function trimConversation(
  messages: TurnMessage[],
  options: { verbatimTurns?: number; summariseAfter?: number; maxChars?: number } = {},
): TrimmedContext {
  const verbatimTurns = options.verbatimTurns ?? VERBATIM_TURNS;
  const summariseAfter = options.summariseAfter ?? SUMMARISE_AFTER_TURNS;
  const maxChars = options.maxChars ?? MAX_VERBATIM_CHARS;

  if (messages.length <= summariseAfter) {
    return { history: capChars(messages, maxChars), toSummarise: [], needsSummary: false };
  }

  const splitAt = messages.length - verbatimTurns;
  return {
    history: capChars(messages.slice(splitAt), maxChars),
    toSummarise: messages.slice(0, splitAt),
    needsSummary: true,
  };
}

/** Drop the oldest verbatim turns until the block fits the character budget. */
function capChars(messages: TurnMessage[], maxChars: number): TurnMessage[] {
  let total = messages.reduce((s, m) => s + m.text.length, 0);
  if (total <= maxChars) return [...messages];
  const out = [...messages];
  while (out.length > 2 && total > maxChars) {
    const removed = out.shift();
    total -= removed?.text.length ?? 0;
  }
  return out;
}

/** Merge an old running summary with a new chunk summary, keeping one line. */
export function mergeSummaries(previous: string | null, addition: string): string {
  const merged = [previous, addition].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return truncateWords(merged, 60);
}

export function truncateWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(' ')}...`;
}

/** Render turns for the model, compact but unambiguous. */
export function renderTranscript(messages: TurnMessage[]): string {
  return messages
    .map((m) => `${m.speaker === 'user' ? 'Lernender' : 'Tutor'}: ${m.text}`)
    .join('\n');
}

/**
 * Pick the vocabulary worth sending as "already known".
 * Recently seen and not yet mastered words are the useful ones: mastered words
 * do not need reinforcement and brand new ones are not known yet.
 */
export function selectKnownVocabulary(
  items: Array<{ german: string; status: string; lastReviewedAt: string | null }>,
  limit = 40,
): string[] {
  return [...items]
    .filter((i) => i.status !== 'new')
    .sort((a, b) => (b.lastReviewedAt ?? '').localeCompare(a.lastReviewedAt ?? ''))
    .slice(0, limit)
    .map((i) => i.german);
}

/** Estimate token count so cost guards can act before making a request. */
export function estimateTokens(text: string): number {
  // German averages fewer tokens per character than the 4:1 English rule of
  // thumb because of long compounds; 3.4 is close enough for a budget guard.
  return Math.ceil(text.length / 3.4);
}

export interface CostGuardOptions {
  /** Refuse a turn whose prompt would exceed this. */
  maxPromptTokens?: number;
}

export function exceedsBudget(prompt: string, options: CostGuardOptions = {}): boolean {
  return estimateTokens(prompt) > (options.maxPromptTokens ?? 6000);
}
