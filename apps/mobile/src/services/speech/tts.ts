import * as Speech from 'expo-speech';
import { cacheDirectory, deleteAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { SPEECH_LOCALE, baseSpeechRate, type CefrLevel } from '@deutschcoach/shared';
import { api } from '../api';
import { clamp } from '@/lib/util';

/**
 * Text to speech.
 *
 * Two engines behind one function:
 *  - `device` (expo-speech) is the default. Free, offline, works in Expo Go,
 *    and every Android phone ships a German voice.
 *  - `server` routes through the backend TTS provider for a better German
 *    voice, at a per-character cost.
 *
 * Server synthesis falls back to the device voice on any failure, because a
 * silent tutor is a broken app while a slightly worse voice is not.
 */

export type TtsEngine = 'device' | 'server';

export interface SpeakOptions {
  text: string;
  level: CefrLevel;
  /** User speed preference, multiplied with the level base rate. */
  speedPreference: number;
  engine: TtsEngine;
  voice?: string;
  onStart?: () => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
}

let activePlayer: AudioPlayer | null = null;
let activeFileUri: string | null = null;

/** Effective TTS rate: slower at A1, adjusted by the learner's preference. */
export function effectiveRate(level: CefrLevel, preference: number): number {
  return clamp(baseSpeechRate(level) * preference, 0.4, 1.6);
}

export async function speak(options: SpeakOptions): Promise<void> {
  await stopSpeaking();

  if (options.engine === 'server') {
    try {
      await speakViaServer(options);
      return;
    } catch {
      // Fall through to the device voice rather than leaving the tutor mute.
    }
  }

  speakOnDevice(options);
}

function speakOnDevice(options: SpeakOptions): void {
  options.onStart?.();
  Speech.speak(options.text, {
    language: SPEECH_LOCALE,
    rate: effectiveRate(options.level, options.speedPreference),
    pitch: 1.0,
    voice: options.voice || undefined,
    onDone: () => options.onDone?.(),
    onStopped: () => options.onDone?.(),
    onError: (error) => {
      options.onError?.(error instanceof Error ? error : new Error('TTS failed'));
      options.onDone?.();
    },
  });
}

async function speakViaServer(options: SpeakOptions): Promise<void> {
  const response = await fetch(api.speakUrl(), {
    method: 'POST',
    headers: api.speakHeaders(),
    body: JSON.stringify({
      text: options.text,
      voice: options.voice || null,
      speed: effectiveRate(options.level, options.speedPreference),
      format: 'mp3',
    }),
  });

  if (!response.ok) throw new Error(`Server TTS failed with ${response.status}`);
  if (!cacheDirectory) throw new Error('No cache directory available for audio');

  const buffer = await response.arrayBuffer();
  const uri = `${cacheDirectory}tutor-${Date.now()}.mp3`;
  await writeAsStringAsync(uri, arrayBufferToBase64(buffer), { encoding: 'base64' });

  options.onStart?.();
  const player = createAudioPlayer({ uri });
  activePlayer = player;
  activeFileUri = uri;

  player.addListener('playbackStatusUpdate', (status) => {
    if (status.didJustFinish) {
      options.onDone?.();
      void cleanupPlayer();
    }
  });
  player.play();
}

export async function stopSpeaking(): Promise<void> {
  try {
    Speech.stop();
  } catch {
    // Nothing was speaking.
  }
  await cleanupPlayer();
}

async function cleanupPlayer(): Promise<void> {
  const player = activePlayer;
  const uri = activeFileUri;
  activePlayer = null;
  activeFileUri = null;

  if (player) {
    try {
      player.remove();
    } catch {
      // Already released.
    }
  }
  if (uri) {
    // Cached synthesis is per-utterance and never re-used; leaving files behind
    // would grow the cache directory forever.
    try {
      await deleteAsync(uri, { idempotent: true });
    } catch {
      // Best effort.
    }
  }
}

/** German voices installed on this device, for the voice picker in Settings. */
export async function listGermanVoices(): Promise<Array<{ id: string; name: string }>> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    return voices
      .filter((v) => v.language?.toLowerCase().startsWith('de'))
      .map((v) => ({ id: v.identifier, name: v.name || v.identifier }));
  } catch {
    return [];
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  // btoa is available in the React Native runtime.
  return globalThis.btoa(binary);
}
