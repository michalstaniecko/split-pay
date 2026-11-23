import type { LocalPhoto } from './photo-draft';

const pending = new Map<string, LocalPhoto>();

/**
 * The receipt photo taken with 📷 in the composer, per group, until the full
 * form that opens next saves it. Like the composer draft, it survives
 * dismissing the form (opening "+" again shows it) and lives in memory only.
 */
export const pendingReceipt = {
  get: (groupId: string): LocalPhoto | undefined => pending.get(groupId),
  set: (groupId: string, photo: LocalPhoto) => {
    pending.set(groupId, photo);
  },
  clear: (groupId: string) => {
    pending.delete(groupId);
  },
};
