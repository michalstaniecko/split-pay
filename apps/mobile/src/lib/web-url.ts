/**
 * Base URL of the web app that group links point to, inlined at build time from
 * `EXPO_PUBLIC_WEB_URL` (see `apps/mobile/.env.example`). Unset until the domain
 * is chosen (SPEC open task): group links then use the app's custom scheme.
 */
export const webUrl: string | undefined = process.env.EXPO_PUBLIC_WEB_URL || undefined;
