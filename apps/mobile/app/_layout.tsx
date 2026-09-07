import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getDatabase } from '@/database';
import { api } from '@/services/api';
import { useSettingsStore } from '@/store/settings';
import { ThemeProvider, useTheme } from '@/theme';
import { Text, Button } from '@/components/ui';

/**
 * Root layout.
 *
 * Opens and migrates the database, loads settings, then renders. Nothing else
 * happens at startup: no microphone permission prompt, no network call, so a
 * cold start works offline (§28).
 */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Local data is cheap to re-read; remote generation is not.
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const loadSettings = useSettingsStore((s) => s.load);
  const themePreference = useSettingsStore((s) => s.settings.theme);

  const boot = React.useCallback(async () => {
    setStatus('loading');
    try {
      await getDatabase();
      await loadSettings();
      // Free hosting sleeps when idle. Start waking it now so the learner's
      // first sentence does not pay the cold start.
      api.warmUp();
      setStatus('ready');
    } catch (error) {
      setErrorMessage((error as Error).message);
      setStatus('failed');
    }
  }, [loadSettings]);

  useEffect(() => {
    void boot();
  }, [boot]);

  return (
    <SafeAreaProvider>
      <ThemeProvider preference={themePreference}>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="auto" />
          {status === 'ready' ? (
            <Stack
              screenOptions={{
                headerShown: false,
                animation: 'slide_from_right',
                contentStyle: { backgroundColor: 'transparent' },
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="conversation" options={{ animation: 'fade' }} />
              <Stack.Screen name="summary" options={{ gestureEnabled: false }} />
            </Stack>
          ) : (
            <BootScreen status={status} message={errorMessage} onRetry={boot} />
          )}
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function BootScreen({
  status,
  message,
  onRetry,
}: {
  status: 'loading' | 'failed';
  message: string;
  onRetry: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.lg,
        padding: theme.spacing.xl,
        backgroundColor: theme.colors.background,
      }}
    >
      {status === 'loading' ? (
        <>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text variant="body" tone="muted">
            Einen Moment...
          </Text>
        </>
      ) : (
        <>
          <Text style={{ fontSize: 40 }}>😕</Text>
          <Text variant="heading" style={{ textAlign: 'center' }}>
            Die App konnte nicht starten
          </Text>
          <Text variant="caption" tone="muted" style={{ textAlign: 'center' }}>
            {message || 'Die lokale Datenbank konnte nicht geöffnet werden.'}
          </Text>
          <Button label="Erneut versuchen" onPress={onRetry} style={{ minWidth: 220 }} />
        </>
      )}
    </View>
  );
}
