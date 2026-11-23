import { describe, expect, it } from 'vitest';
import { activeClaims, joinChoices } from './claims';

const claim = (id: string, claimedAt: string, undoneAt: string | null = null) => ({
  id,
  memberId: `m-${id}`,
  memberName: 'Tomek',
  userId: 'u1',
  claimerName: 'Tomasz',
  claimedAt,
  undoneAt,
});

describe('activeClaims', () => {
  it('keeps only claims that were not undone, oldest first', () => {
    const a = claim('a', '2026-07-11T10:00:00.000Z');
    const b = claim('b', '2026-07-10T10:00:00.000Z', '2026-07-10T11:00:00.000Z');
    const c = claim('c', '2026-07-10T09:00:00.000Z');
    expect(activeClaims([a, b, c]).map((x) => x.id)).toEqual(['c', 'a']);
  });
});

describe('joinChoices', () => {
  const tomek = { id: 't', displayName: 'Tomek' };
  const zosia = { id: 'z', displayName: 'Zosia' };

  it('a group link offers joining as a new person and claiming any member without an account', () => {
    expect(joinChoices({ claimFor: null, claimable: [tomek, zosia] })).toEqual({
      kind: 'group',
      claimable: [tomek, zosia],
    });
    expect(joinChoices({ claimFor: null, claimable: [] })).toEqual({ kind: 'group', claimable: [] });
  });

  it('a personal claim link offers only claiming its member', () => {
    expect(joinChoices({ claimFor: 't', claimable: [tomek] })).toEqual({ kind: 'personal', member: tomek });
  });

  it('a personal claim link whose member already has an account has nothing to offer', () => {
    expect(joinChoices({ claimFor: 't', claimable: [] })).toEqual({ kind: 'personal-taken' });
  });
});
