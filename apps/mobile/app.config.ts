import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * `app.json` plus the Sentry config plugin (#64), configured from the build environment:
 * SENTRY_ORG / SENTRY_PROJECT / SENTRY_URL name the Sentry project, and source maps and
 * debug symbols are uploaded only when SENTRY_AUTH_TOKEN is set. The token is read by
 * sentry-cli from the environment and never written into the config.
 * Whether Sentry reports anything at runtime depends only on EXPO_PUBLIC_SENTRY_DSN.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const { SENTRY_ORG, SENTRY_PROJECT, SENTRY_URL, SENTRY_AUTH_TOKEN } = process.env;
  return {
    ...config,
    name: config.name ?? 'split-pay',
    slug: config.slug ?? 'split-pay',
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
