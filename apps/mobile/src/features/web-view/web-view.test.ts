import { describe, expect, it, vi } from 'vitest';
import { claimBanner, createThisIsMeStore, downloadAppUrl, effectiveMe, openInAppUrl } from './web-view';

const GROUP = '7f1c2a4e-0000-4000-8000-000000000001';
const ANIA = '7f1c2a4e-0000-4000-8000-0000000000a1';
const TOMEK = '7f1c2a4e-0000-4000-8000-0000000000a2';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

describe('"this is me" store (browser storage)', () => {
  it('remembers the chosen member per group, across store instances (page reloads)', () => {
    const storage = memoryStorage();
    createThisIsMeStore(storage).set(GROUP, ANIA);

    const afterReload = createThisIsMeStore(storage);
    expect(afterReload.get(GROUP)).toBe(ANIA);
    expect(afterReload.get('another-group')).toBeUndefined();
  });

  it('forgets the choice ("none of them")', () => {
    const store = createThisIsMeStore(memoryStorage());
    store.set(GROUP, ANIA);
    store.set(GROUP, null);
    expect(store.get(GROUP)).toBeNull();
  });

  it('notifies subscribers so every open screen follows the choice', () => {
    const store = createThisIsMeStore(memoryStorage());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.set(GROUP, TOMEK);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.set(GROUP, ANIA);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('effectiveMe', () => {
  const members = [{ id: ANIA }, { id: TOMEK }];

  it('is the remembered member while they are still in the group', () => {
    expect(effectiveMe({ stored: ANIA, claimFor: null, members })).toBe(ANIA);
    expect(effectiveMe({ stored: 'gone', claimFor: null, members })).toBeNull();
  });

  it("defaults to the member a personal claim link is for until the visitor chooses", () => {
    expect(effectiveMe({ stored: undefined, claimFor: TOMEK, members })).toBe(TOMEK);
    expect(effectiveMe({ stored: ANIA, claimFor: TOMEK, members })).toBe(ANIA);
    expect(effectiveMe({ stored: null, claimFor: TOMEK, members })).toBeNull();
  });

  it('is nobody without a choice', () => {
    expect(effectiveMe({ stored: undefined, claimFor: null, members })).toBeNull();
    expect(effectiveMe({ stored: null, claimFor: null, members })).toBeNull();
  });
});

describe('downloadAppUrl', () => {
  const stores = {
    appStore: 'https://apps.apple.com/app/id1',
    playStore: 'https://play.google.com/store/apps/details?id=x',
    fallback: 'https://github.com/michalstaniecko/split-pay',
  };
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
  const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36';
  const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';

  it("picks the store of the visitor's phone", () => {
    expect(downloadAppUrl(IPHONE, stores)).toBe(stores.appStore);
    expect(downloadAppUrl(IPAD, stores)).toBe(stores.appStore);
    expect(downloadAppUrl(ANDROID, stores)).toBe(stores.playStore);
  });

  it('falls back on desktop and while a store listing is not configured', () => {
    expect(downloadAppUrl(DESKTOP, stores)).toBe(stores.fallback);
    expect(downloadAppUrl(IPHONE, { ...stores, appStore: undefined })).toBe(stores.fallback);
    expect(downloadAppUrl(ANDROID, { ...stores, playStore: '' })).toBe(stores.fallback);
  });
});

describe('openInAppUrl', () => {
  it('opens the link in the app through its deep link, landing on the same token', () => {
    expect(openInAppUrl('abc123')).toBe('splitpay://g/abc123');
    expect(openInAppUrl('a/b c')).toBe('splitpay://g/a%2Fb%20c');
  });
});

describe('claimBanner (personal claim link banner)', () => {
  const ania = { id: ANIA, displayName: 'Ania', hasAccount: true };
  const tomek = { id: TOMEK, displayName: 'Tomek', hasAccount: false };
  const members = [ania, tomek];
  const token = 'claim-token-tomek';

  it('names the member a personal claim link is for', () => {
    expect(claimBanner({ token, claimFor: TOMEK, members })?.member).toEqual(tomek);
  });

  it('offers "open in the app" with the same personal claim link', () => {
    expect(claimBanner({ token, claimFor: TOMEK, members })?.openInAppUrl).toBe('splitpay://g/claim-token-tomek');
  });

  it('is not shown for a group link', () => {
    expect(claimBanner({ token, claimFor: null, members })).toBeNull();
  });

  it('is not shown (nor "open in the app") once the member is claimed or gone', () => {
    expect(claimBanner({ token, claimFor: ANIA, members })).toBeNull();
    expect(claimBanner({ token, claimFor: 'gone', members })).toBeNull();
  });
});
