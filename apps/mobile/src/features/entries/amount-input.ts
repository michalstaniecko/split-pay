import type { MinorAmount } from '@split-pay/shared';

/**
 * Cleans what the user types into an amount field: digits and one decimal
 * separator (comma or dot, as typed), at most `digits` decimals — the
 * currency's minor digits (`minorUnitDigits`). Call on every change.
 */
export function cleanAmountInput(text: string, digits: number): string {
  let result = '';
  let separator = false;
  let decimals = 0;
  for (const char of text) {
    if (char >= '0' && char <= '9') {
      if (separator) {
        if (decimals >= digits) continue;
        decimals++;
      }
      result += char;
    } else if ((char === ',' || char === '.') && !separator) {
      // A currency without minor units: everything after the separator is dropped.
      if (digits === 0) break;
      separator = true;
      result += result === '' ? `0${char}` : char;
    }
  }
  return result;
}

/**
 * Typed amount → minor units (ADR-0003), by string arithmetic — no floats.
 * `null` when the text is not a positive amount with at most `digits` decimals.
 */
export function parseAmountInput(text: string, digits: number): MinorAmount | null {
  const match = /^(\d+)(?:[.,](\d*))?$/.exec(text.trim());
  if (!match) return null;
  const [, whole = '', fraction = ''] = match;
  if (fraction.length > digits) return null;
  const minor = Number(`${whole}${fraction.padEnd(digits, '0')}`);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}
