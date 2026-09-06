# Database

SQLite via `expo-sqlite`, on the phone. File: `deutschlearnen.db`.
`PRAGMA journal_mode = WAL` (reads stay fast while a session writes every few
seconds) and `PRAGMA foreign_keys = ON`.

## Migrations

`src/database/schema.ts` holds an ordered list of statement batches;
`PRAGMA user_version` records how far the device has got.

```ts
export const MIGRATIONS: Migration[] = [
  { version: 1, name: 'initial schema', statements: [ /* ... */ ] },
];
```

**Add a migration by appending a new entry. Never edit an existing one** — a
device that already ran it will not run it again. Settings shows the device's
schema version next to the latest known version, so a stuck migration is
visible rather than mysterious.

---

## Tables

### `user_settings`

Single row (`id = 1`) holding settings as a JSON blob.

| column | type | |
|---|---|---|
| `id` | INTEGER PK | always 1 |
| `data` | TEXT | JSON `UserSettings` |
| `updated_at` | TEXT | ISO |

A column per setting would mean a migration for every new toggle. On read,
unknown keys are dropped and missing keys fall back to `DEFAULT_SETTINGS`, so an
old row still loads after a new setting ships. A corrupt blob falls back to
defaults rather than bricking startup.

### `conversation_session`

| column | type | notes |
|---|---|---|
| `id` | TEXT PK | `ses_...` |
| `started_at` / `ended_at` | TEXT | ISO |
| `level` | TEXT | CEFR at the time of the session |
| `topic_id`, `mode_id` | TEXT | |
| `kind` | TEXT | conversation / roleplay / daily / listening / shadowing / exam / mistake-drill / text |
| `duration_sec`, `message_count` | INTEGER | |
| `overall_score`, `grammar_score`, `fluency_score`, `vocabulary_score`, `pronunciation_score` | REAL | 0–100, nullable |
| `summary` | TEXT | German, shown on the score screen |
| `completed` | INTEGER | 0/1 |

Index: `started_at DESC`.

A session where the learner never spoke is deleted on exit
(`discardIfEmpty`), so history and progress stay meaningful.

### `conversation_message`

| column | type | notes |
|---|---|---|
| `id` | TEXT PK | |
| `session_id` | TEXT FK → session | `ON DELETE CASCADE` |
| `speaker` | TEXT | `user` / `ai` |
| `text` | TEXT | |
| `created_at` | TEXT | |
| `audio_uri` | TEXT | **null unless the learner opted in** |
| `corrected_text` | TEXT | |
| `confidence` | REAL | recogniser confidence, 0–1 |

Index: `(session_id, created_at)`.

### `correction`

One row per correction shown. `session_id` cascades.

| column | notes |
|---|---|
| `original`, `corrected` | the sentence pair |
| `explanation`, `explanation_bn`, `explanation_en` | German always, others when enabled |
| `category` | one of the 21 mistake categories |
| `severity` | minor / important / critical |
| `natural_alternative` | mostly B1/B2 |

### `mistake` — the memory that makes the app work

| column | notes |
|---|---|
| `id` | `mis_...` |
| `category` | mistake category |
| `wrong_text`, `correct_text` | latest example |
| `normalized_key` | lowercased, punctuation-stripped `correct_text` |
| `count` | times seen |
| `first_seen`, `last_seen` | ISO |
| `correct_streak` | consecutive correct drills |
| `mastered` | 0/1 |

`UNIQUE (category, normalized_key)` is the important part: the same error phrased
slightly differently increments one counter instead of creating clutter.

Lifecycle: seeing it again bumps `count`, resets `correct_streak` to 0 and
un-masters it (relapse is real). Four correct drills in a row
(`MASTERY_STREAK`) marks it mastered and it stops being surfaced.

Index: `(mastered, count DESC)` — the ordering the drill and prompt builders use.

### `vocabulary`

| column | notes |
|---|---|
| `german`, `german_key` | `german_key` is `UNIQUE`, so repeated words upsert |
| `english`, `bangla` | |
| `article`, `word_type` | `der`/`die`/`das`, Nomen/Verb/Adjektiv |
| `example_sentence`, `example_translation` | |
| `level`, `category` | |
| `status` | `new` / `learning` / `mastered` |
| `favorite`, `times_seen`, `times_correct` | |
| `created_at`, `last_reviewed_at`, `due_at` | |

Review schedule: 1, 3, 7, 16, 35 days (`REVIEW_INTERVALS`). A wrong answer resets
`times_correct` to 0. Five correct reviews → `mastered`. This is deliberately
simple and is the seam for a real SRS algorithm.

### `practice_exercise`

| column | notes |
|---|---|
| `id` | `exr_...` |
| `mistake_id` | the mistake this drill targets, so a result is attributable even after the screen is closed and reopened |
| `type` | fill-blank / reorder / transform / speak |
| `prompt`, `answer`, `hint`, `explanation` | |
| `level` | |
| `created_at`, `completed_at`, `was_correct` | |

Generated drills cost an API call, so they are persisted rather than discarded
when the screen unmounts. An interrupted drill session resumes from the
unfinished rows at no cost, and unfinished drills older than a week are pruned.

### `daily_goal`

Keyed by `YYYY-MM-DD`: `goal_minutes`, `achieved_minutes`, `sessions_completed`,
`completed`.

### `progress_record`

One row per active day, keyed by `YYYY-MM-DD`. Minutes and counts accumulate;
**scores are stored as a running average per day**, so a second session moves the
number rather than replacing it — one bad five-minute session cannot erase a good
twenty-minute one.

### `learner_memory`

Single row (`id = 1`).

| column | notes |
|---|---|
| `long_term_summary` | up to 3 German session notes joined by ` \| ` — this is what the tutor sees as "previous sessions" |
| `difficulty_level` | current adaptive CEFR level |
| `difficulty_progress` | 0–1 position inside that band |
| `started_on` | drives the day number in the 7-day curriculum |

The summary is capped on purpose: an unbounded blob would silently grow every
prompt and every bill.

---

## Repositories

`src/database/repositories/` — each file exports one object with a typed surface.

| Repository | Responsibility |
|---|---|
| `settingsRepository` | get / save / patch / reset |
| `sessionRepository` | create, finish, discardIfEmpty, messages, corrections |
| `mistakeRepository` | record (upsert + count), listActive, recordSuccess/Failure, categoryTotals |
| `vocabularyRepository` | upsert, list, listDue, review, knownWords |
| `progressRepository` | recordSession, recent, summary, activeDates |
| `dailyGoalRepository` | ensureToday, addMinutes |
| `memoryRepository` | get, appendNote, setDifficulty |
| `exerciseRepository` | saveMany, complete, listPending, statsForToday, pruneStale |

This is the seam for cloud sync: a Postgres implementation exposing the same
surface can replace SQLite without touching a screen.

---

## Deleting data

| Function | Removes |
|---|---|
| `deleteConversationHistory()` | corrections, messages, sessions |
| `deleteVocabulary()` | vocabulary |
| `deleteMistakes()` | mistake memory |
| `deleteAllData()` | every table, in FK-safe order |

`deleteAllData` keeps the schema and version so the app keeps working. All four
are wired to Settings → Datenschutz behind a confirmation dialog.

---

## Inspecting the database

```bash
adb exec-out run-as com.deutschlearnen.app \
  cat databases/deutschlearnen.db > local.db
sqlite3 local.db "SELECT category, wrong_text, correct_text, count
                  FROM mistake WHERE mastered = 0 ORDER BY count DESC;"
```

`run-as` works on debug builds. In Expo Go the database lives inside the Expo Go
sandbox instead.
