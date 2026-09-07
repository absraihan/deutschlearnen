import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  isValidLevel,
  normalizeForComparison,
  type CefrLevel,
  type PronunciationAnalysis,
} from '@deutschlearnen/shared';
import { api, ApiClientError } from '@/services/api';
import { useSettingsStore } from '@/store/settings';
import { useTheme } from '@/theme';
import {
  Button,
  Card,
  Divider,
  ErrorBanner,
  LoadingState,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import { speak } from '@/services/speech/tts';
import { useSpeechCapture } from '@/hooks/useSpeechCapture';

/**
 * Shadowing.
 *
 * The tutor says a sentence, the learner repeats it, and the two transcripts
 * are diffed word by word. The pronunciation feedback is explicitly labelled as
 * an estimate: no speech API here can measure phonemes, and pretending
 * otherwise would teach the wrong thing (§20).
 */
export default function ShadowingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ level?: string }>();
  const settings = useSettingsStore((s) => s.settings);
  const speech = useSpeechCapture();

  const level: CefrLevel = isValidLevel(params.level) ? params.level : settings.currentLevel;

  const [index, setIndex] = useState(0);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<PronunciationAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = useQuery({
    queryKey: ['shadowing', level],
    queryFn: () => api.generateShadowing({ level, topic: 'Alltag', count: 5 }),
    retry: false,
  });

  const current = set.data?.sentences[index];

  const play = (): void => {
    if (!current) return;
    void speak({
      text: current.text,
      level,
      speedPreference: settings.voiceSpeed,
      engine: settings.ttsEngine,
      voice: settings.aiVoice,
    });
  };

  const record = async (): Promise<void> => {
    setError(null);

    // Capture through the shared hook so this screen honours the learner's
    // speech-engine setting instead of always calling server transcription.
    const result = await speech.toggle(current?.text);
    if (!result) return;

    setTranscript(result.text);

    try {
      const evaluation = await api.evaluatePronunciation({
        transcript: result.text,
        targetText: current?.text ?? null,
        level,
        sttConfidence: result.confidence,
        hasAudioScoring: false,
      });
      setFeedback(evaluation.pronunciation);
    } catch (err) {
      // The transcript is already on screen and useful on its own, so a failed
      // pronunciation call degrades rather than discarding what was captured.
      setError(
        err instanceof ApiClientError
          ? err.userMessage
          : 'Die Aussprache-Auswertung hat nicht funktioniert.',
      );
    }
  };

  const next = (): void => {
    setIndex((i) => i + 1);
    setTranscript(null);
    setFeedback(null);
    setError(null);
  };

  if (set.isLoading) {
    return (
      <Screen>
        <LoadingState label="Sätze werden vorbereitet..." />
      </Screen>
    );
  }

  if (set.isError) {
    return (
      <Screen>
        <Text variant="display">Nachsprechen</Text>
        <View style={{ marginTop: theme.spacing.xl }}>
          <ErrorBanner
            message={
              set.error instanceof ApiClientError
                ? set.error.userMessage
                : 'Die Sätze konnten nicht geladen werden.'
            }
            onRetry={() => void set.refetch()}
            onDismiss={() => router.back()}
          />
        </View>
      </Screen>
    );
  }

  if (!current) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.lg }}>
          <Text variant="display" style={{ textAlign: 'center' }}>
            🗣️
          </Text>
          <Text variant="heading" style={{ textAlign: 'center' }}>
            Nachsprechen abgeschlossen
          </Text>
          <Button label="Neue Sätze" onPress={() => { setIndex(0); void set.refetch(); }} />
          <Button label="Zurück" variant="ghost" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const diff = transcript ? diffWords(current.text, transcript) : null;

  return (
    <Screen scroll>
      <Text variant="display">Nachsprechen</Text>
      <Text variant="body" tone="muted" style={{ marginTop: 4 }}>
        Satz {index + 1} von {set.data?.sentences.length ?? 0} · Niveau {level}
      </Text>
      <View style={{ marginTop: theme.spacing.md }}>
        <ProgressBar value={index / (set.data?.sentences.length ?? 1)} height={6} />
      </View>

      <Card style={{ marginTop: theme.spacing.xl }}>
        <Text variant="label" tone="muted">
          Hör zu und sprich nach
        </Text>
        <Text variant="transcript" style={{ marginTop: theme.spacing.sm }}>
          {current.text}
        </Text>
        {current.focus ? (
          <Text variant="caption" tone="primary" style={{ marginTop: theme.spacing.sm }}>
            Fokus: {current.focus}
          </Text>
        ) : null}

        <Button label="Anhören" icon="🔊" style={{ marginTop: theme.spacing.lg }} onPress={play} />
        <Button
          label={speech.isProcessing ? 'Wird ausgewertet...' : speech.isRecording ? 'Aufnahme beenden' : 'Nachsprechen'}
          icon={speech.isRecording ? '⏹' : '🎤'}
          variant="secondary"
          loading={speech.isProcessing}
          style={{ marginTop: theme.spacing.sm }}
          onPress={() => void record()}
        />
      </Card>

      {error || speech.error ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          <ErrorBanner
            message={error ?? speech.error ?? ''}
            onDismiss={() => { setError(null); speech.clearError(); }}
          />
        </View>
      ) : null}

      {diff ? (
        <Card style={{ marginTop: theme.spacing.lg }}>
          <Text variant="label" tone="muted">
            Vergleich
          </Text>
          <Text variant="caption" tone="subtle" style={{ marginTop: theme.spacing.sm }}>
            Original
          </Text>
          <Text variant="body">{current.text}</Text>

          <Text variant="caption" tone="subtle" style={{ marginTop: theme.spacing.md }}>
            Erkannt
          </Text>
          <Text variant="body">
            {diff.words.map((word, i) => (
              <Text
                key={`${word.text}-${i}`}
                variant="body"
                tone={word.matched ? 'success' : 'warning'}
              >
                {word.text}{' '}
              </Text>
            ))}
          </Text>

          <Divider />
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="label">Übereinstimmung</Text>
            <Text variant="label" tone={diff.ratio > 0.8 ? 'success' : 'warning'}>
              {Math.round(diff.ratio * 100)}%
            </Text>
          </Row>
          <View style={{ marginTop: 6 }}>
            <ProgressBar
              value={diff.ratio}
              tone={diff.ratio > 0.8 ? theme.colors.success : theme.colors.warning}
            />
          </View>
        </Card>
      ) : null}

      {feedback ? (
        <Card style={{ marginTop: theme.spacing.lg }}>
          <Text variant="label" tone="muted">
            Aussprache-Hinweise
          </Text>
          <Text variant="caption" tone="subtle" style={{ marginTop: 4 }}>
            {feedback.confidenceNote}
          </Text>

          {feedback.difficultSounds.length === 0 ? (
            <Text variant="body" tone="success" style={{ marginTop: theme.spacing.md }}>
              Keine auffälligen Laute erkannt.
            </Text>
          ) : (
            feedback.difficultSounds.map((sound) => (
              <View key={`${sound.sound}-${sound.word}`} style={{ marginTop: theme.spacing.md }}>
                <Text variant="bodyStrong">
                  „{sound.sound}“{sound.word ? ` in „${sound.word}“` : ''}
                </Text>
                <Text variant="caption" tone="muted">
                  {sound.advice}
                </Text>
              </View>
            ))
          )}

          {feedback.rhythmAdvice ? (
            <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.md }}>
              Rhythmus: {feedback.rhythmAdvice}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Button
        label={index + 1 >= (set.data?.sentences.length ?? 0) ? 'Abschließen' : 'Nächster Satz'}
        style={{ marginTop: theme.spacing.xl }}
        onPress={next}
      />
      <Button label="Zurück" variant="ghost" onPress={() => router.back()} />
      <View style={{ height: theme.spacing.xl }} />
    </Screen>
  );
}

/**
 * Word-level comparison between the target sentence and what was recognised.
 * Case and punctuation are ignored: the learner is practising sounds, and the
 * recogniser adds its own punctuation.
 */
function diffWords(
  target: string,
  spoken: string,
): { words: Array<{ text: string; matched: boolean }>; ratio: number } {
  const targetWords = normalizeForComparison(target).split(' ').filter(Boolean);
  const spokenRaw = spoken.split(/\s+/).filter(Boolean);
  const spokenNorm = normalizeForComparison(spoken).split(' ').filter(Boolean);

  const remaining = [...targetWords];
  const words = spokenRaw.map((raw, i) => {
    const normalized = spokenNorm[i] ?? '';
    const found = remaining.indexOf(normalized);
    if (found !== -1) {
      remaining.splice(found, 1);
      return { text: raw, matched: true };
    }
    return { text: raw, matched: false };
  });

  const matched = words.filter((w) => w.matched).length;
  const ratio = targetWords.length === 0 ? 0 : matched / targetWords.length;
  return { words, ratio: Math.min(1, ratio) };
}
