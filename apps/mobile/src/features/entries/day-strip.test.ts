import { describe, expect, it } from 'vitest';
import type { ConversationItem } from './conversation';
import { dayStripDays } from './day-strip';

const day = (date: string): ConversationItem => ({ type: 'day', key: `day-${date}`, date, total: 0 });
// A non-separator row; its content does not matter to the strip.
const row = (key: string) => ({ type: 'claim', key, claim: {} }) as unknown as ConversationItem;

const noDates = { startDate: null, endDate: null };

describe('dayStripDays', () => {
  it('in a group without dates lists only the days with entries, each pointing at its separator', () => {
    const items = [day('2026-07-10'), row('a'), row('b'), day('2026-07-13'), row('c')];
    expect(dayStripDays(items, noDates)).toEqual([
      { date: '2026-07-10', index: 0 },
      { date: '2026-07-13', index: 3 },
    ]);
  });

  it('in a group with dates lists every day of the range; days without entries have nowhere to jump', () => {
    const items = [day('2026-07-10'), row('a'), day('2026-07-12'), row('b')];
    expect(dayStripDays(items, { startDate: '2026-07-10', endDate: '2026-07-13' })).toEqual([
      { date: '2026-07-10', index: 0 },
      { date: '2026-07-11', index: null },
      { date: '2026-07-12', index: 2 },
      { date: '2026-07-13', index: null },
    ]);
  });

  it('in a group with dates keeps days with entries outside the range, in date order', () => {
    const items = [day('2026-07-01'), row('a'), day('2026-07-11'), row('b'), day('2026-07-20'), row('c')];
    expect(dayStripDays(items, { startDate: '2026-07-10', endDate: '2026-07-11' })).toEqual([
      { date: '2026-07-01', index: 0 },
      { date: '2026-07-10', index: null },
      { date: '2026-07-11', index: 2 },
      { date: '2026-07-20', index: 4 },
    ]);
  });
});
