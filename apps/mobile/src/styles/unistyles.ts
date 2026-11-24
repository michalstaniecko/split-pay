import { themes } from '@split-pay/ui';
import { Appearance } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import {
  applyColorSchemeOverride,
  currentThemeName,
  syncUnistylesTheme,
} from '@/features/theme/theme-store';

type AppThemes = typeof themes;

declare module 'react-native-unistyles' {
  export interface UnistylesThemes extends AppThemes {}
}

// The theme chosen in Profile (Fresh/Classic × light/dark/system), saved on the device.
applyColorSchemeOverride();

StyleSheet.configure({
  themes,
  settings: {
    initialTheme: currentThemeName,
  },
});

// With "system", follow the device's light/dark setting while the app runs.
Appearance.addChangeListener(syncUnistylesTheme);
