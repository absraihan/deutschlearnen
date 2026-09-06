import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { CATEGORY_LABELS_DE } from '@deutschlearnen/shared';
import { sessionRepository } from '@/database/repositories';
import { useTheme } from '@/theme';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  LoadingState,
  Row,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import { ScoreRing } from '@/components/charts';
import { formatDuration } from '@/lib/util';

/**
 * The end-of-session score screen.
 *
 * Always reachable, even offline: when the tutor could not be asked for an
 * evaluation, the deterministic local scores are shown instead and labelled as
 * an estimate rather than silently presented as the model's judgement.
 */
export default function SummaryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();

  const query = useQuery({
    queryKey: ['session-summary', sessionId],
    enabled: Boolean(sessionId),
    queryFn: async () => {
      const session = await sessionRepository.get(sessionId!);
      if (!session) return null;
      const corrections = await sessionRepository.listCorrections(session.id);
      const messages = await sessionRepository.listMessages(session.id);
      return { session, corrections, messages };
    },
  });

  if (query.isLoading) {
    return (
      <Screen>
        <LoadingState label="Auswertung wird geladen..." />
      </Screen>
    );
  }

  if (!query.data?.session) {
    return (
      <Screen>
        <EmptyState
          emoji="🤔"
          title="Keine Auswertung gefunden"
          body="Diese Sitzung wurde nicht gespeichert."
          actionLabel="Zurück zum Start"
          onAction={() => router.replace('/')}
        />
      </Screen>
    );
  }

  const { session, corrections, messages } = query.data;
  const userTurns = messages.filter((m) => m.speaker === 'user').length;

  const categoryCounts = corrections.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Screen scroll>
      <Text variant="display">Auswertung</Text>
      <Text variant="body" tone="muted" style={{ marginTop: 4 }}>
        {session.level} · {formatDuration(session.durationSec)} · {userTurns} Redebeiträge
      </Text>

      <View style={{ alignItems: 'center', marginTop: theme.spacing.xl }}>
        <ScoreRing score={session.overallScore} size={148} label="Gesamt" />
      </View>

      {session.summary ? (
        <Card style={{ marginTop: theme.spacing.xl }}>
          <Text variant="body">{session.summary}</Text>
        </Card>
      ) : null}

      <SectionHeader title="Einzelwertung" />
      <Card>
        <Row style={{ justifyContent: 'space-around', flexWrap: 'wrap', rowGap: theme.spacing.lg }}>
          <ScoreRing score={session.grammarScore} size={82} label="Grammatik" />
          <ScoreRing score={session.vocabularyScore} size={82} label="Wortschatz" />
          <ScoreRing score={session.fluencyScore} size={82} label="Flüssigkeit" />
          <ScoreRing score={session.pronunciationScore} size={82} label="Aussprache" />
        </Row>
        {session.pronunciationScore === null ? (
          <>
            <Divider />
            <Text variant="caption" tone="subtle">
              Für die Aussprache gab es keine verlässlichen Daten. Aussprache-Feedback ist
              immer eine Schätzung aus der Spracherkennung, keine gemessene Bewertung.
            </Text>
          </>
        ) : null}
      </Card>

      <SectionHeader title={`Korrekturen (${corrections.length})`} />
      {corrections.length === 0 ? (
        <Card>
          <Text variant="body" tone="success">
            Keine wichtigen Fehler in dieser Sitzung. Sehr gut!
          </Text>
        </Card>
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          {Object.entries(categoryCounts).length > 1 ? (
            <Card>
              <Text variant="label" tone="muted">
                Schwerpunkte
              </Text>
              {Object.entries(categoryCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([category, count]) => (
                  <Text key={category} variant="caption" tone="muted" style={{ marginTop: 4 }}>
                    {CATEGORY_LABELS_DE[category as keyof typeof CATEGORY_LABELS_DE] ?? category} ·{' '}
                    {count}x
                  </Text>
                ))}
            </Card>
          ) : null}

          {corrections.map((correction) => (
            <Card key={correction.id}>
              <Text variant="caption" tone="warning">
                {CATEGORY_LABELS_DE[correction.category] ?? correction.category}
              </Text>
              <Text
                variant="body"
                tone="muted"
                style={{ textDecorationLine: 'line-through', marginTop: 4 }}
              >
                {correction.original}
              </Text>
              <Text variant="bodyStrong" style={{ marginTop: 2 }}>
                ✅ {correction.corrected}
              </Text>
              {correction.explanation ? (
                <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
                  {correction.explanation}
                </Text>
              ) : null}
              {correction.explanationBn ? (
                <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                  {correction.explanationBn}
                </Text>
              ) : null}
            </Card>
          ))}
        </View>
      )}

      <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xl }}>
        {corrections.length > 0 ? (
          <Button
            label="Diese Fehler jetzt üben"
            icon="🔁"
            onPress={() => router.replace('/mistakes')}
          />
        ) : null}
        <Button label="Noch eine Sitzung" variant="secondary" onPress={() => router.replace('/practice')} />
        <Button label="Zum Start" variant="ghost" onPress={() => router.replace('/')} />
      </View>
      <View style={{ height: theme.spacing.xl }} />
    </Screen>
  );
}
