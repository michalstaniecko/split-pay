/**
 * Design tokeny. Motywy Fresh i Classic różnią się wyłącznie wartościami
 * tokenów — układ ekranów jest wspólny (patrz docs/SPEC.md → Wygląd).
 */

export interface ThemeColors {
  background: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  accent: string;
  positive: string;
  negative: string;
}

export interface Theme {
  name: ThemeName;
  family: ThemeFamily;
  scheme: ColorScheme;
  colors: ThemeColors;
  radius: { sm: number; md: number; lg: number; pill: number };
  space: (multiplier: number) => number;
  font: { sizeSm: number; sizeMd: number; sizeLg: number; sizeXl: number; weightBold: '600' | '700' | '800' };
}

export type ThemeFamily = 'fresh' | 'classic';
export type ColorScheme = 'light' | 'dark';
export type ThemeName = `${ThemeFamily}${Capitalize<ColorScheme>}`;

const space = (multiplier: number) => multiplier * 4;

const fresh = {
  family: 'fresh',
  radius: { sm: 10, md: 16, lg: 24, pill: 999 },
  space,
  font: { sizeSm: 13, sizeMd: 16, sizeLg: 20, sizeXl: 32, weightBold: '800' },
} as const;

const classic = {
  family: 'classic',
  radius: { sm: 4, md: 8, lg: 12, pill: 999 },
  space,
  font: { sizeSm: 13, sizeMd: 16, sizeLg: 19, sizeXl: 28, weightBold: '600' },
} as const;

export const themes = {
  freshLight: {
    ...fresh,
    name: 'freshLight',
    scheme: 'light',
    colors: {
      background: '#FAF8FF',
      surface: '#FFFFFF',
      border: '#E7E1F7',
      text: '#1A1033',
      textMuted: '#6B6385',
      primary: '#7C3AED',
      onPrimary: '#FFFFFF',
      accent: '#C6F432',
      positive: '#12B76A',
      negative: '#F04438',
    },
  },
  freshDark: {
    ...fresh,
    name: 'freshDark',
    scheme: 'dark',
    colors: {
      background: '#110A22',
      surface: '#1C1433',
      border: '#2E2550',
      text: '#F4F0FF',
      textMuted: '#A49CC0',
      primary: '#A78BFA',
      onPrimary: '#110A22',
      accent: '#C6F432',
      positive: '#32D583',
      negative: '#F97066',
    },
  },
  classicLight: {
    ...classic,
    name: 'classicLight',
    scheme: 'light',
    colors: {
      background: '#F7F7F5',
      surface: '#FFFFFF',
      border: '#E2E2DE',
      text: '#1C2430',
      textMuted: '#5F6B7A',
      primary: '#1F3A5F',
      onPrimary: '#FFFFFF',
      accent: '#B08D57',
      positive: '#2E7D4F',
      negative: '#B3261E',
    },
  },
  classicDark: {
    ...classic,
    name: 'classicDark',
    scheme: 'dark',
    colors: {
      background: '#121417',
      surface: '#1B1F24',
      border: '#2C323A',
      text: '#E8EAED',
      textMuted: '#9AA3AE',
      primary: '#8FB3DE',
      onPrimary: '#121417',
      accent: '#C9A86A',
      positive: '#6FBF8E',
      negative: '#E5786F',
    },
  },
} as const satisfies Record<ThemeName, Theme>;

export function themeName(family: ThemeFamily, scheme: ColorScheme): ThemeName {
  return `${family}${scheme === 'dark' ? 'Dark' : 'Light'}`;
}
