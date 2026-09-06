import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { HIT_SIZE, useTheme, type Theme } from '@/theme';

/**
 * The UI kit.
 *
 * Small, typed and theme-driven. Every interactive element is at least
 * HIT_SIZE tall, because this app is used one-handed while talking.
 */

type TextVariant = keyof Theme['typography'];
type TextTone = 'default' | 'muted' | 'subtle' | 'primary' | 'success' | 'warning' | 'danger' | 'onPrimary';

export function Text({
  variant = 'body',
  tone = 'default',
  style,
  children,
  ...rest
}: {
  variant?: TextVariant;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
} & React.ComponentProps<typeof RNText>) {
  const theme = useTheme();
  const toneColor: Record<TextTone, string> = {
    default: theme.colors.text,
    muted: theme.colors.textMuted,
    subtle: theme.colors.textSubtle,
    primary: theme.colors.primary,
    success: theme.colors.success,
    warning: theme.colors.warning,
    danger: theme.colors.danger,
    onPrimary: theme.colors.onPrimary,
  };

  return (
    <RNText {...rest} style={[theme.typography[variant], { color: toneColor[tone] }, style]}>
      {children}
    </RNText>
  );
}

export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = ['top'],
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const padding = padded ? theme.spacing.lg : 0;

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[
        { padding, paddingBottom: theme.spacing.xxxl },
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, padding }, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {body}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const base: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    ...theme.shadows.card,
  };

  if (!onPress) return <View style={[base, style]}>{children}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [base, pressed && { opacity: 0.75 }, style]}
    >
      {children}
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  style,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const theme = useTheme();
  const height = size === 'lg' ? 56 : size === 'sm' ? HIT_SIZE : 52;

  const backgrounds: Record<string, string> = {
    primary: theme.colors.primary,
    secondary: theme.colors.surfaceRaised,
    ghost: 'transparent',
    danger: theme.colors.dangerSoft,
  };
  const labelTones: Record<string, TextTone> = {
    primary: 'onPrimary',
    secondary: 'default',
    ghost: 'primary',
    danger: 'danger',
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      accessibilityHint={accessibilityHint}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height,
          minHeight: HIT_SIZE,
          borderRadius: theme.radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          backgroundColor: backgrounds[variant],
          borderWidth: variant === 'ghost' ? StyleSheet.hairlineWidth : 0,
          borderColor: theme.colors.border,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? theme.colors.onPrimary : theme.colors.primary} />
      ) : (
        <>
          {icon ? <Text variant="bodyStrong" tone={labelTones[variant] as TextTone}>{icon}</Text> : null}
          <Text variant="bodyStrong" tone={labelTones[variant] as TextTone}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
  tone = 'default',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const theme = useTheme();
  const toneColor = {
    default: theme.colors.primary,
    success: theme.colors.success,
    warning: theme.colors.warning,
    danger: theme.colors.danger,
  }[tone];

  const content = (
    <View
      style={{
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.pill,
        backgroundColor: selected ? toneColor : theme.colors.surfaceRaised,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: selected ? toneColor : theme.colors.border,
        minHeight: 36,
        justifyContent: 'center',
      }}
    >
      <Text variant="label" tone={selected ? 'onPrimary' : 'muted'}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={8}
    >
      {content}
    </Pressable>
  );
}

export function LevelBadge({ level, topic }: { level: string; topic?: string | null }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: 6,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.primarySoft,
        alignSelf: 'flex-start',
      }}
    >
      <Text variant="label" tone="primary">
        {level}
      </Text>
      {topic ? (
        <>
          <Text variant="label" tone="subtle">
            •
          </Text>
          <Text variant="label" tone="muted" numberOfLines={1}>
            {topic}
          </Text>
        </>
      ) : null}
    </View>
  );
}

export function StatTile({
  value,
  label,
  hint,
  tone = 'default',
  onPress,
}: {
  value: string;
  label: string;
  hint?: string;
  tone?: TextTone;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={`${label}: ${value}`} style={{ flex: 1, padding: theme.spacing.md }}>
      <Text variant="title" tone={tone}>
        {value}
      </Text>
      <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
        {label}
      </Text>
      {hint ? (
        <Text variant="caption" tone="subtle" style={{ marginTop: 2 }}>
          {hint}
        </Text>
      ) : null}
    </Card>
  );
}

export function ProgressBar({
  value,
  tone,
  height = 8,
}: {
  value: number;
  tone?: string;
  height?: number;
}) {
  const theme = useTheme();
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(clamped * 100), min: 0, max: 100 }}
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: theme.colors.surfaceRaised,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          backgroundColor: tone ?? theme.colors.primary,
        }}
      />
    </View>
  );
}

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: theme.spacing.md,
        marginTop: theme.spacing.xl,
      }}
    >
      <Text variant="heading">{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={12} accessibilityRole="button">
          <Text variant="label" tone="primary">
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({
  emoji,
  title,
  body,
  actionLabel,
  onAction,
}: {
  emoji: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: theme.spacing.xxl, gap: theme.spacing.sm }}>
      <Text style={{ fontSize: 44 }}>{emoji}</Text>
      <Text variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      <Text variant="body" tone="muted" style={{ textAlign: 'center', maxWidth: 300 }}>
        {body}
      </Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={{ marginTop: theme.spacing.md, minWidth: 200 }} />
      ) : null}
    </View>
  );
}

export function LoadingState({ label = 'Einen Moment...' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: theme.spacing.xxl, gap: theme.spacing.md }}>
      <ActivityIndicator color={theme.colors.primary} size="large" />
      <Text variant="body" tone="muted">
        {label}
      </Text>
    </View>
  );
}

export function ErrorBanner({
  message,
  onRetry,
  onDismiss,
  retryLabel = 'Nochmal',
}: {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  retryLabel?: string;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: theme.colors.dangerSoft,
        borderRadius: theme.radius.md,
        padding: theme.spacing.md,
        gap: theme.spacing.sm,
      }}
    >
      <Text variant="body" tone="danger">
        {message}
      </Text>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        {onRetry ? (
          <Button label={retryLabel} onPress={onRetry} size="sm" variant="secondary" style={{ flex: 1 }} />
        ) : null}
        {onDismiss ? (
          <Button label="Schließen" onPress={onDismiss} size="sm" variant="ghost" style={{ flex: 1 }} />
        ) : null}
      </View>
    </View>
  );
}

export function Row({
  children,
  gap = 12,
  style,
}: {
  children: React.ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[{ flexDirection: 'row', gap }, style]}>{children}</View>;
}

export function Divider() {
  const theme = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.border,
        marginVertical: theme.spacing.md,
      }}
    />
  );
}
