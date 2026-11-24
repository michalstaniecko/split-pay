import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Db } from './db/client';
import { startPushJob } from './push/dispatch';
import { logPushSender } from './push/sender';
import { startRateJob } from './rates/sync';
import { memoryStorage } from './storage/object-storage';
import { startPhotoRetentionJob } from './storage/retention';

/** A database that is down: every query throws. */
const downDb = new Proxy({} as Db, {
  get() {
    throw new Error('database is down');
  },
});

describe('background jobs report failed runs (#64)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rate job', async () => {
    const onError = vi.fn();
    const stop = startRateJob({
      db: downDb,
      source: { fetchDays: async () => [] },
      log: () => {},
      onError,
    });
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    stop();
  });

  it('push job', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    const stop = startPushJob({ db: downDb, sender: logPushSender, intervalMs: 1000, onError });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledOnce();
    stop();
  });

  it('photo retention job', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const stop = startPhotoRetentionJob({ db: downDb, storage: memoryStorage(), log: () => {}, onError });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onError).toHaveBeenCalledOnce();
    stop();
  });
});
