import type { CefrLevel } from '@deutschcoach/shared';
import { getDatabase } from '../index';
import { nowIso, todayKey } from '@/lib/util';

/**
 * Long-term learner memory.
 *
 * One row holding the things that must survive between sessions: the running
 * German profile line the tutor gets as context, and where the learner sits
 * inside their CEFR band (the adaptive-difficulty state).
 */
export interface LearnerMemory {
  longTermSummary: string | null;
  difficultyLevel: CefrLevel;
  difficultyProgress: number;
  startedOn: string;
  updatedAt: string;
}

interface MemoryRow {
  long_term_summary: string | null;
  difficulty_level: string;
  difficulty_progress: number;
  started_on: string;
  updated_at: string;
}

export const memoryRepository = {
  async get(fallbackLevel: CefrLevel = 'A1'): Promise<LearnerMemory> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<MemoryRow>('SELECT * FROM learner_memory WHERE id = 1;');

    if (!row) {
      const created: LearnerMemory = {
        longTermSummary: null,
        difficultyLevel: fallbackLevel,
        difficultyProgress: 0.5,
        startedOn: todayKey(),
        updatedAt: nowIso(),
      };
      await db.runAsync(
        `INSERT INTO learner_memory (id, long_term_summary, difficulty_level, difficulty_progress, started_on, updated_at)
         VALUES (1, NULL, ?, ?, ?, ?);`,
        created.difficultyLevel,
        created.difficultyProgress,
        created.startedOn,
        created.updatedAt,
      );
      return created;
    }

    return {
      longTermSummary: row.long_term_summary,
      difficultyLevel: row.difficulty_level as CefrLevel,
      difficultyProgress: row.difficulty_progress,
      startedOn: row.started_on,
      updatedAt: row.updated_at,
    };
  },

  /**
   * Append a session note to the long-term summary, keeping only the most
   * recent lines. This is what the tutor sees as "previous sessions", so it has
   * to stay short: a growing blob would quietly grow every prompt.
   */
  async appendNote(note: string, keepLines = 3): Promise<void> {
    if (!note.trim()) return;
    const db = await getDatabase();
    const current = await this.get();
    const lines = [...(current.longTermSummary?.split(' | ') ?? []), note.trim()]
      .filter(Boolean)
      .slice(-keepLines);

    await db.runAsync(
      'UPDATE learner_memory SET long_term_summary = ?, updated_at = ? WHERE id = 1;',
      lines.join(' | '),
      nowIso(),
    );
  },

  async setDifficulty(level: CefrLevel, progress: number): Promise<void> {
    const db = await getDatabase();
    await this.get(level);
    await db.runAsync(
      'UPDATE learner_memory SET difficulty_level = ?, difficulty_progress = ?, updated_at = ? WHERE id = 1;',
      level,
      Math.min(1, Math.max(0, progress)),
      nowIso(),
    );
  },

  async clearSummary(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('UPDATE learner_memory SET long_term_summary = NULL WHERE id = 1;');
  },
};
