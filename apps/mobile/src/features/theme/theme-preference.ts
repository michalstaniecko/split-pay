import { type ThemeFamily, type ThemeName, themeName } from '@split-pay/ui';

export type ThemeSchemePreference = 'light' | 'dark' | 'system';

/** The theme chosen in Profile. `scheme: 'system'` follows the device's light/dark setting. */
export interface ThemePreference {
  family: ThemeFamily;
  scheme: ThemeSchemePreference;
}

export const defaultThemePreference: Readonly<ThemePreference> = Object.freeze({ family: 'fresh', scheme: 'system' });

const families: readonly ThemeFamily[] = ['fresh', 'classic'];
const schemes: readonly ThemeSchemePreference[] = ['light', 'dark', 'system'];

/**
 * The theme to show. `systemScheme` is what the device reports
 * (`Appearance.getColorScheme()`); anything but 'dark' counts as light.
 */
export function resolveThemeName(preference: ThemePreference, systemScheme: string | null | undefined): ThemeName {
  const scheme =
    preference.scheme === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference.scheme;
  return themeName(preference.family, scheme);
}

export function serializeThemePreference(preference: ThemePreference): string {
  return JSON.stringify({ family: preference.family, scheme: preference.scheme });
}

/** The stored preference; missing, broken or unknown parts fall back to the defaults. */
export function parseThemePreference(stored: string | null): ThemePreference {
  let value: unknown;
  try {
    value = stored === null ? null : JSON.parse(stored);
  } catch {
    value = null;
  }
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const family = families.find((f) => f === record.family) ?? defaultThemePreference.family;
  const scheme = schemes.find((s) => s === record.scheme) ?? defaultThemePreference.scheme;
  return { family, scheme };
}
