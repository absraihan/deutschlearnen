import type { CefrLevel, VocabularyItem, VocabularyStatus } from '@deutschcoach/shared';
import { getDatabase } from '../index';
import { createId, nowIso, toBool, todayKey } from '@/lib/util';

interface VocabRow {
  id: string;
  german: string;
  english: string;
  bangla: string | null;
  article: string | null;
  word_type: string | null;
  example_sentence: string;
  example_translation: string | null;
  level: string;
  category: string;
  status: string;
  favorite: number;
  times_seen: number;
  times_correct: number;
  created_at: string;
  last_reviewed_at: string | null;
  due_at: string | null;
}

function toItem(row: VocabRow): VocabularyItem {
  return {
    id: row.id,
    german: row.german,
    english: row.english,
    bangla: row.bangla,
    article: row.article,
    wordType: row.word_type,
    exampleSentence: row.example_sentence,
    exampleTranslation: row.example_translation,
    level: row.level as CefrLevel,
    category: row.category,
    status: row.status as VocabularyStatus,
    favorite: toBool(row.favorite),
    timesSeen: row.times_seen,
    timesCorrect: row.times_correct,
    createdAt: row.created_at,
    lastReviewedAt: row.last_reviewed_at,
    dueAt: row.due_at,
  };
}

/** Spacing schedule in days. Extension point for a full SM-2 style SRS. */
const REVIEW_INTERVALS = [1, 3, 7, 16, 35];

function nextDueDate(timesCorrect: number): string {
  const days = REVIEW_INTERVALS[Math.min(timesCorrect, REVIEW_INTERVALS.length - 1)] ?? 1;
  const due = new Date();
  due.setDate(due.getDate() + days);
  return due.toISOString();
}

export const vocabularyRepository = {
  /**
   * Save a word. Words arrive repeatedly from conversations, so this upserts on
   * a normalised German key and never creates duplicates.
   */
  async upsert(input: {
    german: string;
    english: string;
    bangla?: string | null;
    article?: string | null;
    wordType?: string | null;
    exampleSentence: string;
    exampleTranslation?: string | null;
    level: CefrLevel;
    category: string;
  }): Promise<VocabularyItem> {
    const db = await getDatabase();
    const key = input.german.trim().toLowerCase();
    const existing = await db.getFirstAsync<VocabRow>(
      'SELECT * FROM vocabulary WHERE german_key = ?;',
      key,
    );

    if (existing) {
      await db.runAsync(
        'UPDATE vocabulary SET times_seen = times_seen + 1 WHERE id = ?;',
        existing.id,
      );
      return { ...toItem(existing), timesSeen: existing.times_seen + 1 };
    }

    const item: VocabularyItem = {
      id: createId('voc'),
      german: input.german.trim(),
      english: input.english,
      bangla: input.bangla ?? null,
      article: input.article ?? null,
      wordType: input.wordType ?? null,
      exampleSentence: input.exampleSentence,
      exampleTranslation: input.exampleTranslation ?? null,
      level: input.level,
      category: input.category,
      status: 'new',
      favorite: false,
      timesSeen: 1,
      timesCorrect: 0,
      createdAt: nowIso(),
      lastReviewedAt: null,
      dueAt: null,
    };

    await db.runAsync(
      `INSERT INTO vocabulary
        (id, german, german_key, english, bangla, article, word_type, example_sentence,
         example_translation, level, category, status, favorite, times_seen, times_correct,
         created_at, last_reviewed_at, due_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 0, 1, 0, ?, NULL, NULL);`,
      item.id,
      item.german,
      key,
      item.english,
      item.bangla,
      item.article,
      item.wordType,
      item.exampleSentence,
      item.exampleTranslation,
      item.level,
      item.category,
      item.createdAt,
    );
    return item;
  },

  async list(
    filter: { status?: VocabularyStatus; favorite?: boolean; search?: string; limit?: number } = {},
  ): Promise<VocabularyItem[]> {
    const db = await getDatabase();
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (filter.status) {
      clauses.push('status = ?');
      params.push(filter.status);
    }
    if (filter.favorite) clauses.push('favorite = 1');
    if (filter.search) {
      clauses.push("(german LIKE ? OR english LIKE ? OR IFNULL(bangla, '') LIKE ?)");
      const like = `%${filter.search}%`;
      params.push(like, like, like);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(filter.limit ?? 200);

    const rows = await db.getAllAsync<VocabRow>(
      `SELECT * FROM vocabulary ${where} ORDER BY created_at DESC LIMIT ?;`,
      ...params,
    );
    return rows.map(toItem);
  },

  /** Words due for review today, plus new ones if there is room. */
  async listDue(limit = 20): Promise<VocabularyItem[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<VocabRow>(
      `SELECT * FROM vocabulary
        WHERE status != 'mastered' AND (due_at IS NULL OR date(due_at) <= date(?))
        ORDER BY (due_at IS NULL) ASC, due_at ASC
        LIMIT ?;`,
      todayKey(),
      limit,
    );
    return rows.map(toItem);
  },

  async count(status?: VocabularyStatus): Promise<number> {
    const db = await getDatabase();
    const row = status
      ? await db.getFirstAsync<{ n: number }>(
          'SELECT COUNT(*) AS n FROM vocabulary WHERE status = ?;',
          status,
        )
      : await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM vocabulary;');
    return row?.n ?? 0;
  },

  /** How many words were first saved today, for the daily progress row. */
  async countCreatedOn(dateKey: string): Promise<number> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM vocabulary WHERE date(created_at) = date(?);',
      dateKey,
    );
    return row?.n ?? 0;
  },

  async toggleFavorite(id: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('UPDATE vocabulary SET favorite = 1 - favorite WHERE id = ?;', id);
  },

  async setStatus(id: string, status: VocabularyStatus): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('UPDATE vocabulary SET status = ? WHERE id = ?;', status, id);
  },

  /** Flashcard answered. Correct answers push the next review further out. */
  async review(id: string, wasCorrect: boolean): Promise<void> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<VocabRow>('SELECT * FROM vocabulary WHERE id = ?;', id);
    if (!row) return;

    const timesCorrect = wasCorrect ? row.times_correct + 1 : 0;
    const status: VocabularyStatus =
      timesCorrect >= REVIEW_INTERVALS.length ? 'mastered' : timesCorrect > 0 ? 'learning' : 'learning';

    await db.runAsync(
      `UPDATE vocabulary
          SET times_seen = times_seen + 1, times_correct = ?, status = ?,
              last_reviewed_at = ?, due_at = ?
        WHERE id = ?;`,
      timesCorrect,
      status,
      nowIso(),
      nextDueDate(timesCorrect),
      id,
    );
  },

  /** Words the tutor should treat as already known, newest reviewed first. */
  async knownWords(limit = 40): Promise<string[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ german: string }>(
      `SELECT german FROM vocabulary
        WHERE status != 'new'
        ORDER BY last_reviewed_at IS NULL, last_reviewed_at DESC, created_at DESC
        LIMIT ?;`,
      limit,
    );
    return rows.map((r) => r.german);
  },

  async remove(id: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM vocabulary WHERE id = ?;', id);
  },
};
