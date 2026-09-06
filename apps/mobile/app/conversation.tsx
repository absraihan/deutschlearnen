import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getMode,
  getRoleplay,
  isValidLevel,
  type CefrLevel,
  type SessionDuration,
  type SessionKind,
} from '@deutschcoach/shared';
import { useConversation } from '@/features/conversation/useConversation';
import { useSettingsStore } from '@/store/settings';
import { useTheme } from '@/theme';
import { Button, ErrorBanner, LevelBadge, ProgressBar, Row, Text } from '@/components/ui';
import { CorrectionCard, MessageBubble, MicButton } from '@/components/conversation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDuration } from '@/lib/util';

/**
 * The voice conversation screen.
 *
 * Layout follows the spec exactly: level and topic on top, the transcript in
 * the middle, one large microphone button at the bottom. Every state the app
 * can be in has a distinct colour and label on that button.
 */
export default function ConversationScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    modeId?: string;
    level?: string;
    kind?: string;
    roleplayId?: string;
    topic?: string;
    duration?: string;
    input?: string;
    phaseInstruction?: string;
  }>();

  const settings = useSettingsStore((s) => s.settings);
  const scrollRef = useRef<ScrollView>(null);
  const [draft, setDraft] = useState('');
  const [ending, setEnding] = useState(false);

  const level: CefrLevel = isValidLevel(params.level) ? params.level : settings.currentLevel;
  const inputMode: 'voice' | 'text' = params.input === 'text' ? 'text' : 'voice';
  const roleplay = params.roleplayId ? getRoleplay(params.roleplayId) : undefined;
  const mode = getMode(params.modeId ?? 'free');

  const conversation = useConversation({
    modeId: params.modeId ?? 'free',
    kind: (params.kind as SessionKind) ?? 'conversation',
    level,
    roleplayId: params.roleplayId ?? null,
    topic: params.topic ?? null,
    durationMinutes: params.duration ? (Number(params.duration) as SessionDuration) : null,
    inputMode,
  });

  useEffect(() => {
    // Keep the newest turn visible without stealing focus from the input.
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(timer);
  }, [conversation.entries.length]);

  const handleMicPress = useCallback(() => {
    switch (conversation.state) {
      case 'idle':
        void conversation.startListening();
        break;
      case 'listening':
        void conversation.stopListening();
        break;
      case 'speaking':
        void conversation.cancelListening();
        break;
      case 'error':
        conversation.dismissError();
        break;
      default:
        break;
    }
  }, [conversation]);

  const finish = useCallback(async () => {
    if (ending) return;
    setEnding(true);
    const sessionId = await conversation.endSession();
    if (!sessionId) {
      // Nothing was said, so there is no score to show.
      router.back();
      return;
    }
    router.replace({ pathname: '/summary', params: { sessionId } });
  }, [conversation, ending, router]);

  const confirmExit = useCallback(() => {
    if (conversation.entries.filter((e) => e.speaker === 'user').length === 0) {
      router.back();
      return;
    }
    Alert.alert('Sitzung beenden?', 'Du bekommst deine Auswertung und deine Punkte.', [
      { text: 'Weiter sprechen', style: 'cancel' },
      { text: 'Beenden', style: 'destructive', onPress: () => void finish() },
    ]);
  }, [conversation.entries, finish, router]);

  const topicLabel = roleplay?.titleDe ?? mode?.titleDe ?? 'Freies Gespräch';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View
          style={{
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.md,
            gap: theme.spacing.sm,
          }}
        >
          <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <LevelBadge level={conversation.level} topic={topicLabel} />
            <Pressable onPress={confirmExit} hitSlop={12} accessibilityRole="button" accessibilityLabel="Sitzung beenden">
              <Text variant="label" tone="primary">
                Beenden
              </Text>
            </Pressable>
          </Row>

          {conversation.phaseTitle ? (
            <View style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="caption" tone="muted">
                  {conversation.phaseTitle}
                </Text>
                <Text variant="caption" tone="subtle">
                  {formatDuration(conversation.elapsedSec)}
                </Text>
              </Row>
              <ProgressBar value={conversation.phaseProgress} height={4} />
            </View>
          ) : (
            <Text variant="caption" tone="subtle">
              {formatDuration(conversation.elapsedSec)}
            </Text>
          )}

          {conversation.levelChangedTo ? (
            <View
              style={{
                backgroundColor: theme.colors.successSoft,
                borderRadius: theme.radius.md,
                padding: theme.spacing.sm,
              }}
            >
              <Text variant="caption" tone="success">
                Sehr gut! Ich mache es jetzt etwas anspruchsvoller ({conversation.levelChangedTo}).
              </Text>
            </View>
          ) : null}
        </View>

        {/* Transcript */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {conversation.entries.map((entry) => (
            <View key={entry.id}>
              <MessageBubble
                speaker={entry.speaker}
                text={entry.text}
                confidence={entry.confidence}
                onReplay={
                  entry.speaker === 'ai' && inputMode === 'voice'
                    ? () => void conversation.replay(entry.text)
                    : undefined
                }
              />
              {entry.correction && settings.correctionMode !== 'OFF' ? (
                <CorrectionCard
                  correction={entry.correction}
                  isRepeat={entry.isRepeatMistake}
                  showBangla={settings.banglaExplanations && settings.correctionMode !== 'MINIMAL'}
                  showEnglish={settings.englishExplanations && settings.correctionMode === 'DETAILED'}
                />
              ) : null}
            </View>
          ))}

          {conversation.state === 'processing' ? (
            <Text variant="caption" tone="subtle" style={{ marginTop: theme.spacing.sm }}>
              Der Tutor denkt nach...
            </Text>
          ) : null}
        </ScrollView>

        {/* Controls */}
        <View
          style={{
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.md,
            gap: theme.spacing.md,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          {conversation.error ? (
            <ErrorBanner
              message={conversation.error.message}
              onRetry={
                conversation.error.retryable ? () => void conversation.retryLast() : undefined
              }
              onDismiss={conversation.dismissError}
            />
          ) : null}

          {inputMode === 'text' ? (
            <Row style={{ alignItems: 'flex-end', paddingBottom: theme.spacing.md }} gap={8}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Schreib auf Deutsch..."
                placeholderTextColor={theme.colors.textSubtle}
                multiline
                accessibilityLabel="Deine Nachricht auf Deutsch"
                style={{
                  flex: 1,
                  minHeight: 48,
                  maxHeight: 120,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.background,
                  color: theme.colors.text,
                  paddingHorizontal: theme.spacing.md,
                  paddingTop: 12,
                  fontSize: 16,
                }}
              />
              <Button
                label="Senden"
                onPress={() => {
                  const text = draft.trim();
                  if (!text) return;
                  setDraft('');
                  void conversation.sendText(text);
                }}
                loading={conversation.isBusy}
                disabled={!draft.trim()}
                size="sm"
              />
            </Row>
          ) : (
            <View style={{ alignItems: 'center', paddingBottom: theme.spacing.md }}>
              <MicButton
                state={conversation.state}
                onPress={handleMicPress}
                disabled={conversation.state === 'processing'}
                recordingMs={conversation.recordingMs}
              />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
