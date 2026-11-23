import { describe, expect, it } from 'vitest';
import { defaultThemePreference, parseThemePreference, resolveThemeName, serializeThemePreference } from './theme-preference';

describe('resolveThemeName', () => {
  it('uses the chosen family and scheme', () => {
    expect(resolveThemeName({ family: 'classic', scheme: 'dark' }, 'light')).toBe('classicDark');
    expect(resolveThemeName({ family: 'fresh', scheme: 'light' }, 'dark')).toBe('freshLight');
  });

  it('follows the system light/dark setting when "system" is chosen', () => {
    expect(resolveThemeName({ family: 'classic', scheme: 'system' }, 'dark')).toBe('classicDark');
    expect(resolveThemeName({ family: 'classic', scheme: 'system' }, 'light')).toBe('classicLight');
  });

  it('falls back to light when the system reports no scheme', () => {
    expect(resolveThemeName({ family: 'fresh', scheme: 'system' }, null)).toBe('freshLight');
    expect(resolveThemeName({ family: 'fresh', scheme: 'system' }, 'unspecified')).toBe('freshLight');
  });
});

describe('stored theme preference', () => {
  it('defaults to Fresh following the system', () => {
    expect(defaultThemePreference).toEqual({ family: 'fresh', scheme: 'system' });
    expect(parseThemePreference(null)).toEqual({ family: 'fresh', scheme: 'system' });
  });

  it('round-trips through storage', () => {
    const preference = { family: 'classic', scheme: 'dark' } as const;
    expect(parseThemePreference(serializeThemePreference(preference))).toEqual(preference);
  });

  it('replaces broken or unknown stored parts with the defaults', () => {
    expect(parseThemePreference('not json')).toEqual({ family: 'fresh', scheme: 'system' });
    expect(parseThemePreference('{"family":"neon","scheme":"dark"}')).toEqual({ family: 'fresh', scheme: 'dark' });
    expect(parseThemePreference('{"family":"classic","scheme":"sepia"}')).toEqual({
      family: 'classic',
      scheme: 'system',
    });
  });
});
