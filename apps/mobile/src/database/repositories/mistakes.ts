import {
  MASTERY_STREAK,
  normalizeForComparison,
  type CefrLevel,
  type MistakeCategory,
  type MistakeRecord,
} from '@deutschcoach/shared';
import { getDatabase } from '../index';
import { createId, nowIso, toBool } from '@/lib/util';

/**
 * Mistake memory.
 *
 * The point of the whole app: a mistake seen twice is more important than a
 * mistake seen once, and the tutor should know about it next session. Rows are
 * keyed by (category, normalised correction) so the same error phrased slightly
 * differently increments one counter instead of creating clutter.
 */

interface MistakeRow {
  id: string;
  category: string;
  wrong_text: string;
  correct_text: string;
  explanation: string;
  level: string;
  count: number;
  first_seen: string;
  last_seen: string;
  correct_streak: number;
  mastered: number;
}

function toMistake(row: MistakeRow): MistakeRecord {
  return {
    id: row.id,
    category: row.category as MistakeCategory,
    wrongText: row.wrong_text,
    correctText: row.correct_text,
    explanation: row.explanation,
    level: row.level as CefrLevel,
    count: row.count,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    correctStreak: row.correct_streak,
    mastered: toBool(row.mastered),
  };
}

export const mistakeRepository = {
  /**
   * Record one occurrence. Re-seeing a mistake bumps the count, refreshes
   * lastSeen, resets the mastery streak and un-masters it - relapse is real.
   */
  async record(input: {
    category: MistakeCategory;
    wrongText: string;
    correctText: string;
    explanation: string;
    level: CefrLevel;
  }): Promise<MistakeRecord> {
    const db = await getDatabase();
    const key = normalizeForComparison(input.correctText);
    const now = nowIso();

    const existing = await db.getFirstAsync<MistakeRow>(
      'SELECT * FROM mistake WHERE category = ? AND normalized_key = ?;',
      input.category,
      key,
    );

    if (existing) {
      await db.runAsync(
        `UPDATE mistake
            SET count = count + 1, last_seen = ?, wrong_text = ?, explanation = ?,
                correct_streak = 0, mastered = 0
          WHERE id = ?;`,
        now,
        input.wrongText,
        input.explanation || existing.explanation,
        existing.id,
      );
      return {
        ...toMistake(existing),
        count: existing.count + 1,
        lastSeen: now,
        wrongText: input.wrongText,
        correctStreak: 0,
        mastered: false,
      };
    }

    const record: MistakeRecord = {
      id: createId('mis'),
      category: input.category,
      wrongText: input.wrongText,
      correctText: input.correctText,
      explanation: input.explanation,
      level: input.level,
      count: 1,
      firstSeen: now,
      lastSeen: now,
      correctStreak: 0,
      mastered: false,
    };

    await db.runAsync(
      `INSERT INTO mistake
        (id, category, wrong_text, correct_text, normalized_key, explanation, level,
         count, first_seen, last_seen, correct_streak, mastered)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0, 0);`,
      record.id,
      record.category,
      record.wrongText,
      record.correctText,
      key,
      record.explanation,
      record.level,
      now,
      now,
    );
    return record;
  },

  /** Active mistakes, most frequent first. These drive drills and prompts. */
  async listActive(limit = 50): Promise<MistakeRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<MistakeRow>(
      'SELECT * FROM mistake WHERE mastered = 0 ORDER BY count DESC, last_seen DESC LIMIT ?;',
      limit,
    );
    return rows.map(toMistake);
  },

  async listAll(limit = 200): Promise<MistakeRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<MistakeRow>(
      'SELECT * FROM mistake ORDER BY mastered ASC, count DESC LIMIT ?;',
      limit,
    );
    return rows.map(toMistake);
  },

  async countActive(): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM mistake WHERE mastered = 0;',
    );
    return row?.n ?? 0;
  },

  /**
   * The learner got this structure right in a drill. Enough consecutive
   * successes and it stops being surfaced.
   */
  async recordSuccess(id: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE mistake
          SET correct_streak = correct_streak + 1,
              mastered = CASE WHEN correct_streak + 1 >= ? THEN 1 ELSE 0 END
        WHERE id = ?;`,
      MASTERY_STREAK,
      id,
    );
  },

  async recordFailure(id: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      'UPDATE mistake SET correct_streak = 0, mastered = 0, last_seen = ? WHERE id = ?;',
      nowIso(),
      id,
    );
  },

  async setMastered(id: string, mastered: boolean): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('UPDATE mistake SET mastered = ? WHERE id = ?;', mastered ? 1 : 0, id);
  },

  async remove(id: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM mistake WHERE id = ?;', id);
  },

  /** Category totals, used for weak-area detection and the mistakes screen. */
  async categoryTotals(): Promise<Array<{ category: MistakeCategory; count: number }>> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ category: string; total: number }>(
      'SELECT category, SUM(count) AS total FROM mistake WHERE mastered = 0 GROUP BY category ORDER BY total DESC;',
    );
    return rows.map((r) => ({ category: r.category as MistakeCategory, count: r.total }));
  },
};
