import { Category } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import { ICON_NAMES } from '../../components/icon-name';
import { categoryIcon } from './category-icon';

describe('categoryIcon', () => {
  it('keeps the emoji in Fresh, for every category and a settlement', () => {
    expect(categoryIcon('groceries', 'fresh')).toEqual({ kind: 'emoji', emoji: '🛒' });
    expect(categoryIcon('food', 'fresh')).toEqual({ kind: 'emoji', emoji: '🍕' });
    expect(categoryIcon('transport', 'fresh')).toEqual({ kind: 'emoji', emoji: '🚆' });
    expect(categoryIcon('fuel', 'fresh')).toEqual({ kind: 'emoji', emoji: '⛽' });
    expect(categoryIcon('accommodation', 'fresh')).toEqual({ kind: 'emoji', emoji: '🏠' });
    expect(categoryIcon('alcohol', 'fresh')).toEqual({ kind: 'emoji', emoji: '🍺' });
    expect(categoryIcon('entertainment', 'fresh')).toEqual({ kind: 'emoji', emoji: '🎟️' });
    expect(categoryIcon('other', 'fresh')).toEqual({ kind: 'emoji', emoji: '🧾' });
    expect(categoryIcon('settlement', 'fresh')).toEqual({ kind: 'emoji', emoji: '💸' });
  });

  it('shows a monochrome Lucide glyph in Classic, for every category and a settlement', () => {
    expect(categoryIcon('groceries', 'classic')).toEqual({ kind: 'icon', name: 'ShoppingCart' });
    expect(categoryIcon('food', 'classic')).toEqual({ kind: 'icon', name: 'Utensils' });
    expect(categoryIcon('transport', 'classic')).toEqual({ kind: 'icon', name: 'TrainFront' });
    expect(categoryIcon('fuel', 'classic')).toEqual({ kind: 'icon', name: 'Fuel' });
    expect(categoryIcon('accommodation', 'classic')).toEqual({ kind: 'icon', name: 'BedDouble' });
    expect(categoryIcon('alcohol', 'classic')).toEqual({ kind: 'icon', name: 'Beer' });
    expect(categoryIcon('entertainment', 'classic')).toEqual({ kind: 'icon', name: 'Ticket' });
    expect(categoryIcon('other', 'classic')).toEqual({ kind: 'icon', name: 'Receipt' });
    expect(categoryIcon('settlement', 'classic')).toEqual({ kind: 'icon', name: 'HandCoins' });
  });

  it('has an icon for every category of the domain, in both families', () => {
    for (const category of Category.options) {
      const fresh = categoryIcon(category, 'fresh');
      const classic = categoryIcon(category, 'classic');
      expect(fresh.kind === 'emoji' && fresh.emoji.length > 0, `${category} in Fresh`).toBe(true);
      expect(classic.kind === 'icon' && ICON_NAMES.includes(classic.name), `${category} in Classic`).toBe(true);
    }
  });
});
