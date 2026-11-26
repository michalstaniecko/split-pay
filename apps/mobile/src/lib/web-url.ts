/**
 * Base URL of the web app that group links point to, inlined at build time from
 * `EXPO_PUBLIC_WEB_URL`. Always an https URL outside dev (`webUrlFrom` in
 * `app.config.ts`); may be unset in dev, and group links then use the app's scheme.
 */
export const webUrl: string | undefined = process.env.EXPO_PUBLIC_WEB_URL || undefined;
