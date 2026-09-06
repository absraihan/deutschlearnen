import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { CATEGORY_LABELS_DE, type Correction } from '@deutschlearnen/shared';
import { useTheme } from '@/theme';
import { Text } from './ui';
import type { MicState } from '@/features/conversation/useConversation';

/**
 * Conversation UI.
 *
 * The microphone button is the centre of the app, so its five states are
 * visually unmistakable: colour, label and a pulse that only runs while the app
 * is actually listening.
 */

const MIC_SIZE = 96;

const STATE_META: Record<
  MicState,
  { label: string; hint: string; icon: string; accessibility: string }
> = {
  idle: {
    label: 'Sprechen',
    hint: 'Tippe und sprich auf Deutsch',
    icon: '🎤',
    accessibility: 'Aufnahme starten',
  },
  listening: {
    label: 'Ich höre zu',
    hint: 'Tippe, wenn du fertig bist',
    icon: '⏹',
    accessibility: 'Aufnahme beenden',
  },
  processing: {
    label: 'Einen Moment',
    hint: 'Ich denke nach...',
    icon: '⋯',
    accessibility: 'Der Tutor denkt nach',
  },
  speaking: {
    label: 'Tutor spricht',
    hint: 'Tippe zum Unterbrechen',
    icon: '🔊',
    accessibility: 'Sprachausgabe unterbrechen',
  },
  error: {
    label: 'Nochmal',
    hint: 'Tippe, um es erneut zu versuchen',
    icon: '↻',
    accessibility: 'Erneut versuchen',
  },
};

export function MicButton({
  state,
  onPress,
  disabled = false,
  recordingMs = 0,
}: {
  state: MicState;
  onPress: () => void;
  disabled?: boolean;
  recordingMs?: number;
}) {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;
  const meta = STATE_META[state];

  useEffect(() => {
    if (state !== 'listening' && state !== 'processing') {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: state === 'listening' ? 900 : 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: state === 'listening' ? 900 : 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, state]);

  const background = {
    idle: theme.colors.primary,
    listening: theme.colors.listening,
    processing: theme.colors.surfaceRaised,
    speaking: theme.colors.success,
    error: theme.colors.danger,
  }[state];

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] });

  return (
    <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
      <View style={{ width: MIC_SIZE * 1.6, height: MIC_SIZE * 1.6, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: MIC_SIZE,
            height: MIC_SIZE,
            borderRadius: MIC_SIZE / 2,
            backgroundColor: background,
            opacity: haloOpacity,
            transform: [{ scale: haloScale }],
          }}
        />
        <Animated.View style={{ transform: [{ scale }] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={meta.accessibility}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => ({
              width: MIC_SIZE,
              height: MIC_SIZE,
              borderRadius: MIC_SIZE / 2,
              backgroundColor: background,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
              ...theme.shadows.raised,
            })}
          >
            <Text style={{ fontSize: 34 }}>{meta.icon}</Text>
          </Pressable>
        </Animated.View>
      </View>

      <Text variant="bodyStrong">{meta.label}</Text>
      <Text variant="caption" tone="muted">
        {state === 'listening' && recordingMs > 0
          ? `${(recordingMs / 1000).toFixed(1)}s · ${meta.hint}`
          : meta.hint}
      </Text>
    </View>
  );
}

export function MessageBubble({
  speaker,
  text,
  confidence,
  onReplay,
}: {
  speaker: 'user' | 'ai';
  text: string;
  confidence?: number | null;
  onReplay?: () => void;
}) {
  const theme = useTheme();
  const isUser = speaker === 'user';

  return (
    <View style={{ alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: theme.spacing.sm }}>
      <Pressable
        onPress={onReplay}
        disabled={!onReplay}
        accessibilityRole={onReplay ? 'button' : 'text'}
        accessibilityLabel={
          onReplay ? `Antwort des Tutors noch einmal anhören: ${text}` : undefined
        }
        style={{
          maxWidth: '88%',
          backgroundColor: isUser ? theme.colors.userBubble : theme.colors.aiBubble,
          borderRadius: theme.radius.lg,
          borderBottomRightRadius: isUser ? 4 : theme.radius.lg,
          borderBottomLeftRadius: isUser ? theme.radius.lg : 4,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          borderWidth: isUser ? 0 : StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
        }}
      >
        <Text
          variant="transcript"
          style={{ color: isUser ? theme.colors.userBubbleText : theme.colors.aiBubbleText }}
        >
          {text}
        </Text>
      </Pressable>

      {isUser && typeof confidence === 'number' && confidence < 0.7 ? (
        <Text variant="caption" tone="subtle" style={{ marginTop: 2 }}>
          Erkennung unsicher ({Math.round(confidence * 100)}%)
        </Text>
      ) : null}
      {!isUser && onReplay ? (
        <Text variant="caption" tone="subtle" style={{ marginTop: 2 }}>
          Tippen zum Wiederholen
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The correction card.
 *
 * Shows exactly as much as the correction mode asks for: MINIMAL is the
 * corrected sentence alone, NORMAL adds one explanation, DETAILED adds the
 * translations and a more natural alternative.
 */
export function CorrectionCard({
  correction,
  isRepeat = false,
  showBangla = true,
  showEnglish = true,
}: {
  correction: Correction;
  isRepeat?: boolean;
  showBangla?: boolean;
  showEnglish?: boolean;
}) {
  const theme = useTheme();
  if (!correction.hasError || !correction.corrected) return null;

  return (
    <View
      style={{
        alignSelf: 'flex-end',
        maxWidth: '92%',
        backgroundColor: theme.colors.warningSoft,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.md,
        gap: 6,
        borderLeftWidth: 3,
        borderLeftColor: theme.colors.warning,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text variant="label" tone="warning">
          {CATEGORY_LABELS_DE[correction.category] ?? 'Korrektur'}
        </Text>
        {isRepeat ? (
          <Text variant="caption" tone="danger">
            · schon wieder
          </Text>
        ) : null}
      </View>

      {correction.original ? (
        <Text variant="body" tone="muted" style={{ textDecorationLine: 'line-through' }}>
          {correction.original}
        </Text>
      ) : null}

      <Text variant="bodyStrong">✅ {correction.corrected}</Text>

      {correction.explanation ? (
        <Text variant="caption" tone="muted">
          {correction.explanation}
        </Text>
      ) : null}

      {showBangla && correction.explanationBn ? (
        <Text variant="caption" tone="muted">
          {correction.explanationBn}
        </Text>
      ) : null}

      {showEnglish && correction.explanationEn ? (
        <Text variant="caption" tone="subtle">
          {correction.explanationEn}
        </Text>
      ) : null}

      {correction.naturalAlternative ? (
        <Text variant="caption" tone="primary">
          Natürlicher: {correction.naturalAlternative}
        </Text>
      ) : null}
    </View>
  );
}
