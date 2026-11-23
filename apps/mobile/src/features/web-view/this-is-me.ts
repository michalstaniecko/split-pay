import { useSyncExternalStore } from 'react';
import { deviceStorage } from '@/lib/device-storage';
import type { PublicGroup } from './public-view-query';
import { createThisIsMeStore, effectiveMe } from './web-view';

/** "This is me" choices, kept in browser storage (localStorage on web). */
export const thisIsMeStore = createThisIsMeStore(deviceStorage);

/**
 * Who the visitor is in this group ("this is me"): decides which bubbles sit
 * on the end edge and drives the balance banner. `null` = nobody chosen.
 */
export function useThisIsMe(data: Pick<PublicGroup, 'group' | 'members' | 'claimFor'>) {
  const groupId = data.group.id;
  const stored = useSyncExternalStore(thisIsMeStore.subscribe, () => thisIsMeStore.get(groupId));
  return {
    me: effectiveMe({ stored, claimFor: data.claimFor, members: data.members }),
    setMe: (memberId: string | null) => thisIsMeStore.set(groupId, memberId),
  };
}
