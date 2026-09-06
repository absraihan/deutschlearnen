import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CATEGORY_LABELS_DE, MASTERY_STREAK } from '@deutschlearnen/shared';
import { mistakeRepository } from '@/database/repositories';
import { useTheme } from '@/theme';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  LoadingState,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import { relativeDayLabel } from '@/lib/util';

/**
 * The mistake list.
 *
 * Ordered by how often each mistake has come back, because that is what the
 * learner should spend their next five minutes on.
 */
export default function MistakesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  const mistakes = useQuery({
    queryKey: ['mistakes'],
    queryFn: () => mistakeRepository.listAll(),
  });

  const setMastered = useMutation({
    mutationFn: ({ id, mastered }: { id: string; mastered: boolean }) =>
      mistakeRepository.setMastered(id, mastered),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mistakes'] }),
  });

  if (mistakes.isLoading) {
    return (
      <Screen>
        <LoadingState label="Fehler werden geladen..." />
      </Screen>
    );
  }

  const active = mistakes.data?.filter((m) => !m.mastered) ?? [];
  const mastered = mistakes.data?.filter((m) => m.mastered) ?? [];

  return (
    <Screen scroll>
      <Text variant="display">Deine Fehler</Text>
      <Text variant="body" tone="muted" style={{ marginTop: 4 }}>
        Der Tutor merkt sie sich und greift sie im Gespräch wieder auf.
      </Text>

      {active.length === 0 ? (
        <EmptyState
          emoji="✨"
          title="Keine offenen Fehler"
          body={
            mastered.length > 0
              ? 'Alles gemeistert. Sprich weiter – neue Fehler landen automatisch hier.'
              : 'Sprich eine Runde mit deinem Tutor. Wichtige Fehler sammeln sich hier von selbst.'
          }
          actionLabel="Sprechen starten"
          onAction={() => router.push('/practice')}
        />
      ) : (
        <>
          <Button
            label={`${Math.min(active.length, 5)} Fehler jetzt üben`}
            icon="🔁"
            size="lg"
            style={{ marginTop: theme.spacing.lg }}
            onPress={() => router.push('/drill')}
          />

          <SectionHeader title={`Offen (${active.length})`} />
          <View style={{ gap: theme.spacing.md }}>
            {active.map((mistake) => (
              <Card key={mistake.id}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Chip label={CATEGORY_LABELS_DE[mistake.category]} tone="warning" />
                  <Text variant="caption" tone="danger">
                    {mistake.count}x
                  </Text>
                </Row>

                <Text
                  variant="body"
                  tone="muted"
                  style={{ textDecorationLine: 'line-through', marginTop: theme.spacing.sm }}
                >
                  {mistake.wrongText}
                </Text>
                <Text variant="bodyStrong" style={{ marginTop: 2 }}>
                  ✅ {mistake.correctText}
                </Text>
                {mistake.explanation ? (
                  <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
                    {mistake.explanation}
                  </Text>
                ) : null}

                <View style={{ marginTop: theme.spacing.md, gap: 4 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text variant="caption" tone="subtle">
                      Richtig in Folge: {mistake.correctStreak}/{MASTERY_STREAK}
                    </Text>
                    <Text variant="caption" tone="subtle">
                      zuletzt {relativeDayLabel(mistake.lastSeen.slice(0, 10))}
                    </Text>
                  </Row>
                  <ProgressBar value={mistake.correctStreak / MASTERY_STREAK} height={5} />
                </View>

                <Button
                  label="Als gemeistert markieren"
                  variant="ghost"
                  size="sm"
                  style={{ marginTop: theme.spacing.sm }}
                  onPress={() => setMastered.mutate({ id: mistake.id, mastered: true })}
                />
              </Card>
            ))}
          </View>
        </>
      )}

      {mastered.length > 0 ? (
        <>
          <SectionHeader title={`Gemeistert (${mastered.length})`} />
          <View style={{ gap: theme.spacing.sm }}>
            {mastered.map((mistake) => (
              <Card key={mistake.id} style={{ padding: theme.spacing.md }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1, paddingRight: theme.spacing.md }}>
                    <Text variant="body" tone="success">
                      ✅ {mistake.correctText}
                    </Text>
                    <Text variant="caption" tone="subtle">
                      {CATEGORY_LABELS_DE[mistake.category]}
                    </Text>
                  </View>
                  <Button
                    label="Zurückholen"
                    variant="ghost"
                    size="sm"
                    onPress={() => setMastered.mutate({ id: mistake.id, mastered: false })}
                  />
                </Row>
              </Card>
            ))}
          </View>
        </>
      ) : null}

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
