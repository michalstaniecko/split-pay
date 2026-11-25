import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalDb } from './local-db';
import { createLocalGroup } from './local-group-store';
import { groupWriteNetwork, onGroupSource } from './local-groups';
import { saveGroupList } from './local-store';
import { nodeLocalDb } from './testing/node-local-db';

// The platform's device database: a Node SQLite one here, `null` = the web (no local groups).
const device = vi.hoisted(() => ({ db: null as LocalDb | null }));
vi.mock('./local-session', () => ({ deviceDbIfAny: async () => device.db }));

const LOCAL = '00000000-0000-4000-8000-000000000001';
const SYNCED = '00000000-0000-4000-8000-000000000002';
const ME = '00000000-0000-4000-8000-0000000000e1';

const source = {
  local: async (db: LocalDb) => (db === device.db ? 'local, device database' : 'local, another database'),
  synced: async () => 'synced',
};

describe('local groups: where a group lives', () => {
  beforeEach(async () => {
    device.db = await nodeLocalDb();
    await createLocalGroup(device.db, {
      id: LOCAL,
      name: 'Pizza',
      emoji: '🍕',
      color: '#E53935',
      baseCurrency: 'EUR',
      deviceMember: { id: ME, displayName: 'Michał' },
      people: [],
    });
  });

  it("runs a local group's implementation over the device database", async () => {
    expect(await onGroupSource(LOCAL, source)).toBe('local, device database');
  });

  it("runs any other group's synced implementation", async () => {
    expect(await onGroupSource(SYNCED, source)).toBe('synced');
  });

  it('runs the synced implementation for a group from the API stored in the same database', async () => {
    const at = '2026-11-25T10:00:00.000Z';
    await saveGroupList(device.db!, [
      {
        id: SYNCED,
        name: 'Mazury',
        emoji: '⛵',
        color: '#1E88E5',
        baseCurrency: 'PLN',
        startDate: null,
        endDate: null,
        simplifyDebts: true,
        archivedAt: null,
        ownerMemberId: ME,
        createdAt: at,
        lastActivityAt: at,
        lastEntry: null,
        lastEntryByOthersAt: null,
      },
    ]);

    expect(await onGroupSource(SYNCED, source)).toBe('synced');
  });

  it('treats every group as synced on the web, which has no device database', async () => {
    device.db = null;

    expect(await onGroupSource(LOCAL, source)).toBe('synced');
  });
});

describe('local groups: network of a group write', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('runs at once, offline too, so a local group is written without a network', () => {
    expect(groupWriteNetwork.networkMode).toBe('offlineFirst');
  });

  it('pauses a write that failed offline and tries it once more when back online', () => {
    onlineManager.setOnline(false);

    expect(groupWriteNetwork.retry(0)).toBe(true);
    expect(groupWriteNetwork.retry(1)).toBe(false);
  });

  it('does not retry a write that failed online', () => {
    onlineManager.setOnline(true);

    expect(groupWriteNetwork.retry(0)).toBe(false);
  });
});
