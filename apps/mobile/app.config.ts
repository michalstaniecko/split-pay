import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * `EXPO_PUBLIC_WEB_URL`, the base of shared group links and personal claim links
 * (`<web>/g/<token>`). This is the one place that enforces it: production exports
 * (`expo export` for web and EAS Update, release bundles via `export:embed`; Expo CLI
 * runs them with NODE_ENV=production) fail unless it is an https URL, so they never
 * share `kwitz://g/<token>` (opens only where the app is installed) or a dev URL such
 * as `http://localhost:8081`. Dev may leave it empty (links use `kwitz://`) or point it
 * at the Metro web view.
 */
function webUrlFrom(env: NodeJS.ProcessEnv): URL | undefined {
  const value = env.EXPO_PUBLIC_WEB_URL;
  const production = env.NODE_ENV === 'production';
  if (!value) {
    if (production) {
      throw new Error(
        'EXPO_PUBLIC_WEB_URL is required outside dev (e.g. https://app.kwitz.app): shared group links would otherwise use kwitz://.',
      );
    }
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`EXPO_PUBLIC_WEB_URL is not a URL: "${value}" (e.g. https://app.kwitz.app).`);
  }
  if (production && url.protocol !== 'https:') {
    throw new Error(`EXPO_PUBLIC_WEB_URL must be https outside dev, got "${value}" (e.g. https://app.kwitz.app).`);
  }
  return url;
}

/**
 * `app.json` plus the build environment:
 *
 * - An https `EXPO_PUBLIC_WEB_URL` (see `webUrlFrom`) has its host associated with the
 *   app for `/g/*`: iOS `associatedDomains` and an auto-verified Android intent filter.
 *   The host serves the matching `apple-app-site-association` / `assetlinks.json`
 *   (`apps/mobile/docker`). Dev on `http://localhost:8081` gets no association.
 * - The Sentry config plugin (#64): SENTRY_ORG / SENTRY_PROJECT / SENTRY_URL name the
 *   Sentry project, and source maps and debug symbols are uploaded only when
 *   SENTRY_AUTH_TOKEN is set. The token is read by sentry-cli from the environment and
 *   never written into the config. Whether Sentry reports anything at runtime depends
 *   only on EXPO_PUBLIC_SENTRY_DSN.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const { SENTRY_ORG, SENTRY_PROJECT, SENTRY_URL, SENTRY_AUTH_TOKEN } = process.env;
  const webUrl = webUrlFrom(process.env);
  const associatedHost = webUrl?.protocol === 'https:' ? webUrl.host : undefined;
  return {
    ...config,
    name: config.name ?? 'Kwitz',
    slug: config.slug ?? 'kwitz',
    ios: {
      ...config.ios,
      ...(associatedHost ? { associatedDomains: [`applinks:${associatedHost}`] } : {}),
    },
    android: {
      ...config.android,
      ...(associatedHost
        ? {
            intentFilters: [
              {
                action: 'VIEW',
                autoVerify: true,
                data: [{ scheme: 'https', host: associatedHost, pathPrefix: '/g/' }],
                category: ['BROWSABLE', 'DEFAULT'],
              },
            ],
          }
        : {}),
    },
    plugins: [
      ...(config.plugins ?? []),
      [
        '@sentry/react-native/expo',
        {
          ...(SENTRY_ORG ? { organization: SENTRY_ORG } : {}),
          ...(SENTRY_PROJECT ? { project: SENTRY_PROJECT } : {}),
          ...(SENTRY_URL ? { url: SENTRY_URL } : {}),
          disableAutoUpload: !SENTRY_AUTH_TOKEN,
        },
      ],
    ],
  };
};
