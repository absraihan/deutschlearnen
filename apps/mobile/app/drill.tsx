import React, { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  normalizeForComparison,
  type Exercise,
  type PracticeExercise,
} from '@deutschlearnen/shared';
import { exerciseRepository, mistakeRepository } from '@/database/repositories';
import { api, ApiClientError } from '@/services/api';
import { useSettingsStore } from '@/store/settings';
import { useTheme } from '@/theme';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  ProgressBar,
  Row,
  Screen,
  Text,
} from '@/components/ui';
import { speak } from '@/services/speech/tts';

/**
 * Targeted drills.
 *
 * Built from the learner's own recurring mistakes, not from a generic exercise
 * bank: getting the same sentence right four times in a row is what marks a
 * mistake as mastered.
 */
export default function DrillScreen() {
  const theme = useTheme();
  const router = useRouter();
  const settings = useSettingsStore((s) => s.settings);

  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);

  const drills = useQuery({
    queryKey: ['drills'],
    queryFn: async () => {
      const mistakes = await mistakeRepository.listActive(5);
      if (mistakes.length === 0) {
        return { intro: '', exercises: [] as Exercise[], saved: [] as PracticeExercise[], mistakes };
      }

      // Reuse drills that were generated but never finished: they already cost
      // an API call, and resuming is instant and free.
      const pending = await exerciseRepository.listPending(5);
      if (pending.length >= 3) {
        return {
          intro: 'Weiter mit den Übungen von vorhin.',
          exercises: pending.map(toExercise),
          saved: pending,
          mistakes,
        };
      }

      const result = await api.generateExercises({
        level: settings.currentLevel,
        count: Math.min(5, Math.max(3, mistakes.length)),
        mistakes: mistakes.map((m) => ({
          category: m.category,
          wrongText: m.wrongText,
          correctText: m.correctText,
          explanation: m.explanation,
        })),
        includeBangla: settings.banglaExplanations,
      });

      // Persist, pairing each drill with the mistake it targets, so a result
      // can be attributed even if the screen is closed and reopened.
      const saved = await exerciseRepository.saveMany(
        result.exercises,
        result.exercises.map((_, i) => mistakes[i % mistakes.length]?.id ?? null),
      );
      void exerciseRepository.pruneStale();

      return { ...result, saved, mistakes };
    },
    retry: false,
  });

  const exercises = drills.data?.exercises ?? [];
  const current = exercises[index];

  const isCorrect = useMemo(() => {
    if (!current) return false;
    return normalizeForComparison(answer) === normalizeForComparison(current.answer);
  }, [answer, current]);

  const check = (): void => {
    setRevealed(true);
    if (isCorrect) setCorrectCount((n) => n + 1);

    const saved = drills.data?.saved[index];
    if (saved) void exerciseRepository.complete(saved.id, isCorrect);

    // Feed the result back into mistake mastery. The drill row records which
    // mistake it targeted, so attribution survives a reopened screen.
    const mistakeId =
      saved?.mistakeId ??
      drills.data?.mistakes[index % (drills.data?.mistakes.length || 1)]?.id;
    if (mistakeId) {
      void (isCorrect
        ? mistakeRepository.recordSuccess(mistakeId)
        : mistakeRepository.recordFailure(mistakeId));
    }
  };

  const next = (): void => {
    setRevealed(false);
    setAnswer('');
    setIndex((i) => i + 1);
  };

  if (drills.isLoading) {
    return (
      <Screen>
        <LoadingState label="Übungen werden vorbereitet..." />
      </Screen>
    );
  }

  if (drills.isError) {
    return (
      <Screen>
        <Text variant="display">Fehler üben</Text>
        <View style={{ marginTop: theme.spacing.xl }}>
          <ErrorBanner
            message={
              drills.error instanceof ApiClientError
                ? drills.error.userMessage
                : 'Die Übungen konnten nicht geladen werden.'
            }
            onRetry={() => void drills.refetch()}
            onDismiss={() => router.back()}
          />
        </View>
      </Screen>
    );
  }

  if (exercises.length === 0) {
    return (
      <Screen>
        <EmptyState
          emoji="✨"
          title="Nichts zu üben"
          body="Du hast gerade keine offenen Fehler. Sprich eine Runde – neue Übungen entstehen automatisch."
          actionLabel="Sprechen starten"
          onAction={() => router.replace('/practice')}
        />
      </Screen>
    );
  }

  if (!current) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            emoji={correctCount === exercises.length ? '🎉' : '👍'}
            title={`${correctCount} von ${exercises.length} richtig`}
            body={
              correctCount === exercises.length
                ? 'Alles richtig! Diese Fehler sitzen langsam.'
                : 'Gut gemacht. Wiederhole die Übungen später noch einmal.'
            }
            actionLabel="Fertig"
            onAction={() => router.replace('/mistakes')}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text variant="display">Fehler üben</Text>
      <Text variant="body" tone="muted" style={{ marginTop: 4 }}>
        {drills.data?.intro || 'Kurze Übungen zu deinen häufigsten Fehlern.'}
      </Text>

      <View style={{ marginTop: theme.spacing.lg, gap: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="caption" tone="muted">
            Übung {index + 1} von {exercises.length}
          </Text>
          <Text variant="caption" tone="success">
            {correctCount} richtig
          </Text>
        </Row>
        <ProgressBar value={index / exercises.length} height={6} />
      </View>

      <Card style={{ marginTop: theme.spacing.xl }}>
        <Text variant="caption" tone="muted">
          {exerciseTypeLabel(current.type)}
        </Text>
        <Text variant="heading" style={{ marginTop: theme.spacing.sm }}>
          {current.prompt}
        </Text>
        {current.hint && !revealed ? (
          <Text variant="caption" tone="subtle" style={{ marginTop: theme.spacing.sm }}>
            Tipp: {current.hint}
          </Text>
        ) : null}

        <TextInput
          value={answer}
          onChangeText={setAnswer}
          editable={!revealed}
          placeholder="Deine Antwort auf Deutsch"
          placeholderTextColor={theme.colors.textSubtle}
          multiline
          accessibilityLabel="Deine Antwort"
          style={{
            marginTop: theme.spacing.lg,
            minHeight: 56,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: revealed
              ? isCorrect
                ? theme.colors.success
                : theme.colors.warning
              : theme.colors.border,
            backgroundColor: theme.colors.background,
            color: theme.colors.text,
            padding: theme.spacing.md,
            fontSize: 17,
          }}
        />

        {revealed ? (
          <View style={{ marginTop: theme.spacing.lg, gap: 6 }}>
            <Text variant="bodyStrong" tone={isCorrect ? 'success' : 'warning'}>
              {isCorrect ? '✅ Richtig!' : '👉 Richtige Antwort:'}
            </Text>
            {!isCorrect ? <Text variant="body">{current.answer}</Text> : null}
            {current.explanation ? (
              <Text variant="caption" tone="muted">
                {current.explanation}
              </Text>
            ) : null}
            <Button
              label="Antwort anhören"
              variant="ghost"
              size="sm"
              onPress={() =>
                void speak({
                  text: current.answer,
                  level: current.level,
                  speedPreference: settings.voiceSpeed,
                  engine: settings.ttsEngine,
                  voice: settings.aiVoice,
                })
              }
            />
          </View>
        ) : null}
      </Card>

      <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.md }}>
        {revealed ? (
          <Button
            label={index + 1 >= exercises.length ? 'Auswertung' : 'Nächste Übung'}
            onPress={next}
          />
        ) : (
          <Button label="Prüfen" onPress={check} disabled={!answer.trim()} />
        )}
        <Button label="Abbrechen" variant="ghost" onPress={() => router.back()} />
      </View>
      <View style={{ height: theme.spacing.xl }} />
    </Screen>
  );
}

/** A stored drill rendered back into the shape the screen works with. */
function toExercise(record: PracticeExercise): Exercise {
  return {
    type: record.type,
    prompt: record.prompt,
    answer: record.answer,
    hint: record.hint,
    explanation: record.explanation,
    level: record.level,
  };
}

function exerciseTypeLabel(type: Exercise['type']): string {
  return {
    'fill-blank': 'Lücke füllen',
    reorder: 'Wörter ordnen',
    transform: 'Satz korrigieren',
    speak: 'Laut sprechen',
  }[type];
}
