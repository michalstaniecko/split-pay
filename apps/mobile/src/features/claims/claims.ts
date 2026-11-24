/** The fields of a claim (GET /groups/:groupId/claims) the UI needs. */
export interface ClaimLike {
  id: string;
  claimedAt: string;
  undoneAt: string | null;
}

/**
 * The claims shown as system messages in the Conversation ("Przejęcie
 * profilu Tomek: Tomek"): the Conversation shows the current state only, so undone
 * claims disappear. Oldest first.
 */
export function activeClaims<C extends ClaimLike>(claims: readonly C[]): C[] {
  return claims
    .filter((c) => c.undoneAt === null)
    .sort((a, b) => a.claimedAt.localeCompare(b.claimedAt) || a.id.localeCompare(b.id));
}

/** Undoing a claim is a write: not offered in an archived (read-only) group. */
export function canUndoClaim(group: { archivedAt: string | null }): boolean {
  return group.archivedAt === null;
}

export interface ClaimableMember {
  id: string;
  displayName: string;
}

/**
 * What the join screen offers for a link (GET /links/:token):
 * - `group` — a group link: join as a new person, or "Jesteś na tej liście?" → claim one of `claimable`;
 * - `personal` — a personal claim link: claim `member` directly.
 *
 * A personal claim link whose member already has an account acts as a group
 * link (the API then answers `claimFor: null`; this also covers a stale preview).
 */
export type JoinChoices = { kind: 'group'; claimable: ClaimableMember[] } | { kind: 'personal'; member: ClaimableMember };

export function joinChoices(preview: { claimFor: string | null; claimable: ClaimableMember[] }): JoinChoices {
  const member = preview.claimable.find((m) => m.id === preview.claimFor);
  return member ? { kind: 'personal', member } : { kind: 'group', claimable: preview.claimable };
}
