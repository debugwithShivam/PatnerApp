import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { readAppearanceSetting } from '@/services/partner-api';

export default function RootLayout() {
  const systemScheme = useColorScheme();
  const [appearance, setAppearance] = useState<'Light' | 'Dark' | 'System'>('System');

  useEffect(() => {
    let mounted = true;
    void readAppearanceSetting().then((saved) => {
      if (mounted && saved) setAppearance(saved as any);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  const isLightTheme = appearance === 'Light' || (appearance === 'System' && systemScheme !== 'dark');
  const theme = isLightTheme ? DefaultTheme : DarkTheme;
  const backgroundColor = isLightTheme ? '#f3f7f8' : '#0b1214';

  return (
    <ThemeProvider value={theme}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor } }} />
    </ThemeProvider>
  );
}
