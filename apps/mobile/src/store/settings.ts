import { create } from 'zustand';
import { DEFAULT_APP_NAME, DEFAULT_SETTINGS, type UserSettings } from '@deutschcoach/shared';
import { settingsRepository } from '@/database/repositories';

/**
 * Settings store.
 *
 * SQLite is the source of truth; this store is the in-memory mirror the UI
 * renders from. Writes go to the database first, so a crash mid-change cannot
 * leave the app showing a setting it did not save.
 */
interface SettingsState {
  settings: UserSettings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (partial: Partial<UserSettings>) => Promise<void>;
  reset: () => Promise<void>;
}

/** The product name, overridable per-build without touching code. */
export const APP_NAME = process.env.EXPO_PUBLIC_APP_NAME || DEFAULT_APP_NAME;

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS, appName: APP_NAME },
  loaded: false,

  async load() {
    const stored = await settingsRepository.get();
    set({ settings: { ...stored, appName: APP_NAME }, loaded: true });
  },

  async update(partial) {
    const next = await settingsRepository.patch(partial);
    set({ settings: { ...next, appName: APP_NAME } });
  },

  async reset() {
    const next = await settingsRepository.reset();
    set({ settings: { ...next, appName: APP_NAME } });
  },
}));

/** Read settings without subscribing, for use inside event handlers. */
export function currentSettings(): UserSettings {
  return useSettingsStore.getState().settings;
}
