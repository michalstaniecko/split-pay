import { describe, expect, it } from 'vitest';
import { canShareLinks, groupLinkUrl, joinTokenFromPath, pendingJoin, qrModules } from './group-link';

const TOKEN = 'q3Jx0_Vb-8yT2kLmNoPqRsTuVwXyZ012';

describe('groupLinkUrl', () => {
  it("uses the app's custom scheme until a web base URL is configured", () => {
    expect(groupLinkUrl(TOKEN, undefined)).toBe(`splitpay://g/${TOKEN}`);
    expect(groupLinkUrl(TOKEN, '')).toBe(`splitpay://g/${TOKEN}`);
  });

  it('uses the web base URL when configured', () => {
    expect(groupLinkUrl(TOKEN, 'https://app.example.com')).toBe(`https://app.example.com/g/${TOKEN}`);
    expect(groupLinkUrl(TOKEN, 'https://example.com/split/')).toBe(`https://example.com/split/g/${TOKEN}`);
  });
});

describe('joinTokenFromPath', () => {
  it('finds the token in an incoming group link, whatever its origin', () => {
    expect(joinTokenFromPath(`splitpay://g/${TOKEN}`)).toBe(TOKEN);
    expect(joinTokenFromPath(`https://app.example.com/g/${TOKEN}`)).toBe(TOKEN);
    expect(joinTokenFromPath(`https://example.com/split/g/${TOKEN}/?utm=x`)).toBe(TOKEN);
    expect(joinTokenFromPath(`/g/${TOKEN}`)).toBe(TOKEN);
    expect(joinTokenFromPath(groupLinkUrl(TOKEN, 'https://app.example.com'))).toBe(TOKEN);
  });

  it('ignores other links', () => {
    expect(joinTokenFromPath('splitpay://groups/123')).toBeUndefined();
    expect(joinTokenFromPath('/g/')).toBeUndefined();
    expect(joinTokenFromPath('/')).toBeUndefined();
    expect(joinTokenFromPath('https://example.com/dog/abc')).toBeUndefined();
  });
});

describe('qrModules', () => {
  it('encodes the text as a square matrix with the three finder patterns', () => {
    const modules = qrModules(`splitpay://g/${TOKEN}`);
    const size = modules.length;
    expect(size).toBeGreaterThanOrEqual(21);
    expect((size - 17) % 4).toBe(0); // QR versions are 21, 25, 29, … modules wide
    for (const row of modules) expect(row).toHaveLength(size);

    // A finder pattern: dark 7×7 ring, light ring, dark 3×3 centre.
    const finder = (top: number, start: number) =>
      [0, 1, 2, 3, 4, 5, 6].map((r) => [0, 1, 2, 3, 4, 5, 6].map((c) => modules[top + r]?.[start + c]));
    const expected = [
      [1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 1],
      [1, 0, 1, 1, 1, 0, 1],
      [1, 0, 1, 1, 1, 0, 1],
      [1, 0, 1, 1, 1, 0, 1],
      [1, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1],
    ].map((row) => row.map((v) => v === 1));
    expect(finder(0, 0)).toEqual(expected);
    expect(finder(0, size - 7)).toEqual(expected);
    expect(finder(size - 7, 0)).toEqual(expected);
  });
});

describe('pendingJoin', () => {
  it('remembers a group link opened before signing in, once', () => {
    expect(pendingJoin.take()).toBeUndefined();
    pendingJoin.remember(TOKEN);
    expect(pendingJoin.take()).toBe(TOKEN);
    expect(pendingJoin.take()).toBeUndefined();
  });
});

describe('canShareLinks', () => {
  it('shares the group link and personal claim links only while the group is not archived', () => {
    expect(canShareLinks({ archivedAt: null })).toBe(true);
    expect(canShareLinks({ archivedAt: '2026-08-01T10:00:00.000Z' })).toBe(false);
  });
});
