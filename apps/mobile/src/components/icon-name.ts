/**
 * The Lucide icons the app uses, by Lucide's component name. Kept free of the
 * Lucide import so pure modules (and their tests) can name an icon; `Icon`
 * maps each name to its component.
 */
export const ICON_NAMES = [
  // Interface controls (both theme families).
  'Bell',
  'Ellipsis',
  'X',
  'ChevronDown',
  'ChevronRight',
  'Check',
  'Camera',
  'SendHorizontal',
  'Clock',
  'Search',
  // Classic's category glyphs.
  'ShoppingCart',
  'Utensils',
  'TrainFront',
  'Fuel',
  'BedDouble',
  'Beer',
  'Ticket',
  'Receipt',
  'HandCoins',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/** Icons that point "forward" and are mirrored in a right-to-left layout. */
export const DIRECTIONAL_ICONS: ReadonlySet<IconName> = new Set<IconName>(['ChevronRight', 'SendHorizontal']);
