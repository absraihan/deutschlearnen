import React from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { Text } from '@/components/ui';

/**
 * Five tabs, no more. Everything else is reached from the Home screen, which
 * keeps the bottom bar readable and puts speaking one tap away.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  /**
   * Android 16 makes edge-to-edge mandatory, so the app draws underneath the
   * system navigation bar. Without adding the bottom inset the tab bar sits
   * behind the back/home/recents buttons and cannot be tapped at all.
   *
   * Gesture navigation reports a small inset (~16dp) and three-button
   * navigation a large one (~48dp); both are handled by adding whatever the
   * device reports to the bar's own height.
   */
  const barHeight = 64 + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSubtle,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: barHeight,
          paddingBottom: insets.bottom + 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Start',
          tabBarIcon: ({ focused }) => <TabIcon icon="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="practice"
        options={{
          title: 'Üben',
          tabBarIcon: ({ focused }) => <TabIcon icon="🎯" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="vocabulary"
        options={{
          title: 'Wörter',
          tabBarIcon: ({ focused }) => <TabIcon icon="📚" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Fortschritt',
          tabBarIcon: ({ focused }) => <TabIcon icon="📈" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Einstellungen',
          tabBarIcon: ({ focused }) => <TabIcon icon="⚙️" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{icon}</Text>;
}
