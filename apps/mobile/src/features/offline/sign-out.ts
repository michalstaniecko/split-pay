/**
 * Signing out deletes the account's cache (SPEC "Local groups"; local groups
 * stay in the device database), and with it the outbox. Changes the server
 * doesn't have yet are never lost silently: they are sent first, and whatever
 * still can't be sent (offline, refused, in conflict) is discarded only after
 * the user confirms.
 */
export async function mayDeleteCache({
  unsentChanges,
  sync,
  confirmDiscard,
}: {
  /** How many changes are still in the outbox. */
  unsentChanges: () => Promise<number>;
  /** Tries to send the outbox. */
  sync: () => Promise<void>;
  /** Asks whether to sign out anyway and lose `count` changes. */
  confirmDiscard: (count: number) => Promise<boolean>;
}): Promise<boolean> {
  if ((await unsentChanges()) === 0) return true;
  await sync().catch(() => undefined);
  const left = await unsentChanges();
  return left === 0 || confirmDiscard(left);
}
