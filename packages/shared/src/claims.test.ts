import { describe, expect, it } from 'vitest';
import { ClaimMember, claimableMembers } from './claims';
import { ANIA, TOMEK, USER, member } from './test-fixtures';

describe('ClaimMember', () => {
  it('names the member to claim by id', () => {
    expect(ClaimMember.parse({ memberId: TOMEK })).toEqual({ memberId: TOMEK });
    expect(ClaimMember.safeParse({ memberId: 'tomek' }).success).toBe(false);
    expect(ClaimMember.safeParse({}).success).toBe(false);
  });
});

describe('claimableMembers', () => {
  it('lists only members without an account, in order', () => {
    const ania = { ...member(ANIA, 'Ania'), userId: USER };
    const tomek = member(TOMEK, 'Tomek');
    expect(claimableMembers([ania, tomek])).toEqual([tomek]);
    expect(claimableMembers([ania])).toEqual([]);
  });
});
