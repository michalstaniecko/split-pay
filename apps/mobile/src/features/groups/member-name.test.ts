import { describe, expect, it } from 'vitest';
import { addedBy, nameMembers } from './member-name';

const bartek = { id: 'b', displayName: 'Bartek', userId: null };
const removed = { id: 'r', displayName: null, userId: null };

describe('nameMembers (ADR-0019)', () => {
  it('keeps names and shows a removed name as "Deleted user" in the viewer’s language', () => {
    const group = { name: 'Mazury', members: [bartek, removed] };

    expect(nameMembers(group, 'pl').members.map((m) => m.displayName)).toEqual(['Bartek', 'Usunięte konto']);
    expect(nameMembers(group, 'en').members.map((m) => m.displayName)).toEqual(['Bartek', 'Deleted user']);
  });

  it('keeps everything else as is', () => {
    const group = { name: 'Mazury', members: [removed] };

    expect(nameMembers(group, 'en')).toEqual({ name: 'Mazury', members: [{ id: 'r', displayName: 'Deleted user', userId: null }] });
  });
});

describe('addedBy (ADR-0019)', () => {
  const members = [
    { id: 'b', displayName: 'Bartek' },
    { id: 'r', displayName: 'Deleted user' },
  ];

  it('is the current name of the member who added the entry, with or without an account', () => {
    expect(addedBy({ createdByMember: 'b' }, members)).toBe('Bartek');
    expect(addedBy({ createdByMember: 'r' }, members)).toBe('Deleted user');
  });

  it('is unknown (null) only when the data is missing', () => {
    expect(addedBy({ createdByMember: null }, members)).toBeNull();
    expect(addedBy({ createdByMember: 'gone' }, members)).toBeNull();
  });
});
