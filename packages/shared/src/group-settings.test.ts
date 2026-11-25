import { describe, expect, it } from 'vitest';
import { availableGroupActions, GroupSettingsUpdate } from './group-settings';

describe('GroupSettingsUpdate', () => {
  it('accepts a partial change', () => {
    expect(GroupSettingsUpdate.parse({ simplifyDebts: false })).toEqual({ simplifyDebts: false });
    expect(GroupSettingsUpdate.parse({})).toEqual({});
  });

  it('rejects unknown settings', () => {
    expect(GroupSettingsUpdate.safeParse({ ownerMemberId: 'x' }).success).toBe(false);
  });
});

describe('availableGroupActions', () => {
  // ADR-0021: a local group drops everything that needs the server or other people.
  it.each([
    ['groupLink', true, false],
    ['claiming', true, false],
    ['changeHistory', true, false],
    ['archiving', true, false],
    ['tripDates', true, false],
    ['reminders', true, false],
    ['pushSettings', true, false],
    ['payoutDetails', true, false],
    ['receiptPhotos', true, false],
    ['foreignCurrencies', true, false],
    ['stats', true, false],
    ['leaving', true, false],
  ] as const)('%s: synced %s, local %s', (action, synced, local) => {
    expect(availableGroupActions({ local: false })[action]).toBe(synced);
    expect(availableGroupActions({ local: true })[action]).toBe(local);
  });

  it('has no action beyond the table above', () => {
    expect(Object.keys(availableGroupActions({ local: false })).sort()).toEqual([
      'archiving',
      'changeHistory',
      'claiming',
      'foreignCurrencies',
      'groupLink',
      'leaving',
      'payoutDetails',
      'pushSettings',
      'receiptPhotos',
      'reminders',
      'stats',
      'tripDates',
    ]);
  });
});
