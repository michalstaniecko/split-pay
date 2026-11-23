import { describe, expect, it } from 'vitest';
import { formatRate } from './rate-format';

describe('formatRate', () => {
  it('shows a stored rate with the locale decimal separator, unrounded', () => {
    expect(formatRate('4.3215', 'pl')).toBe('4,3215');
    expect(formatRate('0.0000587809', 'en')).toBe('0.0000587809');
    expect(formatRate('1', 'pl')).toBe('1');
  });
});
