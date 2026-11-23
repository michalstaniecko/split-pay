import { describe, expect, it } from 'vitest';
import { allocate, convert, convertAllocations, minorUnitDigits, splitEvenly } from './money';

const sum = (xs: { amount: number }[]) => xs.reduce((a, x) => a + x.amount, 0);

describe('splitEvenly', () => {
  it('100 zł na 3 osoby daje 33,34 + 33,33 + 33,33', () => {
    expect(splitEvenly(10_000, ['a', 'b', 'c'])).toEqual([
      { memberId: 'a', amount: 3334 },
      { memberId: 'b', amount: 3333 },
      { memberId: 'c', amount: 3333 },
    ]);
  });

  it('jest niezależny od kolejności wejścia', () => {
    expect(splitEvenly(10_000, ['c', 'a', 'b'])).toEqual(splitEvenly(10_000, ['a', 'b', 'c']));
  });

  it('dzieli wpływ (kwotę ujemną) symetrycznie', () => {
    expect(splitEvenly(-10_000, ['a', 'b', 'c']).map((x) => x.amount)).toEqual([-3334, -3333, -3333]);
  });
});

describe('allocate', () => {
  it('dzieli według wag 2:1:1', () => {
    expect(
      allocate(1000, [
        { memberId: 'a', weight: 2 },
        { memberId: 'b', weight: 1 },
        { memberId: 'c', weight: 1 },
      ]).map((x) => x.amount),
    ).toEqual([500, 250, 250]);
  });

  it('suma udziałów zawsze równa się kwocie', () => {
    for (let total = 0; total < 500; total += 7) {
      for (let n = 1; n <= 7; n++) {
        const ids = Array.from({ length: n }, (_, i) => `m${i}`);
        expect(sum(splitEvenly(total, ids))).toBe(total);
      }
    }
  });

  it('członek z wagą 0 nie płaci nic', () => {
    expect(
      allocate(101, [
        { memberId: 'a', weight: 1 },
        { memberId: 'b', weight: 0 },
      ]),
    ).toEqual([
      { memberId: 'a', amount: 101 },
      { memberId: 'b', amount: 0 },
    ]);
  });

  it('odrzuca niepoprawne dane', () => {
    expect(() => allocate(1.5, [{ memberId: 'a', weight: 1 }])).toThrow();
    expect(() => allocate(100, [{ memberId: 'a', weight: 0.5 }])).toThrow();
    expect(() => allocate(100, [])).toThrow();
    expect(() => allocate(100, [{ memberId: 'a', weight: 0 }])).toThrow();
    expect(() =>
      allocate(100, [
        { memberId: 'a', weight: 1 },
        { memberId: 'a', weight: 1 },
      ]),
    ).toThrow();
  });
});

describe('minorUnitDigits', () => {
  it('zna liczbę miejsc po przecinku walut', () => {
    expect(minorUnitDigits('PLN')).toBe(2);
    expect(minorUnitDigits('JPY')).toBe(0);
    expect(minorUnitDigits('KWD')).toBe(3);
  });
});

describe('convert', () => {
  it('przelicza EUR → PLN z zaokrągleniem połówek od zera', () => {
    expect(convert(1000, '4.2715', 'EUR', 'PLN')).toBe(4272); // 42,715 → 42,72
    expect(convert(-1000, '4.2715', 'EUR', 'PLN')).toBe(-4272);
    expect(convert(1001, '4.2715', 'EUR', 'PLN')).toBe(4276); // 42,757…
  });

  it('uwzględnia różną liczbę miejsc po przecinku', () => {
    expect(convert(1000, '0.026', 'JPY', 'PLN')).toBe(2600); // 1000 ¥ → 26,00 zł
    expect(convert(10_000, '38.5', 'PLN', 'JPY')).toBe(3850); // 100 zł → 3850 ¥
  });

  it('ta sama waluta wymaga kursu 1', () => {
    expect(convert(123, '1', 'PLN', 'PLN')).toBe(123);
    expect(() => convert(123, '4.2', 'PLN', 'PLN')).toThrow();
  });
});

describe('convertAllocations', () => {
  it('suma po przeliczeniu równa się przeliczonej sumie', () => {
    const parts = splitEvenly(1000, ['a', 'b', 'c']); // 3,34 + 3,33 + 3,33 EUR
    const converted = convertAllocations(parts, '4.2715', 'EUR', 'PLN');
    expect(converted.reduce((a, x) => a + x.amount, 0)).toBe(convert(1000, '4.2715', 'EUR', 'PLN'));
  });
});
