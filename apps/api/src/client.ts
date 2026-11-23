import { hc } from 'hono/client';
import type { AppType } from './app';

/** Typed API client shared by the mobile app and the web view (ADR-0013). */
export const createApiClient = (baseUrl: string) => hc<AppType>(baseUrl);
export type ApiClient = ReturnType<typeof createApiClient>;
