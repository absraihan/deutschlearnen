import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CEFR_LEVELS,
  examTasksForLevel,
  isValidLevel,
  type CefrLevel,
} from '@deutschlearnen/shared';
import { useSettingsStore } from '@/store/settings';
import { useTheme } from '@/theme';
import { Button, Card, Chip, Row, Screen, SectionHeader, Text } from '@/components/ui';
import { formatDuration } from '@/lib/util';

/**
 * Exam-style speaking practice.
 *
 * The disclaimer at the top is not decoration: this is practice in the style of
 * the exams, and the app must never imply it is an official Goethe, telc or ÖSD
 * test (§24).
 */
export default function ExamScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ level?: string }>();
  const settings = useSettingsStore((s) => s.settings);

  const [level, setLevel] = useState<CefrLevel>(
    isValidLevel(params.level) ? params.level : settings.currentLevel,
  );

  const tasks = examTasksForLevel(level);

  return (
    <Screen scroll>
      <Text variant="display">Prüfungstraining</Text>

      <Card style={{ marginTop: theme.spacing.lg, backgroundColor: theme.colors.warningSoft }}>
        <Text variant="caption" tone="warning">
          Übung im Prüfungsstil. Das ist keine offizielle Goethe-, telc- oder ÖSD-Prüfung und
          ersetzt keine echte Prüfung.
        </Text>
      </Card>

      <SectionHeader title="Niveau" />
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {CEFR_LEVELS.map((value) => (
          <Chip key={value} label={value} selected={value === level} onPress={() => setLevel(value)} />
        ))}
      </Row>

      <SectionHeader title={`Aufgaben (${tasks.length})`} />
      <View style={{ gap: theme.spacing.md }}>
        {tasks.map((task) => (
          <Card key={task.id}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Chip label={`Teil ${task.part}`} />
              <Text variant="caption" tone="subtle">
                ca. {formatDuration(task.suggestedSec)}
              </Text>
            </Row>
            <Text variant="bodyStrong" style={{ marginTop: theme.spacing.sm }}>
              {task.titleDe}
            </Text>
            <Text variant="body" tone="muted" style={{ marginTop: 4 }}>
              {task.prompt}
            </Text>
            <Button
              label="Aufgabe starten"
              style={{ marginTop: theme.spacing.md }}
              onPress={() =>
                router.push({
                  pathname: '/conversation',
                  params: {
                    modeId: 'exam',
                    kind: 'exam',
                    level,
                    topic: `${task.titleDe}. ${task.instruction}`,
                  },
                })
              }
            />
          </Card>
        ))}
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
