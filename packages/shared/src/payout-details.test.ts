import { describe, expect, it } from 'vitest';
import { formatBankAccount, hasPayoutDetails, PayoutDetails } from './payout-details';

describe('PayoutDetails', () => {
  it('stores the bank account and BLIK phone without separators', () => {
    expect(
      PayoutDetails.parse({ bankAccount: ' pl61 1090-1014 0000 0712 1981 2874 ', blikPhone: '+48 600-700 800' }),
    ).toEqual({ bankAccount: 'PL61109010140000071219812874', blikPhone: '+48600700800' });
  });

  it('treats empty fields as not given', () => {
    expect(PayoutDetails.parse({ bankAccount: '  ', blikPhone: null })).toEqual({ bankAccount: null, blikPhone: null });
  });

  it('rejects something that is not an account number or a phone number', () => {
    const result = PayoutDetails.safeParse({ bankAccount: 'abc', blikPhone: '12' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join('.'))).toEqual(['bankAccount', 'blikPhone']);
  });
});

describe('hasPayoutDetails', () => {
  it('is true when at least one detail is filled in', () => {
    expect(hasPayoutDetails({ bankAccount: null, blikPhone: '600700800' })).toBe(true);
    expect(hasPayoutDetails({ bankAccount: null, blikPhone: null })).toBe(false);
  });
});

describe('formatBankAccount', () => {
  it('groups a Polish account number as printed on bank statements', () => {
    expect(formatBankAccount('61109010140000071219812874')).toBe('61 1090 1014 0000 0712 1981 2874');
  });

  it('groups an IBAN in fours', () => {
    expect(formatBankAccount('DE89370400440532013000')).toBe('DE89 3704 0044 0532 0130 00');
  });
});
