import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  LOW_CONFIDENCE_HINT_DE,
  LOW_CONFIDENCE_MESSAGE_DE,
  buildSchedule,
  computeHeuristicScores,
  explanationLanguagesFor,
  getMode,
  getRoleplay,
  phaseAt,
  turnWordStats,
  type CefrLevel,
  type Correction,
  type ConversationSession,
  type SessionDuration,
  type SessionKind,
  type TurnMessage,
  type TurnStat,
} from '@deutschlearnen/shared';
import {
  dailyGoalRepository,
  memoryRepository,
  progressRepository,
  sessionRepository,
  vocabularyRepository,
} from '@/database/repositories';
import { ApiClientError, api } from '@/services/api';
import { SpeechError, transcribeRecording, recognizeOnDevice } from '@/services/speech/stt';
import { speak, stopSpeaking } from '@/services/speech/tts';
import { submitTurn, fetchOpening } from '@/services/tutor';
import { useRecorder } from '@/hooks/useRecorder';
import { useSettingsStore } from '@/store/settings';
import { createId, todayKey } from '@/lib/util';

/**
 * The conversation state machine.
 *
 * States map one-to-one onto what the microphone button shows, so the learner
 * can always tell whether the app is listening, thinking or talking (§7).
 */
export type MicState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface TranscriptEntry {
  id: string;
  speaker: 'user' | 'ai';
  text: string;
  correction?: Correction | null;
  confidence?: number | null;
  lowConfidence?: boolean;
  isRepeatMistake?: boolean;
}

export interface UseConversationOptions {
  modeId: string;
  kind: SessionKind;
  level: CefrLevel;
  roleplayId?: string | null;
  topic?: string | null;
  /** When set, the session follows a timed phase plan. */
  durationMinutes?: SessionDuration | null;
  /** Voice conversation, or the text-only variant of the same tutor. */
  inputMode: 'voice' | 'text';
}

export interface UseConversation {
  state: MicState;
  entries: TranscriptEntry[];
  session: ConversationSession | null;
  error: { message: string; retryable: boolean; code?: string } | null;
  elapsedSec: number;
  phaseTitle: string | null;
  phaseProgress: number;
  level: CefrLevel;
  levelChangedTo: CefrLevel | null;
  isBusy: boolean;
  recordingMs: number;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  cancelListening: () => Promise<void>;
  sendText: (text: string) => Promise<void>;
  retryLast: () => Promise<void>;
  replay: (text: string) => Promise<void>;
  dismissError: () => void;
  endSession: () => Promise<string | null>;
}

