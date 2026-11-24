import { describe, expect, it } from 'vitest';
import { activateLocale } from '../../i18n/i18n';
import { balanceRowLabel, bannerLabel } from './balance-label';

// Intl separates groups with (narrow) no-break spaces; normalise them.
const plain = (s: string) => s.replace(/[  ]/g, ' ');
const pl = { baseCurrency: 'PLN', locale: 'pl' } as const;
const en = { baseCurrency: 'PLN', locale: 'en' } as const;

describe('bannerLabel', () => {
  it('reads my balance in Polish, impersonally, with the currency name', () => {
    activateLocale('pl');
    expect(plain(bannerLabel({ kind: 'owe', amount: 4_000 }, pl))).toBe('Do oddania: 40,00 złotego polskiego');
    expect(plain(bannerLabel({ kind: 'owed', amount: 1_234_567 }, pl))).toBe('Należy ci się: 12 345,67 złotego polskiego');
    expect(bannerLabel({ kind: 'settled', amount: 0 }, pl)).toBe('Wszystko rozliczone');
  });

  it('reads my balance in English', () => {
    activateLocale('en');
    expect(bannerLabel({ kind: 'owe', amount: 4_000 }, en)).toBe('You owe 40.00 Polish zlotys');
    expect(bannerLabel({ kind: 'owed', amount: 100 }, en)).toBe('You are owed 1.00 Polish zlotys');
    expect(bannerLabel({ kind: 'settled', amount: 0 }, en)).toBe('All settled up');
  });
});

describe('balanceRowLabel', () => {
  const row = (name: string, amount: number, isMe = false) => ({ memberId: name, name, amount, isMe });

  it('reads a member balance in Polish without declining the name', () => {
    activateLocale('pl');
    expect(plain(balanceRowLabel(row('Bartek', -4_000), pl))).toBe('Bartek: do oddania 40,00 złotego polskiego');
    expect(plain(balanceRowLabel(row('Ania', 10_000), pl))).toBe('Ania: do odebrania 100,00 złotego polskiego');
    expect(balanceRowLabel(row('Tomek', 0), pl)).toBe('Tomek: rozliczono');
  });

  it('marks my own balance', () => {
    activateLocale('pl');
    expect(plain(balanceRowLabel(row('Ania', -4_000, true), pl))).toBe('Ania (Ty): do oddania 40,00 złotego polskiego');
  });

  it('reads a member balance in English', () => {
    activateLocale('en');
    expect(balanceRowLabel(row('Bartek', -4_000), en)).toBe('Bartek: owes 40.00 Polish zlotys');
    expect(balanceRowLabel(row('Ania', 10_000, true), en)).toBe('Ania (you): is owed 100.00 Polish zlotys');
    expect(balanceRowLabel(row('Tomek', 0), en)).toBe('Tomek: settled up');
  });

  it('spells out a foreign base currency', () => {
    activateLocale('en');
    expect(balanceRowLabel(row('Bartek', -2_000), { baseCurrency: 'EUR', locale: 'en' })).toBe('Bartek: owes 20.00 euros');
  });
});
