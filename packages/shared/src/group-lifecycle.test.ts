import { describe, expect, it } from 'vitest';
import { canDeleteGroup, canLeaveGroup } from './group-lifecycle';

const OWNER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const group = { ownerMemberId: OWNER };

describe('canDeleteGroup', () => {
  it('lets the owner delete the group', () => {
    const members = [
      { id: OWNER, userId: 'user-ania' },
      { id: OTHER, userId: 'user-bartek' },
    ];
    expect(canDeleteGroup(group, members, 'user-ania')).toBe(true);
  });

  it('does not let another member with an account delete it', () => {
    const members = [
      { id: OWNER, userId: 'user-ania' },
      { id: OTHER, userId: 'user-bartek' },
    ];
    expect(canDeleteGroup(group, members, 'user-bartek')).toBe(false);
  });

  it('lets any member delete it when the owner member has no account (deleted account or left)', () => {
    const members = [
      { id: OWNER, userId: null },
      { id: OTHER, userId: 'user-bartek' },
    ];
    expect(canDeleteGroup(group, members, 'user-bartek')).toBe(true);
  });

  it('does not let a non-member delete it', () => {
    const members = [
      { id: OWNER, userId: null },
      { id: OTHER, userId: 'user-bartek' },
    ];
    expect(canDeleteGroup(group, members, 'user-stranger')).toBe(false);
  });

  it('follows the owner member when someone claims it', () => {
    const members = [
      { id: OWNER, userId: 'user-kasia' },
      { id: OTHER, userId: 'user-bartek' },
    ];
    expect(canDeleteGroup(group, members, 'user-kasia')).toBe(true);
    expect(canDeleteGroup(group, members, 'user-bartek')).toBe(false);
  });
});

describe('canLeaveGroup', () => {
  it('allows leaving with a zero balance only', () => {
    expect(canLeaveGroup(0)).toBe(true);
    expect(canLeaveGroup(1)).toBe(false);
    expect(canLeaveGroup(-2500)).toBe(false);
  });
});
