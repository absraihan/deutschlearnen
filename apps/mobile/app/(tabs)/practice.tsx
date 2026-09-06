import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  CEFR_LEVELS,
  SESSION_DURATIONS,
  modesForLevel,
  type CefrLevel,
  type SessionDuration,
} from '@deutschlearnen/shared';
import { useSettingsStore } from '@/store/settings';
import { useTheme } from '@/theme';
import { Card, Chip, Row, Screen, SectionHeader, Text, Button } from '@/components/ui';

/**
 * The practice hub: pick a level, a topic and a length, then speak.
 *
 * The level defaults to the learner's current level but is switchable per
 * session, because sometimes you want an easy day.
 */
export default function PracticeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const settings = useSettingsStore((s) => s.settings);

  const [level, setLevel] = useState<CefrLevel>(settings.currentLevel);
  const [duration, setDuration] = useState<SessionDuration>(
    (SESSION_DURATIONS.find((d) => d === settings.dailyGoalMinutes) ?? 10) as SessionDuration,
  );

  const modes = useMemo(() => modesForLevel(level), [level]);

  const startMode = (modeId: string): void => {
    router.push({
      pathname: '/conversation',
      params: {
        modeId,
        level,
        kind: modeId === 'exam' ? 'exam' : modeId === 'roleplay' ? 'roleplay' : 'conversation',
        duration: String(duration),
      },
    });
  };

  return (
    <Screen scroll>
      <Text variant="display">Üben</Text>
      <Text variant="body" tone="muted" style={{ marginTop: 4 }}>
        Wähle Niveau, Länge und Thema.
      </Text>

      <SectionHeader title="Niveau" />
      <Row style={{ flexWrap: 'wrap' }} gap={8}>
        {CEFR_LEVELS.map((value) => (
          <Chip key={value} label={value} selected={value === level} onPress={() => setLevel(value)} />
        ))}
      </Row>

      <SectionHeader title="Länge" />
      <Row style={{ flexWrap: 'wrap' }} gap={8}>
        {SESSION_DURATIONS.map((value) => (
          <Chip
            key={value}
            label={`${value} min`}
            selected={value === duration}
            onPress={() => setDuration(value)}
          />
        ))}
      </Row>
      <Text variant="caption" tone="subtle" style={{ marginTop: theme.spacing.sm }}>
        Sitzungen ab 10 Minuten haben feste Phasen: Aufwärmen, Gespräch, Rollenspiel,
        Korrektur-Übung und Rückblick.
      </Text>

      <SectionHeader title="Andere Übungen" />
      <Row style={{ flexWrap: 'wrap', rowGap: theme.spacing.md }}>
        <ModeTile emoji="🎧" title="Hörverstehen" subtitle="Zuhören und antworten" onPress={() => router.push({ pathname: '/listening', params: { level } })} />
        <ModeTile emoji="🗣️" title="Nachsprechen" subtitle="Aussprache trainieren" onPress={() => router.push({ pathname: '/shadowing', params: { level } })} />
        <ModeTile emoji="📝" title="Prüfungstraining" subtitle="Im Prüfungsstil" onPress={() => router.push({ pathname: '/exam', params: { level } })} />
        <ModeTile emoji="🎭" title="Rollenspiele" subtitle="Echte Situationen" onPress={() => router.push({ pathname: '/roleplay', params: { level } })} />
      </Row>

      <SectionHeader title={`Gesprächsthemen (${modes.length})`} />
      <View style={{ gap: theme.spacing.md }}>
        {modes.map((mode) => (
          <Card
            key={mode.id}
            onPress={() => startMode(mode.id)}
            accessibilityLabel={`${mode.titleDe} starten`}
          >
            <Row gap={12} style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 26 }}>{mode.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{mode.titleDe}</Text>
                <Text variant="caption" tone="muted">
                  {mode.description}
                </Text>
              </View>
              <Text variant="heading" tone="subtle">
                ›
              </Text>
            </Row>
          </Card>
        ))}
      </View>

      <Button
        label="Zufälliges Thema starten"
        icon="🎲"
        variant="secondary"
        onPress={() => startMode('random')}
        style={{ marginTop: theme.spacing.xl }}
      />
      <View style={{ height: theme.spacing.xl }} />
    </Screen>
  );
}

function ModeTile({
  emoji,
  title,
  subtitle,
  onPress,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={title}
      style={{ width: '47%', gap: 4, paddingVertical: theme.spacing.lg }}
    >
      <Text style={{ fontSize: 24 }}>{emoji}</Text>
      <Text variant="bodyStrong">{title}</Text>
      <Text variant="caption" tone="muted">
        {subtitle}
      </Text>
    </Card>
  );
}
