import { describe, expect, it } from 'vitest';
import { createGroupSeenStore, groupLastSeenKey, isGroupUnread } from './group-unread';

const G1 = '00000000-0000-4000-8000-000000000001';
const G2 = '00000000-0000-4000-8000-000000000002';

describe('isGroupUnread', () => {
  it("is unread when someone else added an entry after I last opened the group", () => {
    expect(isGroupUnread('2026-07-11T12:00:01.000Z', '2026-07-11T12:00:00.000Z')).toBe(true);
    expect(isGroupUnread('2026-07-11T12:00:00.000Z', '2026-07-11T12:00:00.000Z')).toBe(false);
    expect(isGroupUnread('2026-07-11T11:00:00.000Z', '2026-07-11T12:00:00.000Z')).toBe(false);
  });

  it('only entries by others count: none (only my own) → never unread', () => {
    expect(isGroupUnread(null, '2026-07-11T12:00:00.000Z')).toBe(false);
    expect(isGroupUnread(null, null)).toBe(false);
  });

  it('never opened on this device: unread once others added anything', () => {
    expect(isGroupUnread('2026-07-11T12:00:00.000Z', null)).toBe(true);
  });
});

describe('createGroupSeenStore', () => {
  const memoryStorage = (initial: Record<string, string> = {}) => {
    const data = new Map(Object.entries(initial));
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
  };

  it('keeps one last-seen time per group, stored on the device', () => {
    const storage = memoryStorage({ [groupLastSeenKey(G1)]: '2026-07-11T12:00:00.000Z' });
    const store = createGroupSeenStore(storage);
    expect(store.get(G1)).toBe('2026-07-11T12:00:00.000Z');
    expect(store.get(G2)).toBeNull();

    store.markOpened(G2, '2026-07-12T08:00:00.000Z');
    expect(store.get(G2)).toBe('2026-07-12T08:00:00.000Z');
    expect(store.get(G1)).toBe('2026-07-11T12:00:00.000Z');
    expect(storage.data.get(groupLastSeenKey(G2))).toBe('2026-07-12T08:00:00.000Z');
    // A fresh store (app restart) reads it back.
    expect(createGroupSeenStore(storage).get(G2)).toBe('2026-07-12T08:00:00.000Z');
  });

  it('only moves forward and notifies listeners on a change', () => {
    const store = createGroupSeenStore(memoryStorage({ [groupLastSeenKey(G1)]: '2026-07-11T12:00:00.000Z' }));
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);

    store.markOpened(G1, '2026-07-11T11:00:00.000Z');
    store.markOpened(G1, 'not a date');
    expect(store.get(G1)).toBe('2026-07-11T12:00:00.000Z');
    expect(calls).toBe(0);

    store.markOpened(G1, '2026-07-12T08:00:00.000Z');
    expect(calls).toBe(1);
    unsubscribe();
    store.markOpened(G1, '2026-07-13T08:00:00.000Z');
    expect(calls).toBe(1);
  });
});
