import { describe, expect, it } from 'vitest';
import { AccountDeletion, deletedUserName } from './account';

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
  it('carries the language the deleted user name is written in', () => {
    expect(AccountDeletion.parse({ locale: 'pl' })).toEqual({ locale: 'pl' });
    expect(AccountDeletion.safeParse({ locale: '' }).success).toBe(false);
    expect(AccountDeletion.safeParse({}).success).toBe(false);
  });
});
