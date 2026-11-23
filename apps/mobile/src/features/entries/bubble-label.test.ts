import { describe, expect, it } from 'vitest';
import { activateLocale } from '../../i18n/i18n';
import { payersBubbleLabel } from './bubble-label';

const pizza = { kind: 'expense', title: 'Pizza', amount: '90,00 zł', date: '10 lipca 2026' } as const;

describe('payersBubbleLabel', () => {
  it('names every payer in Polish, with the amount, title, date and my share', () => {
    activateLocale('pl');
    expect(payersBubbleLabel({ ...pizza, payerNames: ['Kasia', 'Ania', 'Bartek'], myShare: '30,00 zł' })).toBe(
      'Kasia, Ania i Bartek zapłacili 90,00 zł za Pizza, 10 lipca 2026. Twój udział 30,00 zł.',
    );
    expect(payersBubbleLabel({ ...pizza, payerNames: ['Kasia', 'Ania'], myShare: null })).toBe(
      'Kasia i Ania zapłacili 90,00 zł za Pizza, 10 lipca 2026.',
    );
    expect(payersBubbleLabel({ ...pizza, payerNames: ['Kasia', 'Ania', 'Bartek', 'Ola', 'Tomek'], myShare: null })).toBe(
      'Kasia, Ania, Bartek, Ola i Tomek zapłacili 90,00 zł za Pizza, 10 lipca 2026.',
    );
  });

  it('reads an income as received', () => {
    activateLocale('pl');
    expect(
      payersBubbleLabel({ ...pizza, kind: 'income', title: 'Kaucja', payerNames: ['Kasia', 'Ania'], myShare: '-45,00 zł' }),
    ).toBe('Kasia i Ania otrzymali 90,00 zł za Kaucja, 10 lipca 2026. Twój udział -45,00 zł.');
  });

  it('names every payer in English', () => {
    activateLocale('en');
    const en = { ...pizza, amount: 'PLN 90.00', date: 'July 10, 2026' };
    expect(payersBubbleLabel({ ...en, payerNames: ['Kasia', 'Ania', 'Bartek'], myShare: 'PLN 30.00' })).toBe(
      'Kasia, Ania and Bartek paid PLN 90.00 for Pizza, July 10, 2026. Your share PLN 30.00.',
    );
    expect(payersBubbleLabel({ ...en, kind: 'income', payerNames: ['Kasia', 'Ania'], myShare: null })).toBe(
      'Kasia and Ania received PLN 90.00 for Pizza, July 10, 2026.',
    );
  });

  it('a single payer is named alone', () => {
    activateLocale('en');
    expect(payersBubbleLabel({ ...pizza, amount: 'PLN 90.00', date: 'July 10, 2026', payerNames: ['Kasia'], myShare: null })).toBe(
      'Kasia paid PLN 90.00 for Pizza, July 10, 2026.',
    );
  });
});
