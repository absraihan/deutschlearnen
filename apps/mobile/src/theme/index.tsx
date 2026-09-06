import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { buildTheme, type Theme } from './tokens';

export * from './tokens';

const ThemeContext = createContext<Theme>(buildTheme('dark'));

export function ThemeProvider({
  children,
  preference = 'system',
}: {
  children: React.ReactNode;
  preference?: 'system' | 'light' | 'dark';
}) {
  const system = useColorScheme();
  const mode = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
  const theme = useMemo(() => buildTheme(mode), [mode]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
