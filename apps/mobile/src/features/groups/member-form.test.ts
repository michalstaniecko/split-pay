import { describe, expect, it } from 'vitest';
import { memberRows, parseMemberName } from './member-form';

const GROUP = '7f0c4f53-2a7e-4c55-9a5c-0b8f3a3f1b11';
const ANIA = '00000000-0000-4000-8000-000000000001';
const BARTEK = '00000000-0000-4000-8000-000000000002';
const TOMEK = '00000000-0000-4000-8000-000000000003';
const ANIA_USER = '00000000-0000-4000-8000-000000000101';
const BARTEK_USER = '00000000-0000-4000-8000-000000000102';

const member = (id: string, displayName: string, userId: string | null) => ({
  id,
  groupId: GROUP,
  displayName,
  userId,
  attendance: null,
});

describe('parseMemberName', () => {
  it('trims a valid name', () => {
    expect(parseMemberName('  Tomek ')).toEqual({ ok: true, displayName: 'Tomek' });
  });

  it('rejects a blank or too long name', () => {
    expect(parseMemberName('   ')).toEqual({ ok: false });
    expect(parseMemberName('x'.repeat(61))).toEqual({ ok: false });
  });
});

describe('memberRows', () => {
  const group = {
    ownerMemberId: ANIA,
    members: [member(ANIA, 'Ania', ANIA_USER), member(BARTEK, 'Bartek', BARTEK_USER), member(TOMEK, 'Tomek', null)],
  };

  it('marks the owner, me and members without an account, and who I may rename', () => {
    expect(memberRows(group, ANIA_USER)).toEqual([
      { id: ANIA, displayName: 'Ania', isOwner: true, isMe: true, withoutAccount: false, canRename: true },
      { id: BARTEK, displayName: 'Bartek', isOwner: false, isMe: false, withoutAccount: false, canRename: false },
      { id: TOMEK, displayName: 'Tomek', isOwner: false, isMe: false, withoutAccount: true, canRename: true },
    ]);
  });

  it('lets nobody be renamed by a user who is still signing in', () => {
    expect(memberRows(group, undefined).map((r) => r.canRename)).toEqual([false, false, true]);
  });

  it('in a local group, the device member is me, there is no owner and everyone can be renamed', () => {
    const local = {
      ownerMemberId: ANIA,
      deviceMemberId: ANIA,
      local: true,
      members: [member(ANIA, 'Ania', null), member(TOMEK, 'Tomek', null)],
    };
    expect(memberRows(local, undefined)).toEqual([
      { id: ANIA, displayName: 'Ania', isOwner: false, isMe: true, withoutAccount: true, canRename: true },
      { id: TOMEK, displayName: 'Tomek', isOwner: false, isMe: false, withoutAccount: true, canRename: true },
    ]);
  });
});
