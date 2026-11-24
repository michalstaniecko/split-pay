import { memberName } from '@split-pay/shared';

/** A member whose name is ready to show: never the removed-name marker. */
export type Named<M extends { displayName: string | null }> = Omit<M, 'displayName'> & { displayName: string };

/**
 * The group with every member named for the viewer (ADR-0019): a removed name
 * (`null` marker) reads "Usunięte konto" / "Deleted user" in `locale`.
 */
export function nameMembers<G extends { members: readonly M[] }, M extends { displayName: string | null }>(
  group: G,
  locale: string,
): Omit<G, 'members'> & { members: Named<G['members'][number]>[] } {
  return { ...group, members: group.members.map((m) => ({ ...m, displayName: memberName(m, locale) })) };
}

/**
 * "Dodał(a) …": the current name of the member who added the entry — kept
 * through account deletion (ADR-0019). `null` only when the data is missing
 * (shown as "nieznana osoba").
 */
export function addedBy(
  entry: { createdByMember: string | null },
  members: readonly { id: string; displayName: string }[],
): string | null {
  return members.find((m) => m.id === entry.createdByMember)?.displayName ?? null;
}
