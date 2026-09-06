import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Rect, Polyline } from 'react-native-svg';
import { scoreColor, useTheme } from '@/theme';
import { Text } from './ui';
import { weekdayLabelDe } from '@/lib/util';

/**
 * Charts.
 *
 * Deliberately three primitives, not a charting library: a score ring, a weekly
 * bar chart and a sparkline. The spec asks for simple charts and no unnecessary
 * analytics (§26), and hand-rolled SVG keeps the bundle small and the styling
 * consistent with the rest of the design system.
 */

export function ScoreRing({
  score,
  size = 120,
  label,
  caption,
}: {
  score: number | null;
  size?: number;
  label?: string;
  caption?: string;
}) {
  const theme = useTheme();
  const stroke = size < 90 ? 8 : 11;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = score === null ? 0 : Math.min(1, Math.max(0, score / 100));
  const color = scoreColor(score, theme.colors);

  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={theme.colors.surfaceRaised}
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${circumference * fraction} ${circumference}`}
            // Start the arc at 12 o'clock rather than 3 o'clock.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <Text variant={size < 90 ? 'heading' : 'title'} style={{ color }}>
          {score === null ? '–' : Math.round(score)}
        </Text>
      </View>
      {label ? <Text variant="label">{label}</Text> : null}
      {caption ? (
        <Text variant="caption" tone="subtle">
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

export function WeeklyBars({
  data,
  goalMinutes,
  height = 120,
}: {
  data: Array<{ date: string; speakingMinutes: number }>;
  goalMinutes: number;
  height?: number;
}) {
  const theme = useTheme();
  const max = Math.max(goalMinutes, ...data.map((d) => d.speakingMinutes), 1);
  const barWidth = 22;
  const gap = 10;
  const width = data.length * barWidth + (data.length - 1) * gap;
  const goalY = height - (goalMinutes / max) * height;

  return (
    <View style={{ gap: 6 }}>
      <Svg width={width} height={height}>
        {/* The daily goal line, so a bar reaching it is instantly readable. */}
        <Rect x={0} y={goalY} width={width} height={1} fill={theme.colors.border} />
        {data.map((day, index) => {
          const barHeight = Math.max(3, (day.speakingMinutes / max) * height);
          const reached = day.speakingMinutes >= goalMinutes && goalMinutes > 0;
          return (
            <Rect
              key={day.date}
              x={index * (barWidth + gap)}
              y={height - barHeight}
              width={barWidth}
              height={barHeight}
              rx={5}
              fill={
                day.speakingMinutes === 0
                  ? theme.colors.surfaceRaised
                  : reached
                    ? theme.colors.success
                    : theme.colors.primary
              }
            />
          );
        })}
      </Svg>
      <View style={{ flexDirection: 'row', width, gap }}>
        {data.map((day) => (
          <View key={day.date} style={{ width: barWidth, alignItems: 'center' }}>
            <Text variant="caption" tone="subtle">
              {weekdayLabelDe(day.date)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function Sparkline({
  values,
  width = 240,
  height = 48,
  color,
}: {
  values: Array<number | null>;
  width?: number;
  height?: number;
  color?: string;
}) {
  const theme = useTheme();
  const points = values
    .map((value, index) => ({ value, index }))
    .filter((p): p is { value: number; index: number } => p.value !== null);

  if (points.length < 2) {
    return (
      <View style={{ height, justifyContent: 'center' }}>
        <Text variant="caption" tone="subtle">
          Noch nicht genug Daten für einen Verlauf.
        </Text>
      </View>
    );
  }

  const max = Math.max(...points.map((p) => p.value), 100);
  const min = Math.min(...points.map((p) => p.value), 0);
  const span = Math.max(1, max - min);
  const stepX = width / Math.max(1, values.length - 1);

  const path = points
    .map((p) => `${p.index * stepX},${height - ((p.value - min) / span) * height}`)
    .join(' ');

  return (
    <Svg width={width} height={height}>
      <Polyline
        points={path}
        fill="none"
        stroke={color ?? theme.colors.primary}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}
