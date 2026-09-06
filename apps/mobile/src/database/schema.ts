/**
 * Database schema and migrations.
 *
 * Migrations are an ordered list of statement batches; `user_version` records
 * how far the device has got. Adding a migration means appending to the array -
 * never editing an existing entry, because a device that already ran it will
 * not run it again.
 */

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    statements: [
      `CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS conversation_session (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        level TEXT NOT NULL,
        topic_id TEXT NOT NULL,
        mode_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        duration_sec INTEGER NOT NULL DEFAULT 0,
        message_count INTEGER NOT NULL DEFAULT 0,
        overall_score REAL,
        grammar_score REAL,
        fluency_score REAL,
        vocabulary_score REAL,
        pronunciation_score REAL,
        summary TEXT,
        completed INTEGER NOT NULL DEFAULT 0
      );`,
      `CREATE INDEX IF NOT EXISTS idx_session_started ON conversation_session (started_at DESC);`,

      `CREATE TABLE IF NOT EXISTS conversation_message (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES conversation_session (id) ON DELETE CASCADE,
        speaker TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        audio_uri TEXT,
        corrected_text TEXT,
        confidence REAL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_message_session ON conversation_message (session_id, created_at);`,

      `CREATE TABLE IF NOT EXISTS correction (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES conversation_session (id) ON DELETE CASCADE,
        message_id TEXT NOT NULL,
        original TEXT NOT NULL,
        corrected TEXT NOT NULL,
        explanation TEXT NOT NULL,
        explanation_bn TEXT,
        explanation_en TEXT,
        category TEXT NOT NULL,
        severity TEXT NOT NULL,
        natural_alternative TEXT,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_correction_session ON correction (session_id);`,

      `CREATE TABLE IF NOT EXISTS mistake (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        wrong_text TEXT NOT NULL,
        correct_text TEXT NOT NULL,
        normalized_key TEXT NOT NULL,
        explanation TEXT NOT NULL,
        level TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        correct_streak INTEGER NOT NULL DEFAULT 0,
        mastered INTEGER NOT NULL DEFAULT 0
      );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_mistake_key ON mistake (category, normalized_key);`,
      `CREATE INDEX IF NOT EXISTS idx_mistake_count ON mistake (mastered, count DESC);`,

      `CREATE TABLE IF NOT EXISTS vocabulary (
        id TEXT PRIMARY KEY,
        german TEXT NOT NULL,
        german_key TEXT NOT NULL UNIQUE,
        english TEXT NOT NULL,
        bangla TEXT,
        article TEXT,
        word_type TEXT,
        example_sentence TEXT NOT NULL,
        example_translation TEXT,
        level TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new',
        favorite INTEGER NOT NULL DEFAULT 0,
        times_seen INTEGER NOT NULL DEFAULT 0,
        times_correct INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_reviewed_at TEXT,
        due_at TEXT
      );`,
      `CREATE INDEX IF NOT EXISTS idx_vocab_status ON vocabulary (status, created_at DESC);`,

      `CREATE TABLE IF NOT EXISTS practice_exercise (
        id TEXT PRIMARY KEY,
        mistake_id TEXT,
        type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        answer TEXT NOT NULL,
        hint TEXT,
        explanation TEXT,
        level TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        was_correct INTEGER
      );`,

      `CREATE TABLE IF NOT EXISTS daily_goal (
        date TEXT PRIMARY KEY,
        goal_minutes INTEGER NOT NULL,
        achieved_minutes REAL NOT NULL DEFAULT 0,
        sessions_completed INTEGER NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0
      );`,

      `CREATE TABLE IF NOT EXISTS progress_record (
        date TEXT PRIMARY KEY,
        speaking_minutes REAL NOT NULL DEFAULT 0,
        sessions INTEGER NOT NULL DEFAULT 0,
        messages INTEGER NOT NULL DEFAULT 0,
        grammar_score REAL,
        vocabulary_score REAL,
        fluency_score REAL,
        pronunciation_score REAL,
        overall_score REAL,
        new_words INTEGER NOT NULL DEFAULT 0,
        mistakes_made INTEGER NOT NULL DEFAULT 0
      );`,

      /** Long-term learner memory: one row, the running German profile line. */
      `CREATE TABLE IF NOT EXISTS learner_memory (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        long_term_summary TEXT,
        difficulty_level TEXT NOT NULL DEFAULT 'A1',
        difficulty_progress REAL NOT NULL DEFAULT 0.5,
        started_on TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
    ],
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

/** Tables cleared by "Delete all data", in FK-safe order. */
export const ALL_TABLES = [
  'correction',
  'conversation_message',
  'conversation_session',
  'mistake',
  'vocabulary',
  'practice_exercise',
  'daily_goal',
  'progress_record',
  'learner_memory',
  'user_settings',
] as const;
