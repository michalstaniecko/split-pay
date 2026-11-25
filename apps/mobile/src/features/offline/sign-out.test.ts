import { describe, expect, it } from 'vitest';
import { mayDeleteCache } from './sign-out';

/** A fake outbox: `left` changes stay unsent after a sync attempt (`fails` = the attempt throws). */
function outbox(unsent: number, { left = 0, fails = false } = {}) {
  let n = unsent;
  const calls = { syncs: 0, asked: [] as number[] };
  return {
    calls,
    unsentChanges: async () => n,
    sync: async () => {
      calls.syncs += 1;
      if (fails) throw new Error('offline');
      n = left;
    },
    answering: (answer: boolean) => async (count: number) => {
      calls.asked.push(count);
      return answer;
    },
  };
}

describe('signing out: may the account cache be deleted?', () => {
  it('yes, without syncing or asking, when nothing is waiting to be sent', async () => {
    const o = outbox(0);

    expect(await mayDeleteCache({ ...o, confirmDiscard: o.answering(false) })).toBe(true);
    expect(o.calls).toEqual({ syncs: 0, asked: [] });
  });

  it('yes, without asking, once a sync sent everything', async () => {
    const o = outbox(2, { left: 0 });

    expect(await mayDeleteCache({ ...o, confirmDiscard: o.answering(false) })).toBe(true);
    expect(o.calls).toEqual({ syncs: 1, asked: [] });
  });

  it('asks about the changes still unsent after the sync, and follows the answer', async () => {
    const keep = outbox(3, { left: 1 });
    expect(await mayDeleteCache({ ...keep, confirmDiscard: keep.answering(false) })).toBe(false);
    expect(keep.calls.asked).toEqual([1]);

    const discard = outbox(3, { left: 1 });
    expect(await mayDeleteCache({ ...discard, confirmDiscard: discard.answering(true) })).toBe(true);
  });

  it('asks when the sync fails (offline)', async () => {
    const o = outbox(2, { fails: true });

    expect(await mayDeleteCache({ ...o, confirmDiscard: o.answering(false) })).toBe(false);
    expect(o.calls.asked).toEqual([2]);
  });
});
