import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { PLAYBACK_SPEEDS, isValidLevel, type CefrLevel } from '@deutschcoach/shared';
import { api, ApiClientError } from '@/services/api';
import { useSettingsStore } from '@/store/settings';
import { useTheme } from '@/theme';
import {
  Button,
  Card,
  Chip,
  ErrorBanner,
  LoadingState,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import { speak, stopSpeaking } from '@/services/speech/tts';
import { useRecorder } from '@/hooks/useRecorder';
import { SpeechError, transcribeRecording } from '@/services/speech/stt';

/**
 * Listening practice.
 *
 * The tutor speaks a short German passage, the learner answers a question about
 * it aloud. Playback speed is adjustable because comprehension at 0.75x is a
 * legitimate step towards comprehension at 1.0x.
 */
export default function ListeningScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ level?: string }>();
  const settings = useSettingsStore((s) => s.settings);
  const recorder = useRecorder();

  const level: CefrLevel = isValidLevel(params.level) ? params.level : settings.currentLevel;

  const [index, setIndex] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [showText, setShowText] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const items = useQuery({
    queryKey: ['listening', level],
    queryFn: () => api.generateListening({ level, topic: 'Alltag', count: 3 }),
    retry: false,
  });

  const current = items.data?.items[index];

  const playPassage = (): void => {
    if (!current) return;
    void speak({
      text: current.text,
      level,
      speedPreference: speed,
      engine: settings.ttsEngine,
      voice: settings.aiVoice,
    });
  };

  const playQuestion = (): void => {
    if (!current) return;
    void speak({
      text: current.question,
      level,
      speedPreference: speed,
      engine: settings.ttsEngine,
      voice: settings.aiVoice,
    });
  };

  const answerAloud = async (): Promise<void> => {
    setSpeechError(null);
    await stopSpeaking();

    if (recorder.isRecording) {
      setBusy(true);
      const recording = await recorder.stop();
      try {
        const result = await transcribeRecording({
          uri: recording.uri,
          durationMs: recording.durationMs,
          contextPrompt: current?.text,
        });
        setAnswer(result.text);
      } catch (error) {
        setSpeechError(
          error instanceof SpeechError
            ? error.userMessage
            : 'Die Aufnahme konnte nicht verarbeitet werden.',
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    try {
      await recorder.start();
    } catch (error) {
      setSpeechError(
        error instanceof SpeechError ? error.userMessage : 'Die Aufnahme konnte nicht starten.',
      );
    }
  };

  const next = (): void => {
    setIndex((i) => i + 1);
    setShowText(false);
    setAnswer(null);
    setSpeechError(null);
  };

  if (items.isLoading) {
    return (
      <Screen>
        <LoadingState label="Hörtexte werden erstellt..." />
      </Screen>
    );
  }

  if (items.isError) {
    return (
      <Screen>
        <Text variant="display">Hörverstehen</Text>
        <View style={{ marginTop: theme.spacing.xl }}>
          <ErrorBanner
            message={
              items.error instanceof ApiClientError
                ? items.error.userMessage
                : 'Die Hörtexte konnten nicht geladen werden.'
            }
            onRetry={() => void items.refetch()}
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
            🎧
          </Text>
          <Text variant="heading" style={{ textAlign: 'center' }}>
            Hörverstehen abgeschlossen
          </Text>
          <Button label="Noch einmal" onPress={() => { setIndex(0); void items.refetch(); }} />
          <Button label="Zurück" variant="ghost" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text variant="display">Hörverstehen</Text>
      <Text variant="body" tone="muted" style={{ marginTop: 4 }}>
        Niveau {level} · Text {index + 1} von {items.data?.items.length ?? 0}
      </Text>

      <View style={{ marginTop: theme.spacing.md }}>
        <ProgressBar value={index / (items.data?.items.length ?? 1)} height={6} />
      </View>

      <SectionHeader title="Geschwindigkeit" />
      <Row gap={8}>
        {PLAYBACK_SPEEDS.map((value) => (
          <Chip
            key={value}
            label={`${value}x`}
            selected={Math.abs(speed - value) < 0.01}
            onPress={() => setSpeed(value)}
          />
        ))}
      </Row>

      <Card style={{ marginTop: theme.spacing.xl }}>
        <Text variant="label" tone="muted">
          Hörtext
        </Text>
        <Button
          label="Text abspielen"
          icon="▶️"
          size="lg"
          style={{ marginTop: theme.spacing.md }}
          onPress={playPassage}
        />
        <Button
          label={showText ? 'Text verbergen' : 'Text anzeigen'}
          variant="ghost"
          size="sm"
          style={{ marginTop: theme.spacing.sm }}
          onPress={() => setShowText((v) => !v)}
        />
        {showText ? (
          <Text variant="transcript" style={{ marginTop: theme.spacing.md }}>
            {current.text}
          </Text>
        ) : null}
      </Card>

      <Card style={{ marginTop: theme.spacing.lg }}>
        <Text variant="label" tone="muted">
          Frage
        </Text>
        <Text variant="heading" style={{ marginTop: theme.spacing.sm }}>
          {current.question}
        </Text>
        <Button
          label="Frage anhören"
          variant="ghost"
          size="sm"
          style={{ marginTop: theme.spacing.sm }}
          onPress={playQuestion}
        />

        <Button
          label={
            busy
              ? 'Wird erkannt...'
              : recorder.isRecording
                ? 'Aufnahme beenden'
                : 'Antwort sprechen'
          }
          icon={recorder.isRecording ? '⏹' : '🎤'}
          loading={busy}
          style={{ marginTop: theme.spacing.lg }}
          onPress={() => void answerAloud()}
        />

        {speechError ? (
          <View style={{ marginTop: theme.spacing.md }}>
            <ErrorBanner message={speechError} onDismiss={() => setSpeechError(null)} />
          </View>
        ) : null}

        {answer ? (
          <View style={{ marginTop: theme.spacing.lg, gap: 6 }}>
            <Text variant="label" tone="muted">
              Deine Antwort
            </Text>
            <Text variant="transcript">{answer}</Text>
            <Text variant="label" tone="muted" style={{ marginTop: theme.spacing.sm }}>
              Musterantwort
            </Text>
            <Text variant="body" tone="success">
              {current.expectedAnswer}
            </Text>
          </View>
        ) : null}
      </Card>

      <Button
        label={index + 1 >= (items.data?.items.length ?? 0) ? 'Abschließen' : 'Nächster Text'}
        style={{ marginTop: theme.spacing.xl }}
        onPress={next}
      />
      <Button label="Zurück" variant="ghost" onPress={() => router.back()} />
      <View style={{ height: theme.spacing.xl }} />
    </Screen>
  );
}
