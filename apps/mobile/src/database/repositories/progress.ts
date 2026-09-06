import {
  computeStreak,
  fillProgressWindow,
  type CefrLevel,
  type DailyGoalRecord,
  type ProgressRecord,
  type ProgressSummary,
} from '@deutschlearnen/shared';
import { getDatabase } from '../index';
import { toBool, todayKey } from '@/lib/util';

interface ProgressRow {
  date: string;
  speaking_minutes: number;
  sessions: number;
  messages: number;
  grammar_score: number | null;
  vocabulary_score: number | null;
  fluency_score: number | null;
  pronunciation_score: number | null;
  overall_score: number | null;
  new_words: number;
  mistakes_made: number;
}

function toRecord(row: ProgressRow): ProgressRecord {
  return {
    date: row.date,
    speakingMinutes: row.speaking_minutes,
    sessions: row.sessions,
    messages: row.messages,
    grammarScore: row.grammar_score,
    vocabularyScore: row.vocabulary_score,
    fluencyScore: row.fluency_score,
    pronunciationScore: row.pronunciation_score,
    overallScore: row.overall_score,
    newWords: row.new_words,
    mistakesMade: row.mistakes_made,
  };
}

/**
 * Daily aggregates.
 *
 * Scores are stored as a running average per day: a second session on the same
 * day should move the number, not replace it, so one bad five-minute session
 * does not erase a good twenty-minute one.
 */
export const progressRepository = {
  async recordSession(input: {
    date?: string;
    speakingMinutes: number;
    messages: number;
    grammarScore: number | null;
    vocabularyScore: number | null;
    fluencyScore: number | null;
    pronunciationScore: number | null;
    overallScore: number | null;
    newWords: number;
    mistakesMade: number;
  }): Promise<void> {
    const db = await getDatabase();
    const date = input.date ?? todayKey();
    const existing = await db.getFirstAsync<ProgressRow>(
      'SELECT * FROM progress_record WHERE date = ?;',
      date,
    );

    if (!existing) {
      await db.runAsync(
        `INSERT INTO progress_record
          (date, speaking_minutes, sessions, messages, grammar_score, vocabulary_score,
           fluency_score, pronunciation_score, overall_score, new_words, mistakes_made)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?);`,
        date,
        input.speakingMinutes,
        input.messages,
        input.grammarScore,
        input.vocabularyScore,
        input.fluencyScore,
        input.pronunciationScore,
        input.overallScore,
        input.newWords,
        input.mistakesMade,
      );
      return;
    }

    const n = existing.sessions;
    const average = (previous: number | null, next: number | null): number | null => {
      if (next === null) return previous;
      if (previous === null) return next;
      return Number(((previous * n + next) / (n + 1)).toFixed(1));
    };

    await db.runAsync(
      `UPDATE progress_record
          SET speaking_minutes = speaking_minutes + ?,
              sessions = sessions + 1,
              messages = messages + ?,
              grammar_score = ?, vocabulary_score = ?, fluency_score = ?,
              pronunciation_score = ?, overall_score = ?,
              new_words = new_words + ?, mistakes_made = mistakes_made + ?
        WHERE date = ?;`,
      input.speakingMinutes,
      input.messages,
      average(existing.grammar_score, input.grammarScore),
      average(existing.vocabulary_score, input.vocabularyScore),
      average(existing.fluency_score, input.fluencyScore),
      average(existing.pronunciation_score, input.pronunciationScore),
      average(existing.overall_score, input.overallScore),
      input.newWords,
      input.mistakesMade,
      date,
    );
  },

  async recent(days = 30): Promise<ProgressRecord[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<ProgressRow>(
      'SELECT * FROM progress_record ORDER BY date DESC LIMIT ?;',
      days,
    );
    return rows.map(toRecord).reverse();
  },

  async forDate(date: string): Promise<ProgressRecord | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<ProgressRow>(
      'SELECT * FROM progress_record WHERE date = ?;',
      date,
    );
    return row ? toRecord(row) : null;
  },

  async activeDates(limit = 400): Promise<string[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ date: string }>(
      'SELECT date FROM progress_record WHERE speaking_minutes > 0 ORDER BY date DESC LIMIT ?;',
      limit,
    );
    return rows.map((r) => r.date);
  },

  /** Everything the dashboard needs, in one round trip. */
  async summary(input: {
    currentLevel: CefrLevel;
    targetLevel: CefrLevel;
    dailyGoalMinutes: number;
  }): Promise<ProgressSummary> {
    const db = await getDatabase();
    const today = todayKey();

    const totals = await db.getFirstAsync<{
      minutes: number | null;
      sessions: number | null;
      messages: number | null;
      grammar: number | null;
      vocabulary: number | null;
      fluency: number | null;
      overall: number | null;
    }>(
      `SELECT SUM(speaking_minutes) AS minutes, SUM(sessions) AS sessions,
              SUM(messages) AS messages, AVG(grammar_score) AS grammar,
              AVG(vocabulary_score) AS vocabulary, AVG(fluency_score) AS fluency,
              AVG(overall_score) AS overall
         FROM progress_record;`,
    );

    const wordsRow = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM vocabulary WHERE status != 'new';",
    );
    const mistakesRow = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM mistake WHERE mastered = 0;',
    );
    const todayRow = await db.getFirstAsync<{ minutes: number | null }>(
      'SELECT speaking_minutes AS minutes FROM progress_record WHERE date = ?;',
      today,
    );

    const activeDates = await this.activeDates();
    const weeklyRaw = await this.recent(14);

    const round = (value: number | null | undefined): number | null =>
      value === null || value === undefined ? null : Number(value.toFixed(1));

    return {
      currentLevel: input.currentLevel,
      targetLevel: input.targetLevel,
      streakDays: computeStreak(activeDates, today),
      totalSpeakingMinutes: Number((totals?.minutes ?? 0).toFixed(1)),
      totalSessions: totals?.sessions ?? 0,
      totalMessages: totals?.messages ?? 0,
      wordsLearned: wordsRow?.n ?? 0,
      activeMistakes: mistakesRow?.n ?? 0,
      averageOverallScore: round(totals?.overall),
      averageGrammarScore: round(totals?.grammar),
      averageVocabularyScore: round(totals?.vocabulary),
      averageFluencyScore: round(totals?.fluency),
      todayMinutes: Number((todayRow?.minutes ?? 0).toFixed(1)),
      dailyGoalMinutes: input.dailyGoalMinutes,
      weekly: fillProgressWindow(weeklyRaw, today, 7),
    };
  },
};

