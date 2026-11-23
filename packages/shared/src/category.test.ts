import { describe, expect, it } from 'vitest';
import { suggestCategory } from './category';

describe('suggestCategory', () => {
  it.each([
    ['Pizza', 'food'],
    ['Obiad w restauracji', 'food'],
    ['kolacja', 'food'],
    ['Biedronka', 'groceries'],
    ['zakupy na śniadanie', 'groceries'],
    ['Groceries', 'groceries'],
    ['Paliwo', 'fuel'],
    ['Tankowanie Orlen', 'fuel'],
    ['Bilety na pociąg', 'transport'],
    ['Taxi to the airport', 'transport'],
    ['Nocleg', 'accommodation'],
    ['Airbnb Mazury', 'accommodation'],
    ['Piwo', 'alcohol'],
    ['Wino i piwa', 'alcohol'],
    ['Kino', 'entertainment'],
    ['Kajaki', 'entertainment'],
  ] as const)('%s → %s', (title, category) => {
    expect(suggestCategory(title)).toBe(category);
  });

  it('matches inflected Polish words by their stem', () => {
    expect(suggestCategory('Za pizzę')).toBe('food');
    expect(suggestCategory('noclegi')).toBe('accommodation');
  });

  it('ignores case and diacritics', () => {
    expect(suggestCategory('ŚNIADANIE')).toBe('food');
    expect(suggestCategory('sniadanie')).toBe('food');
  });

  it('matches word starts only, not the middle of a word', () => {
    // "kino" is a keyword; it must not match inside "Pokinoteka" (made-up word).
    expect(suggestCategory('Pokinoteka')).toBe('other');
  });

  it('falls back to "other"', () => {
    expect(suggestCategory('Prezent dla Kasi')).toBe('other');
    expect(suggestCategory('')).toBe('other');
    expect(suggestCategory('   ')).toBe('other');
  });
});
