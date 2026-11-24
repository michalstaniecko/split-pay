import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The app doesn't know anyone's gender, so Polish copy never defaults to
// masculine (or "(a)") forms — docs/SPEC.md → Language. Source messages are
// Polish, so the `msgid`s are the copy.
const catalog = readFileSync(new URL('./pl/messages.po', import.meta.url), 'utf8');
const messages = [...catalog.matchAll(/^msgid "(.*)"$/gm)].map((m) => m[1]!).filter(Boolean);

// A whole word, Polish letters included (`\b` only knows ASCII).
const word = (w: string) => new RegExp(`(?<!\\p{L})${w}(?!\\p{L})`, 'iu');

// Past-tense verbs, adjectives, participles and pronouns whose form would
// reveal (and here assume) the gender of a person.
const MASCULINE_BY_DEFAULT = [
  word('przejął'),
  word('winien'),
  word('rozliczony'),
  word('rozliczeni'),
  // Except the questions in NEUTRAL_ZAPLACIL below.
  word('zapłacił'),
  word('otrzymał'),
  word('dodał'),
  word('zapłacili'),
  word('otrzymali'),
  /\(a\)/,
  word('jednym z nich'),
  // "Ktoś zmienił…": the verb after "ktoś" is masculine.
  /(?<!\p{L})ktoś(?!\p{L})[^.]*ł(?!\p{L})/iu,
  word('każdy'),
  word('płacący'),
  word('otrzymujący'),
  word('zgłaszający'),
  word('zablokowany'),
  // "Usunięty użytkownik" / "Byli członkowie": say "Usunięte konto", and
  // "Osoby, które opuściły grupę" in lists or "Poza grupą" in the stats
  // column. Lowercase "usunięty" describes an entry ("wpis"), not a person.
  /(?<!\p{L})Usunięty(?!\p{L})/u,
  word('byli'),
];

// "Kto zapłacił" is fine: "kto" asks about anyone, not about a man. Only these
// exact messages are allowed; any other "zapłacił" still fails.
const NEUTRAL_ZAPLACIL = new Set(['Kto zapłacił', 'Kto zapłacił: {value}', 'Wybierz, kto zapłacił.']);
const isAllowed = (message: string, pattern: RegExp) =>
  pattern.source === word('zapłacił').source && NEUTRAL_ZAPLACIL.has(message);
const offending = (candidates: readonly string[], pattern: RegExp) =>
  candidates.filter((m) => pattern.test(m) && !isAllowed(m, pattern));

// Superseded copy that isn't gendered but must not come back.
const RETIRED = [
  // Expense forms ask "Kto zapłacił" (the expense already happened).
  /(?<!\p{L})kto płaci(?!\p{L})/iu,
];

describe('Polish catalog', () => {
  it('has messages to check', () => {
    expect(messages.length).toBeGreaterThan(100);
  });

  it.each(MASCULINE_BY_DEFAULT.map((pattern) => [String(pattern), pattern] as const))(
    'has no masculine-by-default form %s',
    (_, pattern) => {
      expect(offending(messages, pattern)).toEqual([]);
    },
  );

  it('allows "kto zapłacił" only in the listed questions', () => {
    const pattern = word('zapłacił');
    expect(
      offending(
        [...NEUTRAL_ZAPLACIL, '{name} zapłacił', 'Ten, kto zapłacił, jest winien mniej'],
        pattern,
      ),
    ).toEqual(['{name} zapłacił', 'Ten, kto zapłacił, jest winien mniej']);
  });

  it.each(RETIRED.map((pattern) => [String(pattern), pattern] as const))(
    'has no retired copy %s',
    (_, pattern) => {
      expect(messages.filter((m) => pattern.test(m))).toEqual([]);
    },
  );
});
