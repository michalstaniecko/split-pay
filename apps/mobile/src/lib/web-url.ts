/**
 * Base URL of the web app that group links point to, inlined at build time from
 * `EXPO_PUBLIC_WEB_URL` (see `apps/mobile/.env.example`). Always set outside dev:
 * `app.config.ts` fails production builds without it. Unset in dev, group links
 * use the app's custom scheme.
 */
export const webUrl: string | undefined = process.env.EXPO_PUBLIC_WEB_URL || undefined;
