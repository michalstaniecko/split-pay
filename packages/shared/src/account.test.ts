import { describe, expect, it } from 'vitest';
import { AccountDeletion, deletedUserName, memberName } from './account';

describe('deletedUserName', () => {
  it('is "Usunięty użytkownik" in Polish and "Deleted user" in English', () => {
    expect(deletedUserName('pl')).toBe('Usunięty użytkownik');
    expect(deletedUserName('en')).toBe('Deleted user');
  });

  it('falls back to English for unsupported languages', () => {
    expect(deletedUserName('de')).toBe('Deleted user');
  });
});

describe('AccountDeletion', () => {
  it('keeps the name in the groups by default (ADR-0019)', () => {
    expect(AccountDeletion.parse({})).toEqual({ removeName: false });
  });

  it('removes the name from the groups when asked to', () => {
    expect(AccountDeletion.parse({ removeName: true })).toEqual({ removeName: true });
    expect(AccountDeletion.safeParse({ removeName: 'yes' }).success).toBe(false);
  });
});

describe('memberName', () => {
  it('is the member’s name, or "Deleted user" in the viewer’s language when it was removed', () => {
    expect(memberName({ displayName: 'Bartek' }, 'en')).toBe('Bartek');
    expect(memberName({ displayName: null }, 'pl')).toBe('Usunięty użytkownik');
    expect(memberName({ displayName: null }, 'en')).toBe('Deleted user');
  });
});
