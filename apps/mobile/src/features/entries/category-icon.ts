import type { Category } from '@split-pay/shared';
import type { ThemeFamily } from '@split-pay/ui';
import type { IconName } from '@/components/icon-name';

/** What gets a category icon: an expense's category, or a settlement. */
export type CategoryIconKey = Category | 'settlement';

/** A category icon: an emoji drawn as text, or a Lucide glyph drawn by `Icon`. */
export type CategoryIconGlyph = { kind: 'emoji'; emoji: string } | { kind: 'icon'; name: IconName };

const FRESH: Record<CategoryIconKey, string> = {
  groceries: '🛒',
  food: '🍕',
  transport: '🚆',
  fuel: '⛽',
  accommodation: '🏠',
  alcohol: '🍺',
  entertainment: '🎟️',
  other: '🧾',
  settlement: '💸',
};

const CLASSIC: Record<CategoryIconKey, IconName> = {
  groceries: 'ShoppingCart',
  food: 'Utensils',
  transport: 'TrainFront',
  fuel: 'Fuel',
  accommodation: 'BedDouble',
  alcohol: 'Beer',
  entertainment: 'Ticket',
  other: 'Receipt',
  settlement: 'HandCoins',
};

/**
 * A category's icon in a theme family (SPEC "Look and feel"): Fresh keeps the
 * colourful emoji, Classic shows a monochrome Lucide glyph.
 */
export function categoryIcon(key: CategoryIconKey, family: ThemeFamily): CategoryIconGlyph {
  return family === 'classic' ? { kind: 'icon', name: CLASSIC[key] } : { kind: 'emoji', emoji: FRESH[key] };
}
