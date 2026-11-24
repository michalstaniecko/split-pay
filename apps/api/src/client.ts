import { type ClientRequestOptions, hc } from 'hono/client';
import type { AppType } from './app';

/**
 * Typed API client shared by the mobile app and the web view (ADR-0013).
 * Pass `headers` (may be an async function) to send the session, e.g. the
 * Better Auth cookie on native: `headers: async () => ({ cookie })`.
 */
export const createApiClient = (baseUrl: string, options?: ClientRequestOptions) =>
  hc<AppType>(baseUrl, options);
export type ApiClient = ReturnType<typeof createApiClient>;
