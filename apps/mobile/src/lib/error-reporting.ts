import * as Sentry from '@sentry/react-native';
import { errorReportingOptions } from './error-reporting-options';

/**
 * Starts Sentry when `EXPO_PUBLIC_SENTRY_DSN` is set (see `apps/mobile/.env.example`);
 * otherwise does nothing. Called first thing in `index.ts`. `process.env.EXPO_PUBLIC_*`
 * must be read literally here so Expo inlines it at build time.
 */
export function startErrorReporting() {
  const options = errorReportingOptions({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT,
  });
  if (options) Sentry.init(options);
}

/** Tags reports with the signed-in user's id (never email or name); `undefined` clears it. No-op when off. */
export function setErrorReportingUser(userId: string | undefined) {
  Sentry.setUser(userId ? { id: userId } : null);
}
