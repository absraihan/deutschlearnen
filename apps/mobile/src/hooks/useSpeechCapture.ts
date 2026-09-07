import { useCallback, useRef, useState } from 'react';
import { useRecorder } from './useRecorder';
import { useSettingsStore } from '@/store/settings';
import {
  SpeechError,
  recognizeOnDevice,
  transcribeRecording,
  type TranscriptResult,
} from '@/services/speech/stt';
import { stopSpeaking } from '@/services/speech/tts';

/**
 * One way to capture spoken German, used by every screen with a microphone.
 *
 * This exists because it did not: the conversation screen honoured
 * `settings.speechEngine` while the listening and shadowing screens always went
 * to server transcription. With `STT_PROVIDER=none` - the default, and what a
 * keyless deployment runs - their microphone button could never work at all.
 * A learner saw a connection error on a perfectly good connection.
 *
 * Screens now share this hook, so a new practice mode cannot reintroduce the
 * same gap by forgetting to check the setting.
 */
export interface UseSpeechCapture {
  isRecording: boolean;
  isProcessing: boolean;
  /** German message safe to show, or null. */
  error: string | null;
  /**
   * Start listening, or stop and transcribe if already listening.
   * Resolves with the transcript, or null when it is still recording or failed.
   */
  toggle: (contextPrompt?: string) => Promise<TranscriptResult | null>;
  cancel: () => Promise<void>;
  clearError: () => void;
}

export function useSpeechCapture(): UseSpeechCapture {
  const engine = useSettingsStore((s) => s.settings.speechEngine);
  const recorder = useRecorder();

  const [isProcessing, setIsProcessing] = useState(false);
  const [nativeListening, setNativeListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nativeRun = useRef<{ cancel: () => void } | null>(null);

  const fail = useCallback((err: unknown) => {
    setError(
      err instanceof SpeechError
        ? err.userMessage
        : 'Die Aufnahme hat nicht funktioniert. Bitte versuche es noch einmal.',
    );
    return null;
  }, []);

  const toggle = useCallback(
    async (contextPrompt?: string): Promise<TranscriptResult | null> => {
      setError(null);
      // Never record the tutor's own voice back into the microphone.
      await stopSpeaking();

      if (engine === 'native') {
        if (nativeRun.current) {
          nativeRun.current.cancel();
          return null;
        }
        setNativeListening(true);
        const run = recognizeOnDevice({ maxDurationMs: 60_000 });
        nativeRun.current = run;
        try {
          return await run.promise;
        } catch (err) {
          return fail(err);
        } finally {
          nativeRun.current = null;
          setNativeListening(false);
        }
      }

      if (!recorder.isRecording) {
        try {
          await recorder.start();
        } catch (err) {
          return fail(err);
        }
        return null;
      }

      setIsProcessing(true);
      try {
        const recording = await recorder.stop();
        return await transcribeRecording({
          uri: recording.uri,
          durationMs: recording.durationMs,
          contextPrompt,
        });
      } catch (err) {
        return fail(err);
      } finally {
        setIsProcessing(false);
      }
    },
    [engine, fail, recorder],
  );

  const cancel = useCallback(async () => {
    nativeRun.current?.cancel();
    nativeRun.current = null;
    setNativeListening(false);
    await recorder.cancel();
    setIsProcessing(false);
  }, [recorder]);

  return {
    isRecording: engine === 'native' ? nativeListening : recorder.isRecording,
    isProcessing,
    error,
    toggle,
    cancel,
    clearError: () => setError(null),
  };
}
