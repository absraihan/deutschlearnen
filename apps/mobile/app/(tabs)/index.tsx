import React from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  LEVEL_PROFILES,
  dayNumberSince,
  lessonForDay,
  type ProgressSummary,
} from '@deutschlearnen/shared';
import {
  memoryRepository,
  mistakeRepository,
  progressRepository,
  vocabularyRepository,
} from '@/database/repositories';
import { useSettingsStore } from '@/store/settings';
import { useTheme } from '@/theme';
import {
  Button,
  Card,
  Chip,
  LevelBadge,
  LoadingState,
  Row,
  Screen,
  SectionHeader,
  StatTile,
  Text,
  ProgressBar,
} from '@/components/ui';
import { WeeklyBars } from '@/components/charts';
import { formatMinutes, todayKey } from '@/lib/util';

/**
 * The dashboard.
 *
 * One job above all: get the learner speaking within one tap. Everything else
 * on this screen is a reason to come back tomorrow.
 */
export default function DashboardScreen() {
  const theme = useTheme();
  const router = useRouter();
  const settings = useSettingsStore((s) => s.settings);

  const dashboard = useQuery({
    queryKey: ['dashboard', settings.currentLevel, settings.dailyGoalMinutes],
    queryFn: async () => {
      const memory = await memoryRepository.get(settings.currentLevel);
      const level = settings.adaptiveDifficulty ? memory.difficultyLevel : settings.currentLevel;
      const summary = await progressRepository.summary({
        currentLevel: level,
        targetLevel: settings.targetLevel,
        dailyGoalMinutes: settings.dailyGoalMinutes,
      });
      const activeMistakes = await mistakeRepository.countActive();
      const dueWords = await vocabularyRepository.listDue(1);
      return {
        summary,
        level,
        activeMistakes,
        hasDueWords: dueWords.length > 0,
        dayNumber: dayNumberSince(memory.startedOn, todayKey()),
      };
    },
  });

  // Refresh whenever the learner returns from a session.
  useFocusEffect(
    React.useCallback(() => {
      void dashboard.refetch();
      // Refetching on focus is the point; the query object identity is stable.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  if (dashboard.isLoading || !dashboard.data) {
    return (
      <Screen>
        <LoadingState label="Fortschritt wird geladen..." />
      </Screen>
    );
  }

  const { summary, level, activeMistakes, dayNumber } = dashboard.data;
  const lesson = lessonForDay(dayNumber);
  const goalFraction =
    summary.dailyGoalMinutes > 0 ? summary.todayMinutes / summary.dailyGoalMinutes : 0;

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.xs, marginBottom: theme.spacing.lg }}>
        <Text variant="caption" tone="muted">
          {settings.appName}
        </Text>
        <Text variant="display">{greeting()}</Text>
        <Row gap={8} style={{ marginTop: theme.spacing.xs, alignItems: 'center' }}>
          <LevelBadge level={level} topic={LEVEL_PROFILES[level].labelDe.split(' - ')[1]} />
          {summary.streakDays > 0 ? (
            <Chip label={`🔥 ${summary.streakDays} Tage`} tone="warning" selected />
          ) : null}
        </Row>
      </View>

      <Card>
        <Text variant="label" tone="muted">
          Heutiges Ziel
        </Text>
        <Row style={{ alignItems: 'baseline', marginTop: 4 }} gap={6}>
          <Text variant="title">{formatMinutes(summary.todayMinutes)}</Text>
          <Text variant="body" tone="subtle">
            von {summary.dailyGoalMinutes} min
          </Text>
        </Row>
        <View style={{ marginTop: theme.spacing.md }}>
          <ProgressBar
            value={goalFraction}
            tone={goalFraction >= 1 ? theme.colors.success : theme.colors.primary}
            height={10}
          />
        </View>
        <Button
          label={goalFraction >= 1 ? 'Weiter sprechen' : 'Sprechen starten'}
          icon="🎤"
          size="lg"
          onPress={() => router.push('/practice')}
          style={{ marginTop: theme.spacing.lg }}
          accessibilityHint="Öffnet die Themenauswahl für ein Sprechtraining"
        />
      </Card>

      <SectionHeader title="Deine Zahlen" />
      <Row>
        <StatTile
          value={formatMinutes(summary.totalSpeakingMinutes)}
          label="Sprechzeit"
          hint={`${summary.totalSessions} Sitzungen`}
        />
        <StatTile
          value={`${summary.wordsLearned}`}
          label="Wörter"
          hint="gelernt"
          onPress={() => router.push('/vocabulary')}
        />
      </Row>
      <Row style={{ marginTop: theme.spacing.md }}>
        <StatTile
          value={`${activeMistakes}`}
          label="Offene Fehler"
          hint={activeMistakes > 0 ? 'zum Üben' : 'alles sauber'}
          tone={activeMistakes > 0 ? 'warning' : 'success'}
          onPress={() => router.push('/mistakes')}
        />
        <StatTile
          value={summary.averageOverallScore === null ? '–' : `${Math.round(summary.averageOverallScore)}`}
          label="Durchschnitt"
          hint="Gesamtpunkte"
          onPress={() => router.push('/progress')}
        />
      </Row>

      <SectionHeader title="Diese Woche" action="Details" onAction={() => router.push('/progress')} />
      <Card>
        <WeeklyBars data={summary.weekly} goalMinutes={summary.dailyGoalMinutes} />
        <Text variant="caption" tone="subtle" style={{ marginTop: theme.spacing.sm }}>
          {weeklySummaryLine(summary)}
        </Text>
      </Card>

      <SectionHeader title="Heute empfohlen" />
      <Card onPress={() => router.push({ pathname: '/daily', params: { day: String(dayNumber) } })}>
        <Row gap={12} style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 30 }}>{lesson.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">
              Tag {dayNumber}: {lesson.titleDe}
            </Text>
            <Text variant="caption" tone="muted">
              {lesson.topic[level] ?? lesson.titleDe} · Schwerpunkt: {lesson.focus}
            </Text>
          </View>
          <Text variant="heading" tone="subtle">
            ›
          </Text>
        </Row>
      </Card>

      <SectionHeader title="Schnellstart" />
      <Row style={{ flexWrap: 'wrap', rowGap: theme.spacing.md }}>
        <QuickAction emoji="💬" label="Freies Gespräch" onPress={() => router.push({ pathname: '/conversation', params: { modeId: 'free', kind: 'conversation' } })} />
        <QuickAction emoji="🎭" label="Rollenspiel" onPress={() => router.push('/roleplay')} />
        <QuickAction emoji="⌨️" label="Text-Chat" onPress={() => router.push({ pathname: '/conversation', params: { modeId: 'free', kind: 'text', input: 'text' } })} />
        <QuickAction emoji="🔁" label="Fehler üben" onPress={() => router.push('/mistakes')} />
      </Row>
      <View style={{ height: theme.spacing.xl }} />
    </Screen>
  );
}

function QuickAction({
  emoji,
  label,
  onPress,
}: {
  emoji: string;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={label}
      style={{ width: '47%', paddingVertical: theme.spacing.lg, alignItems: 'center', gap: 6 }}
    >
      <Text style={{ fontSize: 26 }}>{emoji}</Text>
      <Text variant="label" style={{ textAlign: 'center' }}>
        {label}
      </Text>
    </Card>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 11) return 'Guten Morgen!';
  if (hour < 18) return 'Guten Tag!';
  return 'Guten Abend!';
}

function weeklySummaryLine(summary: ProgressSummary): string {
  const active = summary.weekly.filter((d) => d.speakingMinutes > 0).length;
  const total = summary.weekly.reduce((sum, d) => sum + d.speakingMinutes, 0);
  if (active === 0) return 'Diese Woche noch nicht gesprochen. Fang mit fünf Minuten an.';
  return `${active} von 7 Tagen aktiv · ${formatMinutes(total)} gesamt`;
}
