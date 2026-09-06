import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { vocabularyRepository } from '@/database/repositories';
import { useSettingsStore } from '@/store/settings';
import { useTheme } from '@/theme';
import {
  Button,
  Card,
  EmptyState,
  LoadingState,
  ProgressBar,
  Row,
  Screen,
  Text,
} from '@/components/ui';
import { speak } from '@/services/speech/tts';

/**
 * Flashcards.
 *
 * German on the front, meanings on the back. A correct answer pushes the next
 * review further out (1, 3, 7, 16, 35 days) - a deliberately simple schedule
 * that is the extension point for a full spaced-repetition algorithm.
 */
export default function FlashcardsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const settings = useSettingsStore((s) => s.settings);

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [correct, setCorrect] = useState(0);

  const due = useQuery({
    queryKey: ['flashcards'],
    queryFn: () => vocabularyRepository.listDue(20),
  });

  const cards = due.data ?? [];
  const card = cards[index];

  const answerCard = async (wasCorrect: boolean): Promise<void> => {
    if (!card) return;
    await vocabularyRepository.review(card.id, wasCorrect);
    if (wasCorrect) setCorrect((n) => n + 1);
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  if (due.isLoading) {
    return (
      <Screen>
        <LoadingState label="Karten werden geladen..." />
      </Screen>
    );
  }

  if (cards.length === 0) {
    return (
      <Screen>
        <EmptyState
          emoji="🃏"
          title="Keine Karten fällig"
          body="Alle Wörter sind für heute wiederholt. Sprich eine Runde – neue Wörter kommen automatisch dazu."
          actionLabel="Zurück"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  if (!card) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            emoji="🎉"
            title={`${correct} von ${cards.length} gewusst`}
            body="Die nächsten Wiederholungen sind eingeplant."
            actionLabel="Fertig"
            onAction={() => router.back()}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="display">Karteikarten</Text>
      <Row style={{ justifyContent: 'space-between', marginTop: theme.spacing.sm }}>
        <Text variant="caption" tone="muted">
          Karte {index + 1} von {cards.length}
        </Text>
        <Text variant="caption" tone="success">
          {correct} gewusst
        </Text>
      </Row>
      <View style={{ marginTop: theme.spacing.sm }}>
        <ProgressBar value={index / cards.length} height={6} />
      </View>

      <Pressable
        onPress={() => setFlipped((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={flipped ? 'Karte umdrehen zur Vorderseite' : 'Karte umdrehen zur Rückseite'}
        style={{ flex: 1, justifyContent: 'center' }}
      >
        <Card style={{ minHeight: 260, justifyContent: 'center', alignItems: 'center', gap: theme.spacing.md }}>
          <Text variant="display" style={{ textAlign: 'center' }}>
            {card.article ? `${card.article} ` : ''}
            {card.german}
          </Text>

          {flipped ? (
            <>
              <Text variant="heading" tone="muted" style={{ textAlign: 'center' }}>
                {card.english}
              </Text>
              {card.bangla ? (
                <Text variant="heading" tone="muted" style={{ textAlign: 'center' }}>
                  {card.bangla}
                </Text>
              ) : null}
              {card.exampleSentence ? (
                <Text variant="body" tone="subtle" style={{ textAlign: 'center' }}>
                  „{card.exampleSentence}“
                </Text>
              ) : null}
            </>
          ) : (
            <Text variant="caption" tone="subtle">
              Tippen zum Umdrehen
            </Text>
          )}

          <Button
            label="Anhören"
            icon="🔊"
            variant="ghost"
            size="sm"
            onPress={() =>
              void speak({
                text: card.exampleSentence || card.german,
                level: card.level,
                speedPreference: settings.voiceSpeed,
                engine: settings.ttsEngine,
                voice: settings.aiVoice,
              })
            }
          />
        </Card>
      </Pressable>

      <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.lg }}>
        {flipped ? (
          <Row gap={12}>
            <Button
              label="Nochmal"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => void answerCard(false)}
            />
            <Button label="Gewusst" style={{ flex: 1 }} onPress={() => void answerCard(true)} />
          </Row>
        ) : (
          <Button label="Antwort zeigen" onPress={() => setFlipped(true)} />
        )}
        <Button label="Beenden" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
