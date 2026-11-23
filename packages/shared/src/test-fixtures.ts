import type { Entry, Expense, Group, Income, Member, Settlement } from './model';

export const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

// ID order = alphabetical order of names, to keep tests readable.
export const ANIA = uuid(1);
export const BARTEK = uuid(2);
export const KASIA = uuid(3);
export const TOMEK = uuid(4);
export const GROUP = uuid(100);
export const USER = uuid(200);

export const group: Group = {
  id: GROUP,
  name: 'Lake trip 2026',
  emoji: '⛵',
  color: '#7C3AED',
  baseCurrency: 'PLN',
  startDate: '2026-07-10',
  endDate: '2026-07-14',
  simplifyDebts: true,
  archivedAt: null,
};

export const member = (id: string, displayName: string, attendance: Member['attendance'] = null): Member => ({
  id,
  groupId: GROUP,
  displayName,
  userId: null,
  attendance,
});

export const members: Member[] = [
  member(ANIA, 'Ania'),
  member(BARTEK, 'Bartek'),
  member(KASIA, 'Kasia'),
  member(TOMEK, 'Tomek', { from: '2026-07-12', to: '2026-07-14' }),
];

let seq = 1000;
const meta = () => ({
  id: uuid(seq++),
  groupId: GROUP,
  version: 1,
  createdBy: USER,
  createdAt: '2026-07-10T10:00:00Z',
  updatedAt: '2026-07-10T10:00:00Z',
  deletedAt: null,
});

export const expense = (fields: Partial<Expense> & Pick<Expense, 'amount' | 'payers' | 'split'>): Expense => ({
  kind: 'expense',
  ...meta(),
  date: '2026-07-10',
  currency: 'PLN',
  rateToBase: '1',
  title: 'Groceries',
  category: 'groceries',
  receiptPhotoId: null,
  ...fields,
});

export const income = (fields: Partial<Income> & Pick<Income, 'amount' | 'recipients' | 'split'>): Income => ({
  kind: 'income',
  ...meta(),
  date: '2026-07-14',
  currency: 'PLN',
  rateToBase: '1',
  title: 'Deposit refund',
  category: 'accommodation',
  receiptPhotoId: null,
  ...fields,
});

export const settlement = (fields: Partial<Settlement> & Pick<Settlement, 'amount' | 'from' | 'to'>): Settlement => ({
  kind: 'settlement',
  ...meta(),
  date: '2026-07-14',
  currency: 'PLN',
  rateToBase: '1',
  ...fields,
});

export const sum = (xs: Iterable<number>) => [...xs].reduce((a, b) => a + b, 0);
export type { Entry };
