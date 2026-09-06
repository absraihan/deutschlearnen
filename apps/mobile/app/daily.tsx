import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  DAILY_CURRICULUM,
  SESSION_DURATIONS,
  buildSchedule,
  dayNumberSince,
  lessonForDay,
  type SessionDuration,
} from '@deutschlearnen/shared';
import { dailyGoalRepository, memoryRepository } from '@/database/repositories';
import { useSettingsStore } from '@/store/settings';
import { useTheme } from '@/theme';
import {
  Button,
  Card,
  Chip,
  Divider,
  LoadingState,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import { formatDuration, todayKey } from '@/lib/util';

/**
 * Daily practice.
 *
 * A repeating seven-day cycle, so there is always a concrete answer to "what
 * should I talk about today" and day seven reviews the week's mistakes.
 */
export default function DailyScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ day?: string }>();
  const settings = useSettingsStore((s) => s.settings);

  const [duration, setDuration] = useState<SessionDuration>(
    (SESSION_DURATIONS.find((d) => d === settings.dailyGoalMinutes) ?? 10) as SessionDuration,
  );

  const data = useQuery({
    queryKey: ['daily', params.day],
    queryFn: async () => {
      const memory = await memoryRepository.get(settings.currentLevel);
      const level = settings.adaptiveDifficulty ? memory.difficultyLevel : settings.currentLevel;
      const dayNumber = params.day
        ? Number(params.day)
        : dayNumberSince(memory.startedOn, todayKey());
      const goal = await dailyGoalRepository.ensureToday(settings.dailyGoalMinutes);
      return { level, dayNumber, goal };
    },
  });

  if (data.isLoading || !data.data) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  const { level, dayNumber, goal } = data.data;
  const lesson = lessonForDay(dayNumber);
  const topic = lesson.topic[level] ?? lesson.titleDe;
  const roleplayId = lesson.roleplayId?.[level] ?? null;
  const schedule = buildSchedule(duration);

  return (
    <Screen scroll>
      <Text variant="display">Tagesübung</Text>
      <Text variant="body" tone="muted" style={{ marginTop: 4 }}>
        Tag {dayNumber} · Niveau {level}
      </Text>

      <Card style={{ marginTop: theme.spacing.lg }}>
        <Row gap={12} style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 34 }}>{lesson.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text variant="heading">{lesson.titleDe}</Text>
            <Text variant="caption" tone="muted">
              Thema: {topic}
            </Text>
          </View>
        </Row>
        <Divider />
        <Text variant="caption" tone="muted">
          Schwerpunkt heute: {lesson.focus}
        </Text>
        {roleplayId ? (
          <Text variant="caption" tone="primary" style={{ marginTop: 4 }}>
            Enthält ein Rollenspiel.
          </Text>
        ) : null}
      </Card>

      <SectionHeader title="Heutiges Ziel" />
      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text variant="bodyStrong">
            {goal.achievedMinutes.toFixed(0)} / {goal.goalMinutes} Minuten
          </Text>
          {goal.completed ? (
            <Text variant="caption" tone="success">
              ✅ geschafft
            </Text>
          ) : null}
        </Row>
        <View style={{ marginTop: theme.spacing.sm }}>
          <ProgressBar
            value={goal.goalMinutes > 0 ? goal.achievedMinutes / goal.goalMinutes : 0}
            tone={goal.completed ? theme.colors.success : theme.colors.primary}
          />
        </View>
      </Card>

      <SectionHeader title="Länge" />
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {SESSION_DURATIONS.map((value) => (
          <Chip
            key={value}
            label={`${value} min`}
            selected={value === duration}
            onPress={() => setDuration(value)}
          />
        ))}
      </Row>

      <SectionHeader title="Ablauf" />
      <Card>
        {schedule.map((phase) => (
          <Row
            key={phase.kind}
            style={{ justifyContent: 'space-between', paddingVertical: 6 }}
          >
            <Text variant="body">{phase.titleDe}</Text>
            <Text variant="caption" tone="subtle">
              {formatDuration(phase.startSec)} – {formatDuration(phase.endSec)}
            </Text>
          </Row>
        ))}
      </Card>

      <Button
        label="Tagesübung starten"
        icon="🎤"
        size="lg"
        style={{ marginTop: theme.spacing.xl }}
        onPress={() =>
          router.push({
            pathname: '/conversation',
            params: {
              modeId: lesson.modeId,
              kind: 'daily',
              level,
              topic,
              duration: String(duration),
              ...(roleplayId ? { roleplayId } : {}),
            },
          })
        }
      />

      <SectionHeader title="Der Wochenplan" />
      <View style={{ gap: theme.spacing.sm }}>
        {DAILY_CURRICULUM.map((entry) => {
          const isToday = entry.day === ((dayNumber - 1) % DAILY_CURRICULUM.length) + 1;
          return (
            <Card
              key={entry.day}
              style={{
                padding: theme.spacing.md,
                borderColor: isToday ? theme.colors.primary : theme.colors.border,
                borderWidth: isToday ? 1.5 : undefined,
              }}
            >
              <Row gap={10} style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 20 }}>{entry.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text variant="body" tone={isToday ? 'primary' : 'default'}>
                    Tag {entry.day}: {entry.titleDe}
                  </Text>
                  <Text variant="caption" tone="subtle">
                    {entry.topic[level] ?? entry.titleDe}
                  </Text>
                </View>
              </Row>
            </Card>
          );
        })}
      </View>

      <Button
        label="Zurück"
        variant="ghost"
        onPress={() => router.back()}
        style={{ marginTop: theme.spacing.xl }}
      />
      <View style={{ height: theme.spacing.xl }} />
    </Screen>
  );
}
