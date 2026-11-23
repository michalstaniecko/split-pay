import { Stack } from 'expo-router';
import { LocaleProvider } from '@/i18n/locale-provider';

export default function RootLayout() {
  return (
    <LocaleProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </LocaleProvider>
  );
}
