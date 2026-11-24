import { describe, expect, it } from 'vitest';
import { GroupSettingsUpdate } from './group-settings';

describe('GroupSettingsUpdate', () => {
  it('accepts a partial change', () => {
    expect(GroupSettingsUpdate.parse({ simplifyDebts: false })).toEqual({ simplifyDebts: false });
    expect(GroupSettingsUpdate.parse({})).toEqual({});
  });

  it('rejects unknown settings', () => {
    expect(GroupSettingsUpdate.safeParse({ ownerMemberId: 'x' }).success).toBe(false);
  });
});
