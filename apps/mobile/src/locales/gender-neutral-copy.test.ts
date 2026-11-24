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
];

describe('Polish catalog', () => {
  it('has messages to check', () => {
    expect(messages.length).toBeGreaterThan(100);
  });

  it.each(MASCULINE_BY_DEFAULT.map((pattern) => [String(pattern), pattern] as const))(
    'has no masculine-by-default form %s',
    (_, pattern) => {
      expect(messages.filter((m) => pattern.test(m))).toEqual([]);
    },
  );
});
