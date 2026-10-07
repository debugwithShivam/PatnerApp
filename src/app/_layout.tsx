import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';

export default function RootLayout() {
  return <ThemeProvider value={DefaultTheme}><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#f3f7f8' } }} /></ThemeProvider>;
}
