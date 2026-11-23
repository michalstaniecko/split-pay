import { createApiClient } from '@split-pay/api/client';
import { apiUrl } from './api-url';
import { authClient } from './auth-client';

/**
 * Typed API client. Every request carries the session cookie that
 * `expoClient` keeps in SecureStore; `credentials: 'omit'` stops fetch from
 * replacing that manual cookie header.
 */
export const api = createApiClient(apiUrl, {
  headers: async (): Promise<Record<string, string>> => {
    const cookie = await authClient.getCookie();
    return cookie ? { cookie } : {};
  },
  init: { credentials: 'omit' },
});
