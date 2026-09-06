import React from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { CATEGORY_LABELS_DE, LEVEL_PROFILES } from '@deutschlearnen/shared';
import {
  memoryRepository,
  mistakeRepository,
  progressRepository,
  sessionRepository,
  vocabularyRepository,
} from '@/database/repositories';
import { useSettingsStore } from '@/store/settings';
import { useTheme } from '@/theme';
import {
  Card,
  Chip,
  EmptyState,
  LoadingState,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  StatTile,
  Text,
} from '@/components/ui';
import { ScoreRing, Sparkline, WeeklyBars } from '@/components/charts';
import { formatDuration, formatMinutes, relativeDayLabel } from '@/lib/util';

/**
 * Progress.
 *
 * Simple on purpose (§26): time spoken, the four scores, a trend line and the
 * recurring mistakes. No funnels, no cohorts.
 */
export default function ProgressScreen() {
  const theme = useTheme();
  const router = useRouter();
  const settings = useSettingsStore((s) => s.settings);

  const query = useQuery({
    queryKey: ['progress-screen'],
    queryFn: async () => {
      const memory = await memoryRepository.get(settings.currentLevel);
      const level = settings.adaptiveDifficulty ? memory.difficultyLevel : settings.currentLevel;
      const [summary, history, sessions, categories, wordCount] = await Promise.all([
        progressRepository.summary({
          currentLevel: level,
          targetLevel: settings.targetLevel,
          dailyGoalMinutes: settings.dailyGoalMinutes,
        }),
        progressRepository.recent(30),
        sessionRepository.list(10),
        mistakeRepository.categoryTotals(),
        vocabularyRepository.count(),
      ]);
      return { summary, history, sessions, categories, wordCount, level, memory };
    },
  });

  useFocusEffect(
    React.useCallback(() => {
      void query.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  if (query.isLoading || !query.data) {
    return (
      <Screen>
        <LoadingState label="Fortschritt wird berechnet..." />
      </Screen>
    );
  }

  const { summary, history, sessions, categories, wordCount, level, memory } = query.data;

  if (summary.totalSessions === 0) {
    return (
      <Screen>
        <Text variant="display">Fortschritt</Text>
        <EmptyState
          emoji="📈"
          title="Noch keine Daten"
          body="Nach deiner ersten Sitzung siehst du hier deine Sprechzeit, deine Punkte und deine häufigsten Fehler."
          actionLabel="Erste Sitzung starten"
          onAction={() => router.push('/practice')}
        />
      </Screen>
    );
  }

  const levelIndexes = ['A1', 'A2', 'B1', 'B2'];
  const levelFraction =
    (levelIndexes.indexOf(level) + memory.difficultyProgress) / (levelIndexes.length - 1);

  return (
    <Screen scroll>
      <Text variant="display">Fortschritt</Text>

      <Card style={{ marginTop: theme.spacing.lg }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text variant="label" tone="muted">
              Aktuelles Niveau
            </Text>
            <Text variant="title">{level}</Text>
            <Text variant="caption" tone="subtle">
              {LEVEL_PROFILES[level].labelDe}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="label" tone="muted">
              Ziel
            </Text>
            <Text variant="title" tone="primary">
              {summary.targetLevel}
            </Text>
          </View>
        </Row>
        <View style={{ marginTop: theme.spacing.lg, gap: 6 }}>
          <ProgressBar value={levelFraction} height={10} />
          <Row style={{ justifyContent: 'space-between' }}>
            {levelIndexes.map((l) => (
              <Text key={l} variant="caption" tone={l === level ? 'primary' : 'subtle'}>
                {l}
              </Text>
            ))}
          </Row>
        </View>
        {settings.adaptiveDifficulty ? (
          <Text variant="caption" tone="subtle" style={{ marginTop: theme.spacing.sm }}>
            Das Niveau passt sich automatisch an deine Leistung an.
          </Text>
        ) : null}
      </Card>

      <SectionHeader title="Gesamt" />
      <Row>
        <StatTile value={formatMinutes(summary.totalSpeakingMinutes)} label="Sprechzeit" />
        <StatTile value={`${summary.totalSessions}`} label="Sitzungen" />
      </Row>
      <Row style={{ marginTop: theme.spacing.md }}>
        <StatTile value={`${summary.streakDays}`} label="Tage in Folge" tone={summary.streakDays > 0 ? 'success' : 'default'} />
        <StatTile value={`${wordCount}`} label="Wörter gespeichert" />
      </Row>

      <SectionHeader title="Durchschnittliche Punkte" />
      <Card>
        <Row style={{ justifyContent: 'space-around', flexWrap: 'wrap', rowGap: theme.spacing.lg }}>
          <ScoreRing score={summary.averageOverallScore} size={82} label="Gesamt" />
          <ScoreRing score={summary.averageGrammarScore} size={82} label="Grammatik" />
          <ScoreRing score={summary.averageVocabularyScore} size={82} label="Wortschatz" />
          <ScoreRing score={summary.averageFluencyScore} size={82} label="Flüssigkeit" />
        </Row>
      </Card>

      <SectionHeader title="Diese Woche" />
      <Card>
        <WeeklyBars data={summary.weekly} goalMinutes={summary.dailyGoalMinutes} />
      </Card>

      <SectionHeader title="Verlauf der Gesamtpunkte" />
      <Card>
        <Sparkline values={history.map((h) => h.overallScore)} />
        <Text variant="caption" tone="subtle" style={{ marginTop: theme.spacing.sm }}>
          Letzte {history.length} aktive Tage
        </Text>
      </Card>

      <SectionHeader
        title="Häufigste Fehler"
        action={categories.length ? 'Üben' : undefined}
        onAction={() => router.push('/mistakes')}
      />
      {categories.length === 0 ? (
        <Card>
          <Text variant="body" tone="success">
            Aktuell keine offenen Fehler. Stark!
          </Text>
        </Card>
      ) : (
        <Card>
          {categories.slice(0, 6).map((entry) => {
            const max = categories[0]?.count ?? 1;
            return (
              <View key={entry.category} style={{ marginBottom: theme.spacing.md }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="label">{CATEGORY_LABELS_DE[entry.category]}</Text>
                  <Text variant="caption" tone="muted">
                    {entry.count}x
                  </Text>
                </Row>
                <View style={{ marginTop: 4 }}>
                  <ProgressBar value={entry.count / max} tone={theme.colors.warning} height={6} />
                </View>
              </View>
            );
          })}
        </Card>
      )}

      <SectionHeader title="Letzte Sitzungen" />
      <View style={{ gap: theme.spacing.md }}>
        {sessions.map((session) => (
          <Card
            key={session.id}
            onPress={() => router.push({ pathname: '/summary', params: { sessionId: session.id } })}
            accessibilityLabel={`Auswertung vom ${relativeDayLabel(session.startedAt.slice(0, 10))}`}
          >
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{session.topicId}</Text>
                <Text variant="caption" tone="muted">
                  {relativeDayLabel(session.startedAt.slice(0, 10))} ·{' '}
                  {formatDuration(session.durationSec)} · {session.messageCount} Nachrichten
                </Text>
              </View>
              <Row gap={8} style={{ alignItems: 'center' }}>
                <Chip label={session.level} />
                <ScoreRing score={session.overallScore} size={54} />
              </Row>
            </Row>
          </Card>
        ))}
      </View>
      <View style={{ height: theme.spacing.xl }} />
    </Screen>
  );
}
