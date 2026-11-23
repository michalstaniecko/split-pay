import type { Category } from './model';

/**
 * Keyword stems per language, used to suggest an entry's category from its
 * title (SPEC "Adding an expense"). A stem matches the start of any word of
 * the title, so Polish inflections need only one stem ("pizz" → "pizzę",
 * "pizzy"). Stems are lower case without diacritics.
 *
 * Add a language: add a key here. Add a keyword: put it under the category;
 * keep it at least 3–4 letters so it doesn't match unrelated words.
 */
export const CATEGORY_KEYWORDS: Record<'pl' | 'en', Partial<Record<Category, readonly string[]>>> = {
  pl: {
    alcohol: ['piw', 'wino', 'wina', 'win ', 'wodk', 'whisk', 'alkohol', 'drink', 'prosecc', 'szampan', 'nalewk'],
    fuel: ['paliw', 'benzyn', 'tankow', 'diesel', 'ropa', 'orlen', 'lpg', 'gaz do auta'],
    accommodation: ['nocleg', 'hotel', 'hostel', 'apartament', 'airbnb', 'booking', 'kwater', 'pensjonat', 'domek', 'kemping', 'camping'],
    groceries: ['zakup', 'biedronk', 'lidl', 'zabk', 'kaufland', 'auchan', 'carrefour', 'netto', 'dino', 'spozyw', 'sklep'],
    food: ['pizz', 'obiad', 'kolacj', 'sniadani', 'lunch', 'restaurac', 'kebab', 'burger', 'sushi', 'lody', 'kawa', 'kawy', 'kawe', 'jedzeni', 'pierog', 'zapiekank', 'frytk', 'gofr', 'ryb'],
    entertainment: ['kino', 'kina', 'teatr', 'koncert', 'muzeum', 'bilety do', 'kajak', 'rejs', 'basen', 'wypozyczal', 'aquapark', 'kregiel', 'bilard', 'escape', 'park rozrywki', 'wstep'],
    transport: ['pociag', 'autobus', 'bus', 'taksowk', 'taxi', 'uber', 'bolt', 'parking', 'autostrad', 'prom', 'lot ', 'samolot', 'metro', 'tramwaj', 'przejazd', 'wynajem auta', 'myto'],
  },
  en: {
    alcohol: ['beer', 'wine', 'vodka', 'whisk', 'alcohol', 'drinks', 'cocktail', 'pub '],
    fuel: ['fuel', 'petrol', 'gas station', 'gasoline', 'diesel'],
    accommodation: ['hotel', 'hostel', 'apartment', 'airbnb', 'booking', 'accommodation', 'cabin', 'campsite', 'rent '],
    groceries: ['groceries', 'grocery', 'supermarket', 'shopping', 'market', 'tesco', 'aldi'],
    food: ['pizza', 'dinner', 'lunch', 'breakfast', 'restaurant', 'burger', 'sushi', 'ice cream', 'coffee', 'food', 'snack', 'takeaway'],
    entertainment: ['cinema', 'movie', 'theatre', 'theater', 'concert', 'museum', 'tickets for', 'kayak', 'cruise', 'pool', 'bowling', 'tour'],
    transport: ['train', 'bus', 'taxi', 'uber', 'bolt ', 'parking', 'toll ', 'ferry', 'flight', 'plane', 'subway', 'tram', 'car rental'],
  },
};

/**
 * Category checked first wins: alcohol before food ("piwo i pizza" is mostly
 * a bar bill), groceries before food ("zakupy na śniadanie"), entertainment
 * before transport ("bilety do kina").
 */
const PRIORITY: readonly Category[] = ['alcohol', 'fuel', 'accommodation', 'groceries', 'food', 'entertainment', 'transport'];

/** Lower case, no diacritics (ł → l too), words separated by single spaces, padded with spaces. */
function normalize(text: string): string {
  const plain = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return ` ${plain} `;
}

/**
 * Suggests a category from an entry's title — `other` when nothing matches.
 * Keywords of every language are checked, so the suggestion doesn't depend on
 * the UI language. Pure; used on send in the composer and in the full form.
 */
export function suggestCategory(title: string): Category {
  const text = normalize(title);
  if (text.trim() === '') return 'other';
  for (const category of PRIORITY) {
    for (const keywords of Object.values(CATEGORY_KEYWORDS)) {
      // A keyword matches at a word start; a trailing space in a keyword ("lot ") demands a whole word.
      if (keywords[category]?.some((keyword) => text.includes(` ${keyword}`))) return category;
    }
  }
  return 'other';
}
