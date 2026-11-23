import type { ActivityItem, ActivityPage, Entry } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_LAST_OPENED_KEY,
  activityTarget,
  createActivitySeenStore,
  entryItemIndex,
  flattenActivityPages,
  hasUnreadActivity,
} from './activity';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const group = { id: id(100), name: 'Mazury', emoji: '⛵', color: '#1E88E5' };
const entry = { id: id(50), kind: 'expense', deletedAt: null } as unknown as Entry;
const item = (n: number, fields: Record<string, unknown> = {}): ActivityItem =>
  ({
    id: id(n),
    groupId: group.id,
    group,
    byMe: false,
    actorMemberId: id(1),
    createdAt: '2026-07-11T12:00:00.000Z',
    undoesChangeId: null,
    undoneByChangeId: null,
    kind: 'member.rename',
    targetId: id(3),
    before: { displayName: 'A' },
    after: { displayName: 'B' },
    ...fields,
  }) as ActivityItem;

describe('hasUnreadActivity', () => {
  it('is unread when others changed something after the last opening', () => {
    expect(hasUnreadActivity('2026-07-11T12:00:01.000Z', '2026-07-11T12:00:00.000Z')).toBe(true);
    expect(hasUnreadActivity('2026-07-11T12:00:00.000Z', '2026-07-11T12:00:00.000Z')).toBe(false);
    expect(hasUnreadActivity('2026-07-11T11:00:00.000Z', '2026-07-11T12:00:00.000Z')).toBe(false);
  });

  it('never opened: unread once others changed anything', () => {
    expect(hasUnreadActivity('2026-07-11T12:00:00.000Z', null)).toBe(true);
    expect(hasUnreadActivity(null, null)).toBe(false);
    expect(hasUnreadActivity(null, '2026-07-11T12:00:00.000Z')).toBe(false);
  });
});

describe('createActivitySeenStore', () => {
  const memoryStorage = (initial: Record<string, string> = {}) => {
    const data = new Map(Object.entries(initial));
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
  };

  it('reads the stored time and only moves it forward', () => {
    const storage = memoryStorage({ [ACTIVITY_LAST_OPENED_KEY]: '2026-07-11T12:00:00.000Z' });
    const store = createActivitySeenStore(storage);
    let calls = 0;
    store.subscribe(() => calls++);
    expect(store.get()).toBe('2026-07-11T12:00:00.000Z');

    store.markOpened('2026-07-11T11:00:00.000Z');
    store.markOpened('not a date');
    expect(store.get()).toBe('2026-07-11T12:00:00.000Z');
    expect(calls).toBe(0);

    store.markOpened('2026-07-12T08:00:00.000Z');
    expect(store.get()).toBe('2026-07-12T08:00:00.000Z');
    expect(storage.data.get(ACTIVITY_LAST_OPENED_KEY)).toBe('2026-07-12T08:00:00.000Z');
    expect(calls).toBe(1);
  });

  it('starts empty on a new device', () => {
    const store = createActivitySeenStore(memoryStorage());
    expect(store.get()).toBeNull();
    const unsubscribe = store.subscribe(() => {
      throw new Error('unsubscribed listener called');
    });
    unsubscribe();
    store.markOpened('2026-07-11T12:00:00.000Z');
    expect(store.get()).toBe('2026-07-11T12:00:00.000Z');
  });
});

describe('flattenActivityPages', () => {
  it('joins pages in order, merges member names and drops repeated items', () => {
    const pages: ActivityPage[] = [
      { items: [item(3), item(2)], memberNames: { [id(1)]: 'Ania' }, nextCursor: '2' },
      { items: [item(2), item(1)], memberNames: { [id(2)]: 'Bartek' }, nextCursor: null },
    ];
    const { items, memberNames } = flattenActivityPages(pages);
    expect(items.map((i) => i.id)).toEqual([id(3), id(2), id(1)]);
    expect(memberNames).toEqual({ [id(1)]: 'Ania', [id(2)]: 'Bartek' });
  });
});

describe('activityTarget', () => {
  it('opens the entry bubble for entry changes that leave the entry in the Conversation', () => {
    for (const kind of ['entry.create', 'entry.edit', 'entry.restore'] as const) {
      expect(activityTarget(item(1, { kind, targetId: entry.id, before: entry, after: entry }))).toEqual({
        groupId: group.id,
        entryId: entry.id,
      });
    }
  });

  it('opens just the Conversation otherwise', () => {
    expect(activityTarget(item(1, { kind: 'entry.delete', targetId: entry.id, before: entry, after: entry }))).toEqual(
      { groupId: group.id },
    );
    expect(activityTarget(item(1))).toEqual({ groupId: group.id });
  });
});

describe('entryItemIndex', () => {
  const items = [
    { type: 'day' },
    { type: 'entry', entry: { id: id(1) } },
    { type: 'claim' },
    { type: 'entry', entry: { id: id(2) } },
  ];

  it('finds the bubble of an entry', () => {
    expect(entryItemIndex(items, id(2))).toBe(3);
    expect(entryItemIndex(items, id(1))).toBe(1);
  });

  it('is null without an entry or when it is not shown', () => {
    expect(entryItemIndex(items, undefined)).toBeNull();
    expect(entryItemIndex(items, id(9))).toBeNull();
  });
});
