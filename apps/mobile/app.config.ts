import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * `EXPO_PUBLIC_WEB_URL`, the base of shared group and claim links. Required outside
 * dev: `expo export` (web, EAS Update) and release bundles (`export:embed`) run with
 * NODE_ENV=production, and without it their links would fall back to `kwitz://g/<token>`,
 * which only opens for people who already have the app.
 */
function webUrlFrom(env: NodeJS.ProcessEnv): URL | undefined {
  const value = env.EXPO_PUBLIC_WEB_URL;
  if (!value) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'EXPO_PUBLIC_WEB_URL is required outside dev (e.g. https://app.kwitz.app): shared group links would otherwise use kwitz://.',
      );
    }
    return undefined;
  }
  try {
    return new URL(value);
  } catch {
    throw new Error(`EXPO_PUBLIC_WEB_URL is not a URL: "${value}" (e.g. https://app.kwitz.app).`);
  }
}

/**
 * `app.json` plus the build environment:
 *
 * - `EXPO_PUBLIC_WEB_URL` is the base of shared group and claim links (`<web>/g/<token>`),
 *   required outside dev (see `webUrlFrom`). An https host is associated with the app for `/g/*` (iOS `associatedDomains`, an
 *   auto-verified Android intent filter); the host serves the matching
 *   `apple-app-site-association` / `assetlinks.json` (`apps/mobile/docker`).
 * - The Sentry config plugin (#64): SENTRY_ORG / SENTRY_PROJECT / SENTRY_URL name the
 *   Sentry project, and source maps and debug symbols are uploaded only when
 *   SENTRY_AUTH_TOKEN is set. The token is read by sentry-cli from the environment and
 *   never written into the config. Whether Sentry reports anything at runtime depends
 *   only on EXPO_PUBLIC_SENTRY_DSN.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const { SENTRY_ORG, SENTRY_PROJECT, SENTRY_URL, SENTRY_AUTH_TOKEN } = process.env;
  const webUrl = webUrlFrom(process.env);
  // Universal links / App Links need https; local dev (`http://localhost:8081`) gets none.
  const host = webUrl?.protocol === 'https:' ? webUrl.host : undefined;
  return {
    ...config,
    name: config.name ?? 'Kwitz',
    slug: config.slug ?? 'kwitz',
    ios: {
      ...config.ios,
      ...(host ? { associatedDomains: [`applinks:${host}`] } : {}),
    },
    android: {
      ...config.android,
      ...(host
        ? {
            intentFilters: [
              {
                action: 'VIEW',
                autoVerify: true,
                data: [{ scheme: 'https', host, pathPrefix: '/g/' }],
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
