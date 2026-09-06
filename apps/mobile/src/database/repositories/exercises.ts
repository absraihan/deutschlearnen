import type { CefrLevel, Exercise, PracticeExercise } from '@deutschlearnen/shared';
import { getDatabase } from '../index';
import { createId, nowIso, toBool, todayKey } from '@/lib/util';

/**
 * Drill persistence.
 *
 * Generated exercises cost an API call, so throwing them away when the screen
 * unmounts is waste. Persisting them also makes the drill history real: which
 * structures were practised, and whether the learner got them right.
 */

interface ExerciseRow {
  id: string;
  mistake_id: string | null;
  type: string;
  prompt: string;
  answer: string;
  hint: string | null;
  explanation: string | null;
  level: string;
  created_at: string;
  completed_at: string | null;
  was_correct: number | null;
}

function toExercise(row: ExerciseRow): PracticeExercise {
  return {
    id: row.id,
    mistakeId: row.mistake_id,
    type: row.type as PracticeExercise['type'],
    prompt: row.prompt,
    answer: row.answer,
    hint: row.hint,
    explanation: row.explanation,
    level: row.level as CefrLevel,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    wasCorrect: row.was_correct === null ? null : toBool(row.was_correct),
  };
}

export const exerciseRepository = {
  /** Store a freshly generated drill set, pairing each one with its mistake. */
  async saveMany(
    exercises: Exercise[],
    mistakeIds: Array<string | null> = [],
  ): Promise<PracticeExercise[]> {
    const db = await getDatabase();
    const created: PracticeExercise[] = [];
    const now = nowIso();

    await db.withTransactionAsync(async () => {
      for (const [index, exercise] of exercises.entries()) {
        const record: PracticeExercise = {
          id: createId('exr'),
          mistakeId: mistakeIds[index] ?? null,
          type: exercise.type,
          prompt: exercise.prompt,
          answer: exercise.answer,
          hint: exercise.hint,
          explanation: exercise.explanation,
          level: exercise.level,
          createdAt: now,
          completedAt: null,
          wasCorrect: null,
        };

        await db.runAsync(
          `INSERT INTO practice_exercise
            (id, mistake_id, type, prompt, answer, hint, explanation, level,
             created_at, completed_at, was_correct)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL);`,
          record.id,
          record.mistakeId,
          record.type,
          record.prompt,
          record.answer,
          record.hint,
          record.explanation,
          record.level,
          record.createdAt,
        );
        created.push(record);
      }
    });

    return created;
  },

  async complete(id: string, wasCorrect: boolean): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      'UPDATE practice_exercise SET completed_at = ?, was_correct = ? WHERE id = ?;',
      nowIso(),
      wasCorrect ? 1 : 0,
      id,
    );
  },

  /** Unfinished drills, so an interrupted session can be resumed for free. */
  async listPending(limit = 10): Promise<PracticeExercise[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<ExerciseRow>(
      'SELECT * FROM practice_exercise WHERE completed_at IS NULL ORDER BY created_at DESC LIMIT ?;',
      limit,
    );
    return rows.map(toExercise);
  },

  /** How the learner did on drills today, for the mistakes screen. */
  async statsForToday(): Promise<{ completed: number; correct: number }> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ completed: number; correct: number }>(
      `SELECT COUNT(*) AS completed,
              SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) AS correct
         FROM practice_exercise
        WHERE completed_at IS NOT NULL AND date(completed_at) = date(?);`,
      todayKey(),
    );
    return { completed: row?.completed ?? 0, correct: row?.correct ?? 0 };
  },

  /** Drop drills that were generated but never finished, older than a week. */
  async pruneStale(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      "DELETE FROM practice_exercise WHERE completed_at IS NULL AND created_at < datetime('now', '-7 days');",
    );
  },
};
