import { createApiClient } from '@split-pay/api/client';
import { apiUrl } from './api-url';

/**
 * Sessionless API client for the view-only web (`/public/links/:token`): the
 * group link token is the only key, no cookie is sent.
 */
export const publicApi = createApiClient(apiUrl, { init: { credentials: 'omit' } });
