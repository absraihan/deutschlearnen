import { DEFAULT_SETTINGS, type UserSettings } from '@deutschlearnen/shared';
import { getDatabase } from '../index';
import { nowIso } from '@/lib/util';

/**
 * Settings live as one JSON blob in a single row.
 *
 * A column per setting would mean a migration every time a toggle is added,
 * which for a personal app is pure friction. Unknown keys are dropped and
 * missing keys fall back to defaults on read, so an older row still loads after
 * a new setting ships.
 */
export interface SettingsRepository {
  get(): Promise<UserSettings>;
  save(settings: UserSettings): Promise<void>;
  patch(partial: Partial<UserSettings>): Promise<UserSettings>;
  reset(): Promise<UserSettings>;
}

export const settingsRepository: SettingsRepository = {
  async get() {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ data: string }>(
      'SELECT data FROM user_settings WHERE id = 1;',
    );
    if (!row) return { ...DEFAULT_SETTINGS };

    try {
      const parsed = JSON.parse(row.data) as Partial<UserSettings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      // A corrupt row must not brick the app; fall back to defaults.
      return { ...DEFAULT_SETTINGS };
    }
  },

  async save(settings) {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO user_settings (id, data, updated_at) VALUES (1, ?, ?)
       ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at;`,
      JSON.stringify(settings),
      nowIso(),
    );
  },

  async patch(partial) {
    const current = await this.get();
    const next = { ...current, ...partial };
    await this.save(next);
    return next;
  },

  async reset() {
    const next = { ...DEFAULT_SETTINGS };
    await this.save(next);
    return next;
  },
};
