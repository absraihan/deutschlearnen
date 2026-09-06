import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { VocabularyStatus } from '@deutschcoach/shared';
import { vocabularyRepository } from '@/database/repositories';
import { api, ApiClientError } from '@/services/api';
import { useSettingsStore } from '@/store/settings';
import { useTheme } from '@/theme';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  LoadingState,
  Row,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import { speak } from '@/services/speech/tts';

type Filter = 'all' | VocabularyStatus | 'favorite';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Alle' },
  { id: 'new', label: 'Neu' },
  { id: 'learning', label: 'Am Lernen' },
  { id: 'mastered', label: 'Sicher' },
  { id: 'favorite', label: '★ Favoriten' },
];

/**
 * The vocabulary list.
 *
 * Words arrive automatically from conversations; this screen is for reviewing
 * them, hearing them, and generating more on a topic when the list runs dry.
 */
export default function VocabularyScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const settings = useSettingsStore((s) => s.settings);

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const words = useQuery({
    queryKey: ['vocabulary', filter, search],
    queryFn: () =>
      vocabularyRepository.list({
        status: filter === 'all' || filter === 'favorite' ? undefined : filter,
        favorite: filter === 'favorite',
        search: search.trim() || undefined,
      }),
  });

  const dueCount = useQuery({
    queryKey: ['vocabulary-due'],
    queryFn: async () => (await vocabularyRepository.listDue(50)).length,
  });

  const generate = useMutation({
    mutationFn: async () => {
      const existing = await vocabularyRepository.list({ limit: 100 });
      const result = await api.generateVocabulary({
        level: settings.currentLevel,
        topic: 'Alltag',
        count: 8,
        includeBangla: settings.banglaExplanations,
        exclude: existing.map((w) => w.german),
      });
      for (const item of result.items) {
        await vocabularyRepository.upsert({
          german: item.german,
          english: item.english,
          bangla: item.bangla,
          article: item.article,
          wordType: item.wordType,
          exampleSentence: item.example,
          exampleTranslation: item.exampleTranslation,
          level: item.level,
          category: item.category,
        });
      }
      return result.items.length;
    },
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
    },
    onError: (err) => {
      setError(
        err instanceof ApiClientError
          ? err.userMessage
          : 'Neue Wörter konnten nicht geladen werden.',
      );
    },
  });

  const toggleFavorite = useMutation({
    mutationFn: (id: string) => vocabularyRepository.toggleFavorite(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vocabulary'] }),
  });

  return (
    <Screen scroll>
      <Text variant="display">Wörter</Text>
      <Text variant="body" tone="muted" style={{ marginTop: 4 }}>
        Aus deinen Gesprächen gesammelt.
      </Text>

      {dueCount.data && dueCount.data > 0 ? (
        <Card style={{ marginTop: theme.spacing.lg }}>
          <Row style={{ alignItems: 'center' }} gap={12}>
            <Text style={{ fontSize: 26 }}>🃏</Text>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{dueCount.data} Wörter zum Wiederholen</Text>
              <Text variant="caption" tone="muted">
                Karteikarten mit Beispielsätzen
              </Text>
            </View>
          </Row>
          <Button
            label="Karteikarten starten"
            onPress={() => router.push('/flashcards')}
            style={{ marginTop: theme.spacing.md }}
          />
        </Card>
      ) : null}

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Suchen (Deutsch, English, বাংলা)"
        placeholderTextColor={theme.colors.textSubtle}
        accessibilityLabel="Wörter durchsuchen"
        style={{
          marginTop: theme.spacing.lg,
          height: 48,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          color: theme.colors.text,
          paddingHorizontal: theme.spacing.md,
          fontSize: 16,
        }}
      />

      <Row style={{ flexWrap: 'wrap', marginTop: theme.spacing.md }} gap={8}>
        {FILTERS.map((item) => (
          <Chip
            key={item.id}
            label={item.label}
            selected={filter === item.id}
            onPress={() => setFilter(item.id)}
          />
        ))}
      </Row>

      {error ? (
        <View style={{ marginTop: theme.spacing.md }}>
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </View>
      ) : null}

      <SectionHeader title={`${words.data?.length ?? 0} Wörter`} />

      {words.isLoading ? (
        <LoadingState />
      ) : !words.data?.length ? (
        <EmptyState
          emoji="📚"
          title="Noch keine Wörter"
          body="Sprich eine Runde mit deinem Tutor – nützliche Wörter landen automatisch hier. Oder lass dir gleich welche vorschlagen."
          actionLabel={generate.isPending ? 'Wird geladen...' : 'Wörter vorschlagen'}
          onAction={() => generate.mutate()}
        />
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          {words.data.map((word) => (
            <Card key={word.id}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Pressable
                  style={{ flex: 1 }}
                  accessibilityRole="button"
                  accessibilityLabel={`${word.german} anhören`}
                  onPress={() =>
                    void speak({
                      text: word.article ? `${word.article} ${word.german}` : word.german,
                      level: word.level,
                      speedPreference: settings.voiceSpeed,
                      engine: settings.ttsEngine,
                      voice: settings.aiVoice,
                    })
                  }
                >
                  <Text variant="heading">
                    {word.article ? `${word.article} ` : ''}
                    {word.german} 🔊
                  </Text>
                  <Text variant="body" tone="muted">
                    {word.english}
                  </Text>
                  {word.bangla ? (
                    <Text variant="body" tone="muted">
                      {word.bangla}
                    </Text>
                  ) : null}
                </Pressable>
                <Pressable
                  onPress={() => toggleFavorite.mutate(word.id)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={word.favorite ? 'Favorit entfernen' : 'Als Favorit merken'}
                >
                  <Text style={{ fontSize: 22 }}>{word.favorite ? '★' : '☆'}</Text>
                </Pressable>
              </Row>

              {word.exampleSentence ? (
                <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
                  „{word.exampleSentence}“
                </Text>
              ) : null}

              <Row style={{ marginTop: theme.spacing.sm }} gap={6}>
                <Chip label={word.level} />
                <Chip
                  label={statusLabel(word.status)}
                  tone={word.status === 'mastered' ? 'success' : 'default'}
                  selected={word.status === 'mastered'}
                />
              </Row>
            </Card>
          ))}
        </View>
      )}

      {words.data?.length ? (
        <Button
          label={generate.isPending ? 'Wird geladen...' : 'Mehr Wörter vorschlagen'}
          variant="secondary"
          loading={generate.isPending}
          onPress={() => generate.mutate()}
          style={{ marginTop: theme.spacing.xl }}
        />
      ) : null}
      <View style={{ height: theme.spacing.xl }} />
    </Screen>
  );
}

function statusLabel(status: VocabularyStatus): string {
  return { new: 'neu', learning: 'am Lernen', mastered: 'sicher' }[status];
}
