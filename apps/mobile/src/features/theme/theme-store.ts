import { Appearance, Platform } from 'react-native';
import { UnistylesRuntime } from 'react-native-unistyles';
import { useSyncExternalStore } from 'react';
import type { ThemeName } from '@split-pay/ui';
import { deviceStorage } from '@/lib/device-storage';
import { parseThemePreference, resolveThemeName, serializeThemePreference, type ThemePreference } from './theme-preference';

// The theme preference lives outside React so `src/styles/unistyles.ts` can
// pick the right theme before the first render (no flash of the wrong theme).
const KEY = 'theme';

let preference = parseThemePreference(deviceStorage.getItem(KEY));
const listeners = new Set<() => void>();

/** The theme to show now, given the preference and the device's light/dark setting. */
export function currentThemeName(): ThemeName {
  return resolveThemeName(preference, Appearance.getColorScheme());
}

/**
 * A fixed light/dark choice overrides the app's appearance, so native parts
 * (headers, keyboard, alerts) match the theme; 'system' lifts the override.
 */
export function applyColorSchemeOverride(): void {
  if (Platform.OS === 'web') return; // react-native-web has no override
  Appearance.setColorScheme(preference.scheme === 'system' ? 'unspecified' : preference.scheme);
}

/** Switches Unistyles to the current theme (after a preference or system change). */
export function syncUnistylesTheme(): void {
  const name = currentThemeName();
  if (UnistylesRuntime.themeName !== name) UnistylesRuntime.setTheme(name);
}

export function setThemePreference(next: ThemePreference): void {
  preference = next;
  deviceStorage.setItem(KEY, serializeThemePreference(next));
  applyColorSchemeOverride();
  syncUnistylesTheme();
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** The theme chosen in Profile (persisted on the device). */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, () => preference);
}
