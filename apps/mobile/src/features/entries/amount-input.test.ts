import { describe, expect, it } from 'vitest';
import { cleanAmountInput, parseAmountInput } from './amount-input';

describe('cleanAmountInput', () => {
  it('keeps digits and one decimal separator, comma or dot', () => {
    expect(cleanAmountInput('12,5', 2)).toBe('12,5');
    expect(cleanAmountInput('12.5', 2)).toBe('12.5');
    expect(cleanAmountInput('1 2a3', 2)).toBe('123');
    expect(cleanAmountInput('1,2,3', 2)).toBe('1,23');
  });

  it("limits decimals to the currency's minor digits", () => {
    expect(cleanAmountInput('12,345', 2)).toBe('12,34');
    expect(cleanAmountInput('12.3456', 3)).toBe('12.345');
    expect(cleanAmountInput('1500,5', 0)).toBe('1500');
  });

  it('prefixes a leading separator with 0', () => {
    expect(cleanAmountInput(',5', 2)).toBe('0,5');
  });
});

describe('parseAmountInput', () => {
  it('turns typed text into minor units without floats', () => {
    expect(parseAmountInput('12,5', 2)).toBe(1250);
    expect(parseAmountInput('12.05', 2)).toBe(1205);
    expect(parseAmountInput('0.29', 2)).toBe(29);
    expect(parseAmountInput('100', 2)).toBe(10_000);
    expect(parseAmountInput('12,', 2)).toBe(1200);
    expect(parseAmountInput('1500', 0)).toBe(1500);
    expect(parseAmountInput('1.234', 3)).toBe(1234);
  });

  it('is null for nothing, zero or too many decimals', () => {
    expect(parseAmountInput('', 2)).toBeNull();
    expect(parseAmountInput('0', 2)).toBeNull();
    expect(parseAmountInput('0,00', 2)).toBeNull();
    expect(parseAmountInput('1,234', 2)).toBeNull();
    expect(parseAmountInput('abc', 2)).toBeNull();
    expect(parseAmountInput('99999999999999999', 2)).toBeNull();
  });
});
