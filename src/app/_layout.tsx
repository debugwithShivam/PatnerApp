import { DarkTheme, Stack, ThemeProvider } from 'expo-router';

export default function RootLayout() {
  return <ThemeProvider value={DarkTheme}><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#070c0d' } }} /></ThemeProvider>;
}
