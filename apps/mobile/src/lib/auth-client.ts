import { expoClient } from '@better-auth/expo/client';
import { emailOTPClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';
import { apiUrl } from './api-url';

/**
 * Better Auth client. On native, `expoClient` keeps the session cookie and a
 * session cache in SecureStore, so the user stays signed in across restarts.
 * It also sends `expo-origin: splitpay://`, which the API trusts.
 */
export const authClient = createAuthClient({
  baseURL: apiUrl,
  plugins: [
    expoClient({ scheme: 'splitpay', storagePrefix: 'splitpay', storage: SecureStore }),
    emailOTPClient(),
  ],
});
