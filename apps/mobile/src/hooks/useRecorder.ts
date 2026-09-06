import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { MAX_UTTERANCE_MS } from '@deutschcoach/shared';
import { SpeechError } from '@/services/speech/stt';

/**
 * Microphone recording.
 *
 * Permission is requested on the first recording attempt, never at app start:
 * asking for the microphone before the learner has pressed anything is the
 * fastest way to get denied (§36).
 *
 * Recording stops itself at MAX_UTTERANCE_MS so a forgotten press cannot turn
 * into a multi-minute upload.
 */
export interface RecorderState {
  isRecording: boolean;
  durationMs: number;
  permissionDenied: boolean;
}

export interface UseRecorder extends RecorderState {
  start: () => Promise<void>;
  stop: () => Promise<{ uri: string | null; durationMs: number }>;
  cancel: () => Promise<void>;
}

export function useRecorder(): UseRecorder {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const startedAt = useRef<number>(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStop = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (tick.current) clearInterval(tick.current);
    if (autoStop.current) clearTimeout(autoStop.current);
    tick.current = null;
    autoStop.current = null;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const start = useCallback(async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setPermissionDenied(true);
      throw new SpeechError(
        'permission-denied',
        'Ohne Mikrofonzugriff kann ich dich nicht hören. Erlaube den Zugriff in den Systemeinstellungen.',
      );
    }
    setPermissionDenied(false);

    // playsInSilentMode matters on iOS; recording mode matters on both.
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();

    startedAt.current = Date.now();
    setDurationMs(0);
    setIsRecording(true);

    tick.current = setInterval(() => setDurationMs(Date.now() - startedAt.current), 200);
    autoStop.current = setTimeout(() => {
      void recorder.stop();
      clearTimers();
      setIsRecording(false);
    }, MAX_UTTERANCE_MS);
  }, [clearTimers, recorder]);

  const stop = useCallback(async () => {
    clearTimers();
    const elapsed = startedAt.current === 0 ? 0 : Date.now() - startedAt.current;
    setIsRecording(false);
    setDurationMs(elapsed);

    try {
      await recorder.stop();
    } catch {
      // Stopping a recorder that never started is not an error worth surfacing.
    }
    // Playback must be allowed again, otherwise the tutor reply is silent on iOS.
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

    return { uri: recorder.uri, durationMs: elapsed };
  }, [clearTimers, recorder]);

  const cancel = useCallback(async () => {
    clearTimers();
    setIsRecording(false);
    setDurationMs(0);
    startedAt.current = 0;
    try {
      await recorder.stop();
    } catch {
      // Nothing to stop.
    }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  }, [clearTimers, recorder]);

  return { isRecording, durationMs, permissionDenied, start, stop, cancel };
}
