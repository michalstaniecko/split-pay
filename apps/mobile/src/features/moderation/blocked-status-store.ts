import { deviceStorage } from '@/lib/device-storage';
import { createBlockedStatusStore } from './moderation';

/** The last known blocked status of the account signed in on this device (#48). */
export const blockedStatus = createBlockedStatusStore(deviceStorage);
