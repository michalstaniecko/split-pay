import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { deviceStorage } from '@/lib/device-storage';

const KEY = 'auth.without-account';
const listeners = new Set<() => void>();

/**
 * "Kontynuuj bez konta" (ADR-0021): the person chose to use local groups
 * without signing in. Remembered on the device, so the app opens on the inbox
 * next time too. Native only — the web has no local groups.
 */
export const withoutAccount = {
  chosen: (): boolean => Platform.OS !== 'web' && deviceStorage.getItem(KEY) === '1',
  choose(): void {
    deviceStorage.setItem(KEY, '1');
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
};

/** Whether the person chose to continue without an account on this device. */
export function useWithoutAccount(): boolean {
  return useSyncExternalStore(withoutAccount.subscribe, withoutAccount.chosen, withoutAccount.chosen);
}
