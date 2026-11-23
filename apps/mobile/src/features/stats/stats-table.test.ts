import type { GroupStats } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import { categoryBars, statsTable } from './stats-table';

const ANIA = '00000000-0000-4000-8000-000000000001';
const BARTEK = '00000000-0000-4000-8000-000000000002';
const TOMEK = '00000000-0000-4000-8000-000000000003';
const GONE = '00000000-0000-4000-8000-000000000009';

const stats: GroupStats = {
  baseCurrency: 'PLN',
  days: [
    {
      date: '2026-07-10',
      total: 3_000,
      members: [
        { memberId: ANIA, paid: 3_000, consumed: 1_500 },
        { memberId: TOMEK, paid: 0, consumed: 1_500 },
      ],
    },
    {
      date: '2026-07-11',
      total: 900,
      members: [{ memberId: GONE, paid: 900, consumed: 900 }],
    },
  ],
  members: [
    { memberId: ANIA, paid: 3_000, consumed: 1_500 },
    { memberId: TOMEK, paid: 0, consumed: 1_500 },
    { memberId: GONE, paid: 900, consumed: 900 },
  ],
  categories: [
    { category: 'accommodation', amount: 3_000 },
    { category: 'food', amount: 900 },
    { category: 'fuel', amount: -300 },
  ],
  total: 3_600,
};

describe('statsTable', () => {
  const members = [
    { id: TOMEK, displayName: 'Tomek' },
    { id: ANIA, displayName: 'Ania' },
    { id: BARTEK, displayName: 'Bartek' },
  ];

  it('has a column per member in Group info order, plus anyone else who appears in the stats', () => {
    expect(statsTable(stats, members).columns).toEqual([
      { memberId: TOMEK, name: 'Tomek' },
      { memberId: ANIA, name: 'Ania' },
      { memberId: BARTEK, name: 'Bartek' },
      { memberId: GONE, name: null },
    ]);
  });

  it('fills every day × member cell, zero where the member had nothing that day', () => {
    const table = statsTable(stats, members);
    expect(table.rows).toEqual([
      {
        date: '2026-07-10',
        total: 3_000,
        cells: [
          { paid: 0, consumed: 1_500 },
          { paid: 3_000, consumed: 1_500 },
          { paid: 0, consumed: 0 },
          { paid: 0, consumed: 0 },
        ],
      },
      {
        date: '2026-07-11',
        total: 900,
        cells: [
          { paid: 0, consumed: 0 },
          { paid: 0, consumed: 0 },
          { paid: 0, consumed: 0 },
          { paid: 900, consumed: 900 },
        ],
      },
    ]);
    expect(table.totals).toEqual({
      total: 3_600,
      cells: [
        { paid: 0, consumed: 1_500 },
        { paid: 3_000, consumed: 1_500 },
        { paid: 0, consumed: 0 },
        { paid: 900, consumed: 900 },
      ],
    });
  });
});

describe('categoryBars', () => {
  it('sizes each bar relative to the largest category, negative ones (net income) at zero', () => {
    expect(categoryBars(stats.categories)).toEqual([
      { category: 'accommodation', amount: 3_000, fraction: 1 },
      { category: 'food', amount: 900, fraction: 0.3 },
      { category: 'fuel', amount: -300, fraction: 0 },
    ]);
  });

  it('is empty without categories', () => {
    expect(categoryBars([])).toEqual([]);
  });
});
