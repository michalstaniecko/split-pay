import type { ExpoConfig } from 'expo/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import appConfig from '../../app.config';

const base: ExpoConfig = {
  name: 'Kwitz',
  slug: 'kwitz',
  ios: { bundleIdentifier: 'app.kwitz', infoPlist: { CFBundleAllowMixedLocalizations: true } },
  android: { package: 'app.kwitz', predictiveBackGestureEnabled: false },
};

const resolve = (env: Record<string, string | undefined>) => {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return appConfig({ config: base, projectRoot: '/', staticConfigPath: null, packageJsonPath: null });
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('app config: https group links', () => {
  it('associates the web host with the app for /g/* links', () => {
    const config = resolve({ NODE_ENV: 'production', EXPO_PUBLIC_WEB_URL: 'https://app.kwitz.app' });

    expect(config.ios?.associatedDomains).toEqual(['applinks:app.kwitz.app']);
    expect(config.ios?.bundleIdentifier).toBe('app.kwitz');
    expect(config.android?.intentFilters).toEqual([
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: 'app.kwitz.app', pathPrefix: '/g/' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ]);
    expect(config.android?.package).toBe('app.kwitz');
  });

  it('associates nothing in local dev', () => {
    for (const EXPO_PUBLIC_WEB_URL of [undefined, '', 'http://localhost:8081']) {
      const config = resolve({ NODE_ENV: 'development', EXPO_PUBLIC_WEB_URL });

      expect(config.ios).toEqual(base.ios);
      expect(config.android).toEqual(base.android);
    }
  });
});

describe('app config: no kwitz:// share links outside dev', () => {
  // `expo export` (web, EAS Update) and release bundles (`export:embed`) run with
  // NODE_ENV=production; without a web URL their share links would be `kwitz://g/<token>`.
  it('fails a production build without a web URL', () => {
    expect(() => resolve({ NODE_ENV: 'production', EXPO_PUBLIC_WEB_URL: undefined })).toThrow(/EXPO_PUBLIC_WEB_URL/);
    expect(() => resolve({ NODE_ENV: 'production', EXPO_PUBLIC_WEB_URL: '' })).toThrow(/EXPO_PUBLIC_WEB_URL/);
  });

  it('fails a production build with a web URL that is not a URL', () => {
    expect(() => resolve({ NODE_ENV: 'production', EXPO_PUBLIC_WEB_URL: 'app.kwitz.app' })).toThrow(
      /EXPO_PUBLIC_WEB_URL/,
    );
  });

  it('lets dev builds fall back to the app scheme', () => {
    expect(() => resolve({ NODE_ENV: 'development', EXPO_PUBLIC_WEB_URL: undefined })).not.toThrow();
  });
});
