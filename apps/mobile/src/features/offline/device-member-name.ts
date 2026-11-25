import { deviceStorage } from '@/lib/device-storage';

const KEY = 'local-groups.device-member-name';

/**
 * The device member's name (ADR-0021): asked once per device, on the first
 * local group, and used as is in each later one. Each local group keeps its own
 * copy, so renaming "Ja" in one group changes neither this nor other groups.
 */
export const deviceMemberName = {
  /** `null` until the first local group is created on this device. */
  get: (): string | null => deviceStorage.getItem(KEY) || null,
  remember: (name: string): void => deviceStorage.setItem(KEY, name.trim()),
};
