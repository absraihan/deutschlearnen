import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CEFR_LEVELS, isValidLevel, roleplaysForLevel, type CefrLevel } from '@deutschcoach/shared';
import { useSettingsStore } from '@/store/settings';
import { useTheme } from '@/theme';
import { Button, Card, Chip, EmptyState, Row, Screen, SectionHeader, Text } from '@/components/ui';

/**
 * Roleplay picker.
 *
 * Each scenario states who the tutor plays, what the learner has to achieve and
 * whether it is du or Sie, so the learner knows what they are walking into.
 */
export default function RoleplayScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ level?: string }>();
  const settings = useSettingsStore((s) => s.settings);

  const [level, setLevel] = useState<CefrLevel>(
    isValidLevel(params.level) ? params.level : settings.currentLevel,
  );

  const scenarios = roleplaysForLevel(level);

  return (
    <Screen scroll>
      <Text variant="display">Rollenspiele</Text>
      <Text variant="body" tone="muted" style={{ marginTop: 4 }}>
        Echte Situationen. Der Tutor bleibt in seiner Rolle, bis du um Hilfe bittest.
      </Text>

      <SectionHeader title="Niveau" />
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {CEFR_LEVELS.map((value) => (
          <Chip key={value} label={value} selected={value === level} onPress={() => setLevel(value)} />
        ))}
      </Row>

      <SectionHeader title={`${scenarios.length} Szenarien`} />
      {scenarios.length === 0 ? (
        <EmptyState
          emoji="🎭"
          title="Keine Szenarien für dieses Niveau"
          body="Wähle ein anderes Niveau oder starte ein freies Gespräch."
          actionLabel="Freies Gespräch"
          onAction={() =>
            router.push({ pathname: '/conversation', params: { modeId: 'free', level } })
          }
        />
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          {scenarios.map((scenario) => (
            <Card key={scenario.id}>
              <Row gap={12} style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 28 }}>{scenario.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{scenario.titleDe}</Text>
                  <Text variant="caption" tone="muted">
                    {scenario.setting}
                  </Text>
                </View>
              </Row>

              <View style={{ marginTop: theme.spacing.md, gap: 4 }}>
                <Text variant="caption" tone="muted">
                  <Text variant="caption" tone="primary">
                    Tutor:{' '}
                  </Text>
                  {scenario.aiRole}
                </Text>
                <Text variant="caption" tone="muted">
                  <Text variant="caption" tone="primary">
                    Du:{' '}
                  </Text>
                  {scenario.userRole}
                </Text>
                <Text variant="caption" tone="muted">
                  <Text variant="caption" tone="primary">
                    Ziel:{' '}
                  </Text>
                  {scenario.goal}
                </Text>
              </View>

              <Row gap={6} style={{ marginTop: theme.spacing.md, flexWrap: 'wrap' }}>
                <Chip label={scenario.usesFormalSie ? 'Sie (formell)' : 'du (informell)'} />
                <Chip label={scenario.level} />
              </Row>

              <Button
                label="Rollenspiel starten"
                style={{ marginTop: theme.spacing.md }}
                onPress={() =>
                  router.push({
                    pathname: '/conversation',
                    params: {
                      modeId: 'roleplay',
                      kind: 'roleplay',
                      roleplayId: scenario.id,
                      level: scenario.level,
                      topic: scenario.titleDe,
                    },
                  })
                }
              />
            </Card>
          ))}
        </View>
      )}

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
