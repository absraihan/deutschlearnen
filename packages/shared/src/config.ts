import type { CefrLevel, UserSettings } from './types';

/**
 * Branding and defaults.
 *
 * The product name lives here (and is overridable by env on both sides), so
 * renaming the app is a one-line change plus an app.json tweak.
 */
export const DEFAULT_APP_NAME = 'DeutschLearnen';
export const DEFAULT_APP_TAGLINE = 'Dein persönlicher Sprachcoach';
export const APP_SLUG = 'deutschlearnen';

/** German locale used everywhere in the speech pipeline. */
export const SPEECH_LOCALE = 'de-DE';

/** Shown when speech recognition confidence is below this. */
export const LOW_CONFIDENCE_THRESHOLD = 0.55;
export const LOW_CONFIDENCE_MESSAGE_DE = 'Ich habe dich nicht ganz verstanden.';
export const LOW_CONFIDENCE_HINT_DE = 'Sprich bitte etwas lauter und langsamer.';

/** Speech shorter than this is treated as an accidental tap, not a turn. */
export const MIN_UTTERANCE_MS = 700;
export const MIN_UTTERANCE_CHARS = 2;
/** Recording is stopped automatically after this, to protect the API budget. */
export const MAX_UTTERANCE_MS = 60_000;

export const PLAYBACK_SPEEDS = [0.75, 1.0, 1.25] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

export const DEFAULT_SETTINGS: UserSettings = {
  appName: DEFAULT_APP_NAME,
  currentLevel: 'A1',
  targetLevel: 'B2',
  correctionMode: 'NORMAL',
  voiceSpeed: 0.9,
  aiVoice: '',
  dailyGoalMinutes: 10,
  banglaExplanations: true,
  englishExplanations: true,
  autoCorrection: true,
  saveConversations: true,
  saveAudioRecordings: false,
  speechEngine: 'cloud',
  ttsEngine: 'device',
  adaptiveDifficulty: true,
  hapticsEnabled: true,
  theme: 'system',
};

/** Explanation languages implied by the settings toggles. */
export function explanationLanguagesFor(settings: {
  banglaExplanations: boolean;
  englishExplanations: boolean;
}): Array<'de' | 'en' | 'bn'> {
  const langs: Array<'de' | 'en' | 'bn'> = ['de'];
  if (settings.banglaExplanations) langs.push('bn');
  if (settings.englishExplanations) langs.push('en');
  return langs;
}

/** TTS rate for a level, before the user speed preference is applied. */
export function baseSpeechRate(level: CefrLevel): number {
  return { A1: 0.8, A2: 0.9, B1: 1.0, B2: 1.0 }[level];
}
