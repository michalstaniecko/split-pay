import { describe, expect, it } from 'vitest';
import { settleUp } from './settle-up';
import { ANIA, BARTEK, KASIA, TOMEK, expense, settlement } from './test-fixtures';

/** A chain: Ania paid for Bartek, Bartek paid for Kasia. Tomek took part in nothing. */
const chain = [
  expense({ amount: 5_000, payers: [{ memberId: ANIA, amount: 5_000 }], split: { mode: 'equal', memberIds: [BARTEK] } }),
  expense({ amount: 5_000, payers: [{ memberId: BARTEK, amount: 5_000 }], split: { mode: 'equal', memberIds: [KASIA] } }),
];
const memberIds = [ANIA, BARTEK, KASIA, TOMEK];

describe('settleUp', () => {
  it("lists every member's balance in the given member order, settled members included", () => {
    const { balances } = settleUp(chain, { baseCurrency: 'PLN', simplifyDebts: true }, memberIds);
    expect(balances).toEqual([
      { memberId: ANIA, amount: 5_000 },
      { memberId: BARTEK, amount: 0 },
      { memberId: KASIA, amount: -5_000 },
      { memberId: TOMEK, amount: 0 },
    ]);
  });

  it('with debt simplification, suggests the fewest transfers', () => {
    const { transfers } = settleUp(chain, { baseCurrency: 'PLN', simplifyDebts: true }, memberIds);
    expect(transfers).toEqual([{ from: KASIA, to: ANIA, amount: 5_000 }]);
  });

  it('without debt simplification, everyone pays back whoever paid for them', () => {
    const { transfers } = settleUp(chain, { baseCurrency: 'PLN', simplifyDebts: false }, memberIds);
    expect(transfers).toEqual([
      { from: BARTEK, to: ANIA, amount: 5_000 },
      { from: KASIA, to: BARTEK, amount: 5_000 },
    ]);
  });

  it('suggests nothing once settlements even everyone out', () => {
    const settled = [
      ...chain,
      settlement({ amount: 5_000, from: BARTEK, to: ANIA }),
      settlement({ amount: 5_000, from: KASIA, to: BARTEK }),
    ];
    for (const simplifyDebts of [true, false]) {
      const result = settleUp(settled, { baseCurrency: 'PLN', simplifyDebts }, memberIds);
      expect(result.transfers).toEqual([]);
      expect(result.balances.every((b) => b.amount === 0)).toBe(true);
    }
  });
});
