import {
  LOW_CONFIDENCE_THRESHOLD,
  MIN_UTTERANCE_CHARS,
  MIN_UTTERANCE_MS,
  SPEECH_LOCALE,
} from '@deutschlearnen/shared';
import { api, ApiClientError } from '../api';

/**
 * Speech to text.
 *
 * Two engines, chosen in Settings:
 *  - `cloud`: record with expo-audio, upload to the server, transcribe with the
 *    server STT provider. Works in Expo Go, most accurate for German, and the
 *    only engine that returns a usable confidence signal.
 *  - `native`: on-device recognition via expo-speech-recognition. Free and
 *    instant, but it is a native module, so it needs a development build and is
 *    absent in Expo Go. It is loaded lazily and its absence is reported, never
 *    crashed on.
 *
 * The locale is always de-DE. English is never accepted as a fallback language:
 * mis-detecting German as English is worse than asking the learner to repeat.
 */

export type SttEngine = 'cloud' | 'native';

export interface TranscriptResult {
  text: string;
  confidence: number | null;
  /** True when the result is too weak to act on and the learner should retry. */
  lowConfidence: boolean;
  engine: SttEngine;
  durationMs: number;
}

export class SpeechError extends Error {
  readonly code:
    | 'too-short'
    | 'empty'
    | 'permission-denied'
    | 'not-available'
    | 'network'
    | 'unknown';
  readonly userMessage: string;

  constructor(code: SpeechError['code'], userMessage: string, message?: string) {
    super(message ?? userMessage);
    this.name = 'SpeechError';
    this.code = code;
    this.userMessage = userMessage;
  }
}

/**
 * Turn a finished recording into German text.
 * `durationMs` guards against an accidental tap producing an empty API call.
 */
export async function transcribeRecording(input: {
  uri: string | null;
  durationMs: number;
  /** German words the recogniser should expect, biases cloud transcription. */
  contextPrompt?: string;
}): Promise<TranscriptResult> {
  if (input.durationMs < MIN_UTTERANCE_MS) {
    throw new SpeechError(
      'too-short',
      'Das war zu kurz. Halte den Knopf gedrückt und sprich einen ganzen Satz.',
    );
  }
  if (!input.uri) {
    throw new SpeechError('empty', 'Ich habe keine Aufnahme bekommen. Bitte versuche es noch einmal.');
  }

  let response;
  try {
    response = await api.transcribe({ uri: input.uri, prompt: input.contextPrompt });
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw new SpeechError(
        error.code === 'offline' || error.code === 'timeout' ? 'network' : 'unknown',
        error.userMessage,
        error.message,
      );
    }
    throw new SpeechError('unknown', 'Die Spracherkennung hat nicht funktioniert.');
  }

  const text = response.text.trim();
  if (text.length < MIN_UTTERANCE_CHARS) {
    throw new SpeechError(
      'empty',
      'Ich habe nichts gehört. Sprich bitte etwas lauter und näher am Mikrofon.',
    );
  }

  const confidence = response.confidence;
  return {
    text,
    confidence,
    lowConfidence: confidence !== null && confidence < LOW_CONFIDENCE_THRESHOLD,
    engine: 'cloud',
    durationMs: input.durationMs,
  };
}

/* ------------------------------------------------------------------ *
 * On-device recognition (optional native module)
 * ------------------------------------------------------------------ */

interface NativeSpeechModule {
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  start(options: Record<string, unknown>): void;
  stop(): void;
  addSpeechRecognitionListener(
    event: string,
    handler: (payload: unknown) => void,
  ): { remove(): void };
}

let nativeModule: NativeSpeechModule | null | undefined;

/**
 * Resolve the optional on-device recogniser.
 * Returns null in Expo Go or when the module is not installed, which the UI
 * shows as an explicitly unavailable option rather than a broken button.
 */
export function getNativeRecognizer(): NativeSpeechModule | null {
  if (nativeModule !== undefined) return nativeModule;
  try {
    // Not a static import: the module is optional and absent in Expo Go.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-speech-recognition') as {
      ExpoSpeechRecognitionModule?: NativeSpeechModule;
    };
    nativeModule = mod.ExpoSpeechRecognitionModule ?? null;
  } catch {
    nativeModule = null;
  }
  return nativeModule;
}

export function isNativeRecognitionAvailable(): boolean {
  return getNativeRecognizer() !== null;
}

/**
 * Recognise German speech on-device.
 * Resolves with the final transcript, or rejects with a SpeechError.
 */
export function recognizeOnDevice(options: { maxDurationMs: number }): {
  promise: Promise<TranscriptResult>;
  cancel: () => void;
} {
  const recognizer = getNativeRecognizer();

  if (!recognizer) {
    return {
      promise: Promise.reject(
        new SpeechError(
          'not-available',
          'Erkennung auf dem Gerät ist in dieser App-Version nicht verfügbar. Nutze die Server-Erkennung.',
        ),
      ),
      cancel: () => undefined,
    };
  }

  const startedAt = Date.now();
  const subscriptions: Array<{ remove(): void }> = [];
  let settled = false;

  const promise = new Promise<TranscriptResult>((resolve, reject) => {
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      subscriptions.forEach((s) => s.remove());
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      recognizer.stop();
    }, options.maxDurationMs);

    subscriptions.push(
      recognizer.addSpeechRecognitionListener('result', (payload) => {
        const event = payload as {
          isFinal?: boolean;
          results?: Array<{ transcript?: string; confidence?: number }>;
        };
        if (!event.isFinal) return;

        const best = event.results?.[0];
        const text = (best?.transcript ?? '').trim();
        const confidence = typeof best?.confidence === 'number' ? best.confidence : null;

        finish(() => {
          if (text.length < MIN_UTTERANCE_CHARS) {
            reject(new SpeechError('empty', 'Ich habe nichts gehört. Bitte sprich noch einmal.'));
            return;
          }
          resolve({
            text,
            confidence,
            lowConfidence: confidence !== null && confidence < LOW_CONFIDENCE_THRESHOLD,
            engine: 'native',
            durationMs: Date.now() - startedAt,
          });
        });
      }),
    );

    subscriptions.push(
      recognizer.addSpeechRecognitionListener('error', (payload) => {
        const event = payload as { error?: string; message?: string };
        finish(() => {
          if (event.error === 'not-allowed') {
            reject(
              new SpeechError(
                'permission-denied',
                'Ohne Mikrofonzugriff kann ich dich nicht hören. Erlaube den Zugriff in den Einstellungen.',
              ),
            );
            return;
          }
          reject(
            new SpeechError(
              'unknown',
              'Ich habe dich nicht ganz verstanden. Bitte versuche es noch einmal.',
              event.message,
            ),
          );
        });
      }),
    );

    void recognizer
      .requestPermissionsAsync()
      .then((permission) => {
        if (!permission.granted) {
          finish(() =>
            reject(
              new SpeechError(
                'permission-denied',
                'Ohne Mikrofonzugriff kann ich dich nicht hören. Erlaube den Zugriff in den Einstellungen.',
              ),
            ),
          );
          return;
        }
        recognizer.start({
          lang: SPEECH_LOCALE,
          interimResults: false,
          continuous: false,
          // Never let the recogniser silently decide the learner spoke English.
          requiresOnDeviceRecognition: false,
          addsPunctuation: true,
        });
      })
      .catch(() =>
        finish(() =>
          reject(new SpeechError('unknown', 'Die Spracherkennung konnte nicht gestartet werden.')),
        ),
      );
  });

  return {
    promise,
    cancel: () => {
      try {
        recognizer.stop();
      } catch {
        // Already stopped.
      }
    },
  };
}