export function useConversation(options: UseConversationOptions): UseConversation {
  const settings = useSettingsStore((s) => s.settings);
  const recorder = useRecorder();

  const [session, setSession] = useState<ConversationSession | null>(null);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [state, setState] = useState<MicState>('idle');
  const [error, setError] = useState<{ message: string; retryable: boolean; code?: string } | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [levelChangedTo, setLevelChangedTo] = useState<CefrLevel | null>(null);
  const [activeLevel, setActiveLevel] = useState<CefrLevel>(options.level);

  const runningSummary = useRef<string | null>(null);
  const turnStats = useRef<TurnStat[]>([]);
  const lastUserText = useRef<string | null>(null);
  const lastConfidence = useRef<number | null>(null);
  const startedAt = useRef<number>(Date.now());
  const nativeRecognition = useRef<{ cancel: () => void } | null>(null);
  const finished = useRef(false);

  const schedule = useMemo(
    () => (options.durationMinutes ? buildSchedule(options.durationMinutes) : null),
    [options.durationMinutes],
  );

  const currentPhase = schedule ? phaseAt(schedule, elapsedSec) : null;

  /* ---------------------------------------------------------------- *
   * Session bootstrap
   * ---------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    // The server may have gone back to sleep while the app sat idle.
    api.warmUp();

    const boot = async (): Promise<void> => {
      const memory = await memoryRepository.get(options.level);
      const level = settings.adaptiveDifficulty ? memory.difficultyLevel : options.level;
      if (cancelled) return;
      setActiveLevel(level);

      const created = await sessionRepository.create({
        level,
        topicId: options.topic ?? options.modeId,
        modeId: options.modeId,
        kind: options.kind,
      });
      if (cancelled) return;
      setSession(created);
      startedAt.current = Date.now();

      const opening = await fetchOpening({
        modeId: options.modeId,
        level,
        roleplayId: options.roleplayId,
      });
      if (cancelled) return;

      const message = await sessionRepository.addMessage({
        sessionId: created.id,
        speaker: 'ai',
        text: opening,
      });
      setEntries([{ id: message.id, speaker: 'ai', text: opening }]);

      if (options.inputMode === 'voice') {
        await speakTutor(opening, level);
      }
    };

    void boot();
    return () => {
      cancelled = true;
      void stopSpeaking();
      nativeRecognition.current?.cancel();
    };
    // Session identity is fixed for the lifetime of the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Session clock. */
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const speakTutor = useCallback(
    async (text: string, level: CefrLevel): Promise<void> => {
      setState('speaking');
      await speak({
        text,
        level,
        speedPreference: settings.voiceSpeed,
        engine: settings.ttsEngine,
        voice: settings.aiVoice,
        onDone: () => setState('idle'),
        onError: () => setState('idle'),
      });
    },
    [settings.aiVoice, settings.ttsEngine, settings.voiceSpeed],
  );

  /* ---------------------------------------------------------------- *
   * Turn handling
   * ---------------------------------------------------------------- */

  const processTurn = useCallback(
    async (text: string, confidence: number | null, audioUri: string | null): Promise<void> => {
      if (!session) return;

      lastUserText.current = text;
      lastConfidence.current = confidence;

      const pendingId = createId('pending');
      setEntries((prev) => [
        ...prev,
        { id: pendingId, speaker: 'user', text, confidence, lowConfidence: false },
      ]);
      setState('processing');
      setError(null);

      const history: TurnMessage[] = entries.map((e) => ({ speaker: e.speaker, text: e.text }));

      try {
        const result = await submitTurn({
          session,
          settings,
          userText: text,
          confidence,
          audioUri,
          history,
          runningSummary: runningSummary.current,
          roleplayId: options.roleplayId,
          topic: options.topic,
          phaseInstruction: currentPhase?.instruction ?? null,
        });

        runningSummary.current = result.runningSummary;

        const stats = turnWordStats(text);
        turnStats.current.push({
          words: stats.words,
          uniqueWords: stats.uniqueWords,
          hadCorrection: Boolean(result.turn.correction?.hasError),
          severity: result.turn.correction?.hasError
            ? result.turn.correction.severity
            : null,
          accuracy: result.turn.turnAccuracy,
          sttConfidence: confidence,
        });

        setEntries((prev) =>
          prev
            .map((entry) =>
              entry.id === pendingId
                ? {
                    ...entry,
                    id: result.userMessageId,
                    correction: result.turn.correction,
                    isRepeatMistake: result.isRepeatMistake,
                  }
                : entry,
            )
            .concat({ id: result.aiMessageId, speaker: 'ai', text: result.turn.reply }),
        );

        if (result.newLevel) {
          setActiveLevel(result.newLevel);
          setLevelChangedTo(result.newLevel);
        }

        if (settings.hapticsEnabled) {
          void Haptics.notificationAsync(
            result.turn.correction?.hasError
              ? Haptics.NotificationFeedbackType.Warning
              : Haptics.NotificationFeedbackType.Success,
          );
        }

        if (options.inputMode === 'voice') {
          await speakTutor(result.turn.reply, result.newLevel ?? activeLevel);
        } else {
          setState('idle');
        }
      } catch (err) {
        // Keep the learner's own words on screen: losing them is the most
        // frustrating possible failure, and they may want to retry verbatim.
        setState('error');
        const apiError = err as ApiClientError;
        setError({
          message:
            apiError?.userMessage ?? 'Etwas ist schiefgelaufen. Bitte versuche es noch einmal.',
          retryable: apiError?.retryable ?? true,
          code: apiError?.code,
        });
      }
    },
    [
      activeLevel,
      currentPhase?.instruction,
      entries,
      options.inputMode,
      options.roleplayId,
      options.topic,
      session,
      settings,
      speakTutor,
    ],
  );

  /* ---------------------------------------------------------------- *
   * Microphone
   * ---------------------------------------------------------------- */

  const startListening = useCallback(async () => {
    if (state === 'processing') return;
    await stopSpeaking();
    setError(null);

    if (settings.hapticsEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (settings.speechEngine === 'native') {
      setState('listening');
      const recognition = recognizeOnDevice({ maxDurationMs: 60_000 });
      nativeRecognition.current = recognition;
      try {
        const result = await recognition.promise;
        await handleTranscript(result.text, result.confidence, result.lowConfidence, null);
      } catch (err) {
        handleSpeechError(err);
      } finally {
        nativeRecognition.current = null;
      }
      return;
    }

    try {
      await recorder.start();
      setState('listening');
    } catch (err) {
      handleSpeechError(err);
    }
    // handleTranscript and handleSpeechError are stable within this closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder, settings.hapticsEnabled, settings.speechEngine, state]);

  const handleTranscript = useCallback(
    async (
      text: string,
      confidence: number | null,
      lowConfidence: boolean,
      audioUri: string | null,
    ): Promise<void> => {
      if (lowConfidence) {
        // Do not guess. Ask for a repeat, exactly as specified (§6).
        setState('error');
        setError({
          message: `${LOW_CONFIDENCE_MESSAGE_DE} ${LOW_CONFIDENCE_HINT_DE}`,
          retryable: true,
        });
        return;
      }
      await processTurn(text, confidence, audioUri);
    },
    [processTurn],
  );

  const handleSpeechError = useCallback((err: unknown): void => {
    setState('error');
    if (err instanceof SpeechError) {
      setError({ message: err.userMessage, retryable: err.code !== 'permission-denied' });
      return;
    }
    setError({
      message: 'Die Aufnahme hat nicht funktioniert. Bitte versuche es noch einmal.',
      retryable: true,
    });
  }, []);

  const stopListening = useCallback(async () => {
    if (settings.speechEngine === 'native') {
      nativeRecognition.current?.cancel();
      return;
    }
    if (!recorder.isRecording) return;

    setState('processing');
    const recording = await recorder.stop();

    try {
      const result = await transcribeRecording({
        uri: recording.uri,
        durationMs: recording.durationMs,
        contextPrompt: buildRecognitionHint(options),
      });
      await handleTranscript(
        result.text,
        result.confidence,
        result.lowConfidence,
        recording.uri,
      );
    } catch (err) {
      handleSpeechError(err);
    }
  }, [handleSpeechError, handleTranscript, options, recorder, settings.speechEngine]);

  const cancelListening = useCallback(async () => {
    nativeRecognition.current?.cancel();
    await recorder.cancel();
    setState('idle');
  }, [recorder]);

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      await processTurn(trimmed, null, null);
    },
    [processTurn],
  );

  const retryLast = useCallback(async () => {
    setError(null);
    if (!lastUserText.current) {
      setState('idle');
      return;
    }
    // Drop the failed turn before retrying so it is not duplicated.
    setEntries((prev) => prev.filter((e) => !e.id.startsWith('pending')));
    await processTurn(lastUserText.current, lastConfidence.current, null);
  }, [processTurn]);

  const replay = useCallback(
    async (text: string) => {
      await speakTutor(text, activeLevel);
    },
    [activeLevel, speakTutor],
  );

  const dismissError = useCallback(() => {
    setError(null);
    setEntries((prev) => prev.filter((e) => !e.id.startsWith('pending')));
    setState('idle');
  }, []);

  /* ---------------------------------------------------------------- *
   * Ending the session
   * ---------------------------------------------------------------- */

  const endSession = useCallback(async (): Promise<string | null> => {
    if (!session || finished.current) return session?.id ?? null;
    finished.current = true;

    await stopSpeaking();
    nativeRecognition.current?.cancel();
    await recorder.cancel();

    const durationSec = Math.max(0, Math.floor((Date.now() - startedAt.current) / 1000));
    const userTurns = turnStats.current;

    // Nothing was said: do not pollute history or progress with an empty session.
    if (userTurns.length === 0) {
      await sessionRepository.discardIfEmpty(session.id);
      return null;
    }

    const heuristic = computeHeuristicScores(userTurns, activeLevel);
    const messages = await sessionRepository.listMessages(session.id);
    const corrections = await sessionRepository.listCorrections(session.id);

    let scores = heuristic;
    let summaryText: string | null = null;
    let longTermNote = '';

    try {
      const { evaluation } = await api.sessionSummary({
        sessionId: session.id,
        level: activeLevel,
        kind: session.kind,
        topic: options.topic ?? session.topicId,
        durationSec,
        messages: messages.map((m) => ({ speaker: m.speaker, text: m.text })).slice(-40),
        corrections: corrections.map((c) => ({
          category: c.category,
          original: c.original,
          corrected: c.corrected,
        })),
        explanationLanguages: explanationLanguagesFor(settings),
        hasPronunciationData: heuristic.pronunciationScore !== null,
      });

      scores = {
        overallScore: evaluation.overallScore,
        grammarScore: evaluation.grammarScore,
        vocabularyScore: evaluation.vocabularyScore,
        fluencyScore: evaluation.fluencyScore,
        pronunciationScore: evaluation.pronunciationScore,
      };
      summaryText = evaluation.summary;
      longTermNote = evaluation.longTermNote;
    } catch {
      // Offline or the tutor is down: the deterministic scores still stand, so
      // the learner always gets a score screen (§28).
      summaryText = 'Sitzung ohne Verbindung ausgewertet. Die Punkte sind eine Schätzung.';
    }

    await sessionRepository.finish(session.id, {
      durationSec,
      overallScore: scores.overallScore,
      grammarScore: scores.grammarScore,
      fluencyScore: scores.fluencyScore,
      vocabularyScore: scores.vocabularyScore,
      pronunciationScore: scores.pronunciationScore,
      summary: summaryText,
    });

    const minutes = Number((durationSec / 60).toFixed(2));
    await progressRepository.recordSession({
      speakingMinutes: minutes,
      messages: messages.length,
      grammarScore: scores.grammarScore,
      vocabularyScore: scores.vocabularyScore,
      fluencyScore: scores.fluencyScore,
      pronunciationScore: scores.pronunciationScore,
      overallScore: scores.overallScore,
      newWords: await vocabularyRepository.countCreatedOn(todayKey()),
      mistakesMade: corrections.length,
    });

    await dailyGoalRepository.ensureToday(settings.dailyGoalMinutes);
    await dailyGoalRepository.addMinutes(minutes);

    if (longTermNote) await memoryRepository.appendNote(longTermNote);

    return session.id;
  }, [activeLevel, options.topic, recorder, session, settings]);

  const phaseProgress = useMemo(() => {
    if (!currentPhase) return 0;
    const span = currentPhase.endSec - currentPhase.startSec;
    if (span <= 0) return 0;
    return Math.min(1, Math.max(0, (elapsedSec - currentPhase.startSec) / span));
  }, [currentPhase, elapsedSec]);

  return {
    state,
    entries,
    session,
    error,
    elapsedSec,
    phaseTitle: currentPhase?.titleDe ?? null,
    phaseProgress,
    level: activeLevel,
    levelChangedTo,
    isBusy: state === 'processing',
    recordingMs: recorder.durationMs,
    startListening,
    stopListening,
    cancelListening,
    sendText,
    retryLast,
    replay,
    dismissError,
    endSession,
  };
}

/**
 * A short German hint for the recogniser: the topic and expected vocabulary.
 * Whisper uses this to bias towards German words instead of English homophones.
 */
function buildRecognitionHint(options: UseConversationOptions): string {
  const parts = ['Deutsches Gespräch.'];
  const roleplay = options.roleplayId ? getRoleplay(options.roleplayId) : undefined;
  const mode = getMode(options.modeId);

  if (roleplay) {
    parts.push(roleplay.titleDe, roleplay.keyPhrases.join(' '));
  } else if (mode) {
    parts.push(mode.titleDe);
    const vocab = mode.targetVocabulary?.[options.level];
    if (vocab?.length) parts.push(vocab.join(' '));
  }
  return parts.join(' ').slice(0, 400);
}
