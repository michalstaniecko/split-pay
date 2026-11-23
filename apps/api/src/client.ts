import { hc } from 'hono/client';
import type { AppType } from './app';

/** Typowany klient API współdzielony przez aplikację mobilną i www (ADR-0013). */
export const createApiClient = (baseUrl: string) => hc<AppType>(baseUrl);
export type ApiClient = ReturnType<typeof createApiClient>;
