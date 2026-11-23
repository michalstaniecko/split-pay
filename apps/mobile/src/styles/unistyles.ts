import { themeName, themes } from '@split-pay/ui';
import { Appearance } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

type AppThemes = typeof themes;

declare module 'react-native-unistyles' {
  export interface UnistylesThemes extends AppThemes {}
}

StyleSheet.configure({
  themes,
  settings: {
    // TODO: theme family (fresh/classic) from user settings.
    initialTheme: () => themeName('fresh', Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'),
  },
});
