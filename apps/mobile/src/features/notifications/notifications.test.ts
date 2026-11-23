import type { Member } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import type { TransferRow } from '../balances/balances';
import { entryItemIndex, notificationHref, nudgeButton, parsePushData } from './notifications';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const GROUP = id(100);
const ENTRY = id(500);

describe('parsePushData', () => {
  it('reads a visible notification and a silent sync push', () => {
    expect(parsePushData({ type: 'notification', groupId: GROUP, entryId: ENTRY })).toEqual({
      type: 'notification',
      groupId: GROUP,
      entryId: ENTRY,
    });
    expect(parsePushData({ type: 'sync', groupId: GROUP })).toEqual({ type: 'sync', groupId: GROUP });
  });

  it('reads the JSON string a background task receives', () => {
    expect(parsePushData({ dataString: JSON.stringify({ type: 'sync', groupId: GROUP }) })).toEqual({
      type: 'sync',
      groupId: GROUP,
    });
  });

  it('ignores anything else', () => {
    expect(parsePushData(null)).toBeNull();
    expect(parsePushData({ type: 'sync' })).toBeNull();
    expect(parsePushData({ type: 'other', groupId: GROUP })).toBeNull();
    expect(parsePushData({ dataString: 'not json' })).toBeNull();
    expect(parsePushData({ type: 'notification', groupId: GROUP, entryId: 42 })).toEqual({
      type: 'notification',
      groupId: GROUP,
    });
  });
});

describe('notificationHref', () => {
  it('opens the Conversation at the entry', () => {
    expect(notificationHref({ type: 'notification', groupId: GROUP, entryId: ENTRY })).toEqual({
      pathname: '/groups/[groupId]',
      params: { groupId: GROUP, entryId: ENTRY },
    });
    expect(notificationHref({ type: 'notification', groupId: GROUP })).toEqual({
      pathname: '/groups/[groupId]',
      params: { groupId: GROUP },
    });
  });
});

describe('entryItemIndex', () => {
  it('finds the bubble of an entry among the Conversation items', () => {
    const items = [
      { type: 'day' as const },
      { type: 'entry' as const, entry: { id: id(1) } },
      { type: 'entry' as const, entry: { id: ENTRY } },
    ];
    expect(entryItemIndex(items, ENTRY)).toBe(2);
    expect(entryItemIndex(items, id(9))).toBeNull();
  });
});

describe('nudgeButton ("Przypomnij")', () => {
  const ME = id(1);
  const BARTEK = id(2);
  const TOMEK = id(3);
  const member = (memberId: string, userId: string | null): Pick<Member, 'id' | 'userId'> => ({ id: memberId, userId });
  const members = [member(ME, id(201)), member(BARTEK, id(202)), member(TOMEK, null)];
  const transfer = (from: string, direction: TransferRow['direction']): TransferRow => ({
    key: `${from}-${ME}`,
    from,
    to: ME,
    fromName: 'x',
    toName: 'y',
    amount: 3000,
    direction,
  });
  const now = '2026-07-12T12:00:00.000Z';
  const ctx = { archived: false, members, nudges: [], now };

  it('is offered on a transfer owed to me by a member with an account', () => {
    expect(nudgeButton(transfer(BARTEK, 'toMe'), ctx)).toBe('available');
  });

  it('is hidden for members without an account, other transfers and archived groups', () => {
    expect(nudgeButton(transfer(TOMEK, 'toMe'), ctx)).toBe('hidden');
    expect(nudgeButton(transfer(BARTEK, 'others'), ctx)).toBe('hidden');
    expect(nudgeButton(transfer(BARTEK, 'toMe'), { ...ctx, archived: true })).toBe('hidden');
  });

  it('is disabled ("przypomniano dziś") until 24 h after the last nudge', () => {
    const nudges = [{ memberId: BARTEK, nudgedAt: '2026-07-12T08:00:00.000Z', nextNudgeAt: '2026-07-13T08:00:00.000Z' }];
    expect(nudgeButton(transfer(BARTEK, 'toMe'), { ...ctx, nudges })).toBe('remindedToday');
    expect(nudgeButton(transfer(BARTEK, 'toMe'), { ...ctx, nudges, now: '2026-07-13T08:00:00.000Z' })).toBe(
      'available',
    );
  });
});
