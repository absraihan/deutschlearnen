/**
 * Design tokens.
 *
 * A deliberate choice over NativeWind: one typed source of truth for colour,
 * spacing and type, consumed through `useTheme()`. No babel plugin, no
 * Tailwind config drift, and dark mode is a single palette swap rather than a
 * `dark:` prefix on every element.
 */

export const palette = {
  /** Warm indigo - calm, not corporate. Used for the tutor and primary actions. */
  indigo50: '#EEF1FF',
  indigo100: '#DDE3FF',
  indigo300: '#A5B4FC',
  indigo400: '#8B9CF7',
  indigo500: '#6366F1',
  indigo600: '#4F46E5',
  indigo700: '#4338CA',
  indigo900: '#1E1B4B',

  /** Speaking / success. */
  green400: '#4ADE80',
  green500: '#22C55E',
  green600: '#16A34A',
  green900: '#052E16',

  /** Correction. Amber, not red: a mistake is information, not a failure. */
  amber300: '#FCD34D',
  amber400: '#FBBF24',
  amber500: '#F59E0B',
  amber900: '#451A03',

  /** Errors and destructive actions only. */
  red400: '#F87171',
  red500: '#EF4444',
  red600: '#DC2626',
  red900: '#450A0A',

  /** Listening state. */
  sky400: '#38BDF8',
  sky500: '#0EA5E9',

  white: '#FFFFFF',
  slate50: '#F8FAFC',
  slate100: '#F1F5F9',
  slate200: '#E2E8F0',
  slate300: '#CBD5E1',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1E293B',
  slate900: '#0F172A',
  night: '#0B1220',
  nightRaised: '#141C2E',
} as const;

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  primary: string;
  primarySoft: string;
  onPrimary: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  listening: string;
  userBubble: string;
  userBubbleText: string;
  aiBubble: string;
  aiBubbleText: string;
  overlay: string;
}

export const lightColors: ThemeColors = {
  background: palette.slate50,
  surface: palette.white,
  surfaceRaised: palette.slate100,
  border: palette.slate200,
  text: palette.slate900,
  textMuted: palette.slate600,
  textSubtle: palette.slate400,
  primary: palette.indigo600,
  primarySoft: palette.indigo50,
  onPrimary: palette.white,
  success: palette.green600,
  successSoft: '#DCFCE7',
  warning: palette.amber500,
  warningSoft: '#FEF3C7',
  danger: palette.red600,
  dangerSoft: '#FEE2E2',
  listening: palette.sky500,
  userBubble: palette.indigo600,
  userBubbleText: palette.white,
  aiBubble: palette.white,
  aiBubbleText: palette.slate900,
  overlay: 'rgba(15, 23, 42, 0.45)',
};

export const darkColors: ThemeColors = {
  background: palette.night,
  surface: palette.nightRaised,
  surfaceRaised: '#1C2740',
  border: '#25324D',
  text: palette.slate50,
  textMuted: palette.slate400,
  textSubtle: palette.slate500,
  primary: palette.indigo400,
  primarySoft: 'rgba(99, 102, 241, 0.16)',
  onPrimary: palette.slate900,
  success: palette.green400,
  successSoft: 'rgba(34, 197, 94, 0.16)',
  warning: palette.amber400,
  warningSoft: 'rgba(245, 158, 11, 0.16)',
  danger: palette.red400,
  dangerSoft: 'rgba(239, 68, 68, 0.16)',
  listening: palette.sky400,
  userBubble: palette.indigo600,
  userBubbleText: palette.white,
  aiBubble: palette.nightRaised,
  aiBubbleText: palette.slate50,
  overlay: 'rgba(0, 0, 0, 0.6)',
};

/** 4pt scale. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/**
 * Type scale. Sizes are generous on purpose: this app is used while speaking,
 * often at arm's length, so nothing important is below 15pt.
 */
export const typography = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '700' as const },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const },
  heading: { fontSize: 19, lineHeight: 25, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' as const },
  /** German transcript text: larger, because the learner reads it while talking. */
  transcript: { fontSize: 18, lineHeight: 27, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  mono: { fontSize: 15, lineHeight: 22, fontWeight: '500' as const },
} as const;

/** Minimum touch target, applied to every interactive element. */
export const HIT_SIZE = 48;

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

export interface Theme {
  mode: 'light' | 'dark';
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  shadows: typeof shadows;
}

export function buildTheme(mode: 'light' | 'dark'): Theme {
  return {
    mode,
    colors: mode === 'dark' ? darkColors : lightColors,
    spacing,
    radius,
    typography,
    shadows,
  };
}

/** Score colour, shared by rings, bars and chips so 72 always looks the same. */
export function scoreColor(score: number | null, colors: ThemeColors): string {
  if (score === null) return colors.textSubtle;
  if (score >= 80) return colors.success;
  if (score >= 60) return colors.primary;
  if (score >= 40) return colors.warning;
  return colors.danger;
}
