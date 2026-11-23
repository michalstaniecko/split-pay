import type { Entry } from '@split-pay/shared';
import { DetailedError } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { applyGroupChanges, enqueueCreate, readEntries } from './local-store';
import {
  classifySendError,
  discardOutbox,
  flushOutbox,
  markConflict,
  type OutboxOp,
  readOutboxState,
  retryOutbox,
  type SendOutcome,
} from './outbox';
import { nodeLocalDb } from './testing/node-local-db';

const G1 = '00000000-0000-4000-8000-000000000001';
const ANIA = '00000000-0000-4000-8000-0000000000a1';

let n = 0;
const entry = (overrides: Partial<Entry> = {}): Entry => {
  n += 1;
  const at = `2026-07-02T10:00:${String(n % 60).padStart(2, '0')}.000Z`;
  return {
    kind: 'expense',
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    groupId: G1,
    version: 1,
    createdBy: ANIA,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    date: '2026-07-02',
    title: `Wpis ${n}`,
    amount: 1_000,
    currency: 'PLN',
    rateToBase: '1',
    category: 'food',
    receiptPhotoId: null,
    payers: [{ memberId: ANIA, amount: 1_000 }],
    split: { mode: 'equal', memberIds: [ANIA] },
    ...overrides,
  } as Entry;
};

/** The server's copy of a sent entry: same content, the server's timestamps. */
const stored = (e: Entry): Entry => ({ ...e, updatedAt: '2026-07-05T00:00:00.000Z' });

/** A local database with group G1 cached, holding `entries` as synced from the server. */
async function setup(entries: Entry[] = []) {
  const db = await nodeLocalDb();
  await applyGroupChanges(db, {
    group: {
      id: G1,
      name: 'Mazury',
      emoji: '⛵',
      color: '#1E88E5',
      baseCurrency: 'PLN',
      startDate: null,
      endDate: null,
      simplifyDebts: true,
      archivedAt: null,
      ownerMemberId: ANIA,
      createdAt: '2026-07-01T00:00:00.000Z',
      lastActivityAt: '2026-07-01T00:00:00.000Z',
      members: [],
    },
    entries,
    cursor: null,
  });
  return db;
}

/** A fake transport: answers from `outcomes` by entry id (default: accepted) and records what was sent. */
function transport(outcomes: Record<string, SendOutcome | ((op: OutboxOp) => SendOutcome)> = {}) {
  const sent: string[] = [];
  const send = async (op: OutboxOp): Promise<SendOutcome> => {
    sent.push(op.entryId);
    const outcome = outcomes[op.entryId];
    if (typeof outcome === 'function') return outcome(op);
    if (outcome) return outcome;
    const entry = {
      ...op.payload,
      groupId: op.groupId,
      version: 1,
      createdBy: ANIA,
      createdAt: op.createdAt,
      updatedAt: op.createdAt,
      deletedAt: null,
    } as Entry;
    return { type: 'sent', entry: stored(entry) };
  };
  return { send, sent };
}