interface GoalRow {
  date: string;
  goal_minutes: number;
  achieved_minutes: number;
  sessions_completed: number;
  completed: number;
}

export const dailyGoalRepository = {
  async ensureToday(goalMinutes: number): Promise<DailyGoalRecord> {
    const db = await getDatabase();
    const date = todayKey();
    await db.runAsync(
      `INSERT INTO daily_goal (date, goal_minutes, achieved_minutes, sessions_completed, completed)
       VALUES (?, ?, 0, 0, 0)
       ON CONFLICT (date) DO UPDATE SET goal_minutes = excluded.goal_minutes;`,
      date,
      goalMinutes,
    );
    const row = await db.getFirstAsync<GoalRow>('SELECT * FROM daily_goal WHERE date = ?;', date);
    return {
      date,
      goalMinutes: row?.goal_minutes ?? goalMinutes,
      achievedMinutes: row?.achieved_minutes ?? 0,
      sessionsCompleted: row?.sessions_completed ?? 0,
      completed: toBool(row?.completed),
    };
  },

  async addMinutes(minutes: number): Promise<void> {
    const db = await getDatabase();
    const date = todayKey();
    await db.runAsync(
      `UPDATE daily_goal
          SET achieved_minutes = achieved_minutes + ?,
              sessions_completed = sessions_completed + 1,
              completed = CASE WHEN achieved_minutes + ? >= goal_minutes THEN 1 ELSE 0 END
        WHERE date = ?;`,
      minutes,
      minutes,
      date,
    );
  },
};
