import * as SQLite from 'expo-sqlite';
import { ALL_TABLES, LATEST_VERSION, MIGRATIONS } from './schema';

/**
 * Local-first storage.
 *
 * Everything the learner produces lives here and nowhere else. The server is a
 * stateless AI gateway, which is what makes "Delete all data" in Settings an
 * honest promise rather than a partial one.
 */

const DATABASE_NAME = 'deutschcoach.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate();
  }
  return dbPromise;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

  // WAL keeps reads fast while a session is writing messages every few seconds.
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await migrate(db);
  return db;
}

export async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const current = row?.user_version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    for (const statement of migration.statements) {
      await db.execAsync(statement);
    }
    // PRAGMA does not accept bound parameters.
    await db.execAsync(`PRAGMA user_version = ${migration.version};`);
  }
}

/** Current schema version on this device, for the Settings diagnostics row. */
export async function getSchemaVersion(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  return row?.user_version ?? 0;
}

export { LATEST_VERSION };

/**
 * Delete every learner record. Used by Settings -> Delete all data, behind a
 * confirmation. Schema and version are kept so the app keeps working.
 */
export async function deleteAllData(): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const table of ALL_TABLES) {
      await db.execAsync(`DELETE FROM ${table};`);
    }
  });
}

/** Delete only conversation history, keeping vocabulary, mistakes and progress. */
export async function deleteConversationHistory(): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM correction;');
    await db.execAsync('DELETE FROM conversation_message;');
    await db.execAsync('DELETE FROM conversation_session;');
  });
}

export async function deleteVocabulary(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync('DELETE FROM vocabulary;');
}

export async function deleteMistakes(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync('DELETE FROM mistake;');
}

/** Test/debug helper: forget the cached handle so a fresh one is opened. */
export function resetDatabaseHandle(): void {
  dbPromise = null;
}