describe('outbox processing', () => {
  it('sends queued creates in the order they were added and clears them; the server copy replaces the local one', async () => {
    const db = await setup();
    const first = entry();
    const second = entry();
    await enqueueCreate(db, first);
    await enqueueCreate(db, second);
    expect(await readOutboxState(db, G1)).toEqual(
      new Map([
        [first.id, { change: 'create', status: 'queued', error: null, current: null }],
        [second.id, { change: 'create', status: 'queued', error: null, current: null }],
      ]),
    );
    const { send, sent } = transport({
      [first.id]: { type: 'sent', entry: stored(first) },
      [second.id]: { type: 'sent', entry: stored(second) },
    });

    const result = await flushOutbox(db, send);

    expect(sent).toEqual([first.id, second.id]);
    expect(result).toEqual({ sent: 2, stopped: false, groupIds: [G1] });
    expect((await readOutboxState(db, G1)).size).toBe(0);
    expect(await readEntries(db, G1)).toEqual([stored(first), stored(second)]);
  });

  it('sends the entry as entered (the create payload carries the client id)', async () => {
    const db = await setup();
    const e = entry({ title: 'Pizza' });
    await enqueueCreate(db, e);
    const seen: OutboxOp[] = [];
    await flushOutbox(db, async (op) => {
      seen.push(op);
      return { type: 'sent', entry: stored(e) };
    });
    expect(seen[0]).toMatchObject({ change: 'create', groupId: G1, entryId: e.id, baseVersion: null });
    expect(seen[0]?.payload).toMatchObject({ id: e.id, title: 'Pizza', kind: 'expense' });
  });

  it('stops at the first send that must wait (offline, server down) and keeps the rest queued in order', async () => {
    const db = await setup();
    const first = entry();
    const second = entry();
    await enqueueCreate(db, first);
    await enqueueCreate(db, second);
    const { send, sent } = transport({ [first.id]: { type: 'retry_later' } });

    const result = await flushOutbox(db, send);

    expect(sent).toEqual([first.id]);
    expect(result).toEqual({ sent: 0, stopped: true, groupIds: [] });
    expect([...(await readOutboxState(db, G1)).values()].map((s) => s.status)).toEqual(['queued', 'queued']);

    const retry = transport();
    await flushOutbox(db, retry.send);
    expect(retry.sent).toEqual([first.id, second.id]);
  });

  it('a refused send is marked failed (red "!") and the next ones still go', async () => {
    const db = await setup();
    const bad = entry();
    const good = entry();
    await enqueueCreate(db, bad);
    await enqueueCreate(db, good);
    const { send, sent } = transport({ [bad.id]: { type: 'failed', error: 'invalid_entry' } });

    const result = await flushOutbox(db, send);

    expect(sent).toEqual([bad.id, good.id]);
    expect(result).toEqual({ sent: 1, stopped: false, groupIds: [G1] });
    expect(await readOutboxState(db, G1)).toEqual(
      new Map([[bad.id, { change: 'create', status: 'failed', error: 'invalid_entry', current: null }]]),
    );
    // The failed entry stays visible locally until retried or discarded.
    expect((await readEntries(db, G1)).map((e) => e.id)).toEqual([bad.id, good.id]);

    const again = transport();
    await flushOutbox(db, again.send);
    expect(again.sent).toEqual([]);
  });

  it('retry puts a failed operation back in the queue', async () => {
    const db = await setup();
    const e = entry();
    await enqueueCreate(db, e);
    await flushOutbox(db, transport({ [e.id]: { type: 'failed', error: 'http_400' } }).send);

    await retryOutbox(db, e.id);
    expect((await readOutboxState(db, G1)).get(e.id)?.status).toBe('queued');

    const { send, sent } = transport();
    await flushOutbox(db, send);
    expect(sent).toEqual([e.id]);
    expect((await readOutboxState(db, G1)).size).toBe(0);
  });

  it('discarding a failed create removes the entry from this device', async () => {
    const db = await setup();
    const e = entry();
    await enqueueCreate(db, e);
    await flushOutbox(db, transport({ [e.id]: { type: 'failed', error: 'invalid_entry' } }).send);

    await discardOutbox(db, e.id);

    expect((await readOutboxState(db, G1)).size).toBe(0);
    expect(await readEntries(db, G1)).toEqual([]);
  });

  it('a version conflict keeps the server copy for the resolution sheet', async () => {
    const db = await setup();
    const e = entry();
    await enqueueCreate(db, e);
    const theirs = { ...stored(e), version: 2, title: 'Ich wersja' };
    await flushOutbox(db, transport({ [e.id]: { type: 'conflict', current: theirs } }).send);

    expect((await readOutboxState(db, G1)).get(e.id)).toEqual({
      change: 'create',
      status: 'conflict',
      error: 'version_conflict',
      current: theirs,
    });
  });

  it('an online change refused as a version conflict is recorded in the outbox (#11 → red "!")', async () => {
    const e = entry();
    const db = await setup([e]);
    const theirs = { ...e, version: 2, title: 'Ich wersja' };

    await markConflict(db, { groupId: G1, entryId: e.id, change: 'delete', baseVersion: 1, payload: null, current: theirs });
    expect((await readOutboxState(db, G1)).get(e.id)).toEqual({
      change: 'delete',
      status: 'conflict',
      error: 'version_conflict',
      current: theirs,
    });
    // A conflict is not resent; discarding it ("keep their version") clears the mark, the entry stays.
    const { send, sent } = transport();
    await flushOutbox(db, send);
    expect(sent).toEqual([]);
    await discardOutbox(db, e.id);
    expect((await readOutboxState(db, G1)).size).toBe(0);
    expect(await readEntries(db, G1)).toEqual([e]);
  });
});

describe('classifySendError', () => {
  const http = (status: number, data: unknown) =>
    new DetailedError(`${status}`, { statusCode: status, detail: { data } });

  it('network failures, 401, 408, 429 and 5xx are retried later', () => {
    expect(classifySendError(new TypeError('Network request failed'))).toEqual({ type: 'retry_later' });
    for (const status of [401, 408, 429, 500, 503]) {
      expect(classifySendError(http(status, { error: 'x' }))).toEqual({ type: 'retry_later' });
    }
  });

  it('a version conflict carries the current entry', () => {
    const current = entry({ version: 3 });
    expect(classifySendError(http(409, { error: 'version_conflict', entry: current }))).toEqual({
      type: 'conflict',
      current,
    });
  });

  it('other refusals fail with the API error code', () => {
    expect(classifySendError(http(400, { error: 'invalid_entry', issues: [] }))).toEqual({
      type: 'failed',
      error: 'invalid_entry',
    });
    expect(classifySendError(http(409, { error: 'conflict' }))).toEqual({ type: 'failed', error: 'conflict' });
    expect(classifySendError(http(404, { error: 'not_found' }))).toEqual({ type: 'failed', error: 'not_found' });
    expect(classifySendError(http(403, 'nope'))).toEqual({ type: 'failed', error: 'http_403' });
  });
});
