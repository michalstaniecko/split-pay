import { describe, expect, it } from 'vitest';
import { payoutDetailsForm, parsePayoutDetailsForm } from './payout-details-form';

describe('payoutDetailsForm', () => {
  it('shows stored details readably, empty fields for missing ones', () => {
    expect(payoutDetailsForm({ bankAccount: '61109010140000071219812874', blikPhone: null })).toEqual({
      bankAccount: '61 1090 1014 0000 0712 1981 2874',
      blikPhone: '',
    });
  });
});

describe('parsePayoutDetailsForm', () => {
  it('normalizes what the user typed', () => {
    expect(parsePayoutDetailsForm({ bankAccount: '61 1090 1014 0000 0712 1981 2874', blikPhone: '' })).toEqual({
      ok: true,
      value: { bankAccount: '61109010140000071219812874', blikPhone: null },
    });
  });

  it('lists the invalid fields', () => {
    expect(parsePayoutDetailsForm({ bankAccount: '123', blikPhone: 'abc' })).toEqual({
      ok: false,
      errors: ['bankAccount', 'blikPhone'],
    });
  });
});
