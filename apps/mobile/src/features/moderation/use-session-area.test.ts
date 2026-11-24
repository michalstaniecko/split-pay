import { createRequire } from 'node:module';
import { createElement, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { createBlockedStatusStore, type SessionArea } from './moderation';
import { syncBlockedStatus, useSessionArea } from './use-session-area';

// Server rendering runs the hook without a DOM. Effects don't run there, so
// these tests seed the store directly; `syncBlockedStatus` (the effect's body)
// is tested on its own below. The app has no @types/react-dom, hence the
// typed `require` of the one function used.
const { renderToString } = createRequire(import.meta.url)('react-dom/server') as {
  renderToString: (element: ReactElement) => string;
};

const memoryStorage = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

/** Renders the root layout's hook once and returns the area it routes to. */
function renderArea(...args: Parameters<typeof useSessionArea>): SessionArea {
  let area: SessionArea | undefined;
  function Probe() {
    area = useSessionArea(...args);
    return null;
  }
  renderToString(createElement(Probe));
  return area!;
}

describe('useSessionArea (root layout)', () => {
  it('routes a session the API reports blocked to "Konto zablokowane"', () => {
    const store = createBlockedStatusStore(memoryStorage());
    expect(renderArea({ pending: false, userId: 'u1' }, { blocked: true }, store)).toBe('blocked');
  });

  it('offline, routes a session this device last saw blocked to "Konto zablokowane"', () => {
    const store = createBlockedStatusStore(memoryStorage());
    store.remember('u1', true);
    expect(renderArea({ pending: false, userId: 'u1' }, undefined, store)).toBe('blocked');
  });

  it("the API's answer that the account is unblocked opens the app", () => {
    const store = createBlockedStatusStore(memoryStorage());
    store.remember('u1', true);
    expect(renderArea({ pending: false, userId: 'u1' }, { blocked: false }, store)).toBe('app');
  });

  it("another account's remembered block does not keep this one out", () => {
    const store = createBlockedStatusStore(memoryStorage());
    store.remember('u2', true);
    expect(renderArea({ pending: false, userId: 'u1' }, undefined, store)).toBe('app');
  });

  it('signed out → sign-in', () => {
    const store = createBlockedStatusStore(memoryStorage());
    store.remember('u1', true);
    expect(renderArea({ pending: false, userId: undefined }, undefined, store)).toBe('auth');
  });
});

describe('syncBlockedStatus (the root layout keeping the store in step)', () => {
  const signedIn = { pending: false, userId: 'u1' };

  it("remembers the API's answer that the account is blocked", () => {
    const store = createBlockedStatusStore(memoryStorage());
    syncBlockedStatus(signedIn, { blocked: true }, store);
    expect(store.isBlocked('u1')).toBe(true);
  });

  it("clears the remembered block on the API's answer that the account is unblocked", () => {
    const store = createBlockedStatusStore(memoryStorage());
    store.remember('u1', true);
    syncBlockedStatus(signedIn, { blocked: false }, store);
    expect(store.isBlocked('u1')).toBe(false);
  });

  it('offline or on an error, keeps the status this device last saw', () => {
    const store = createBlockedStatusStore(memoryStorage());
    store.remember('u1', true);
    syncBlockedStatus(signedIn, undefined, store);
    expect(store.isBlocked('u1')).toBe(true);
  });

  it('signing out forgets the remembered block', () => {
    const store = createBlockedStatusStore(memoryStorage());
    store.remember('u1', true);
    syncBlockedStatus({ pending: false, userId: undefined }, undefined, store);
    expect(store.isBlocked('u1')).toBe(false);
  });

  it('while the session is loading, forgets nothing', () => {
    const store = createBlockedStatusStore(memoryStorage());
    store.remember('u1', true);
    syncBlockedStatus({ pending: true, userId: undefined }, undefined, store);
    expect(store.isBlocked('u1')).toBe(true);
  });

  it('persists the status in device storage for the next launch', () => {
    const storage = memoryStorage();
    syncBlockedStatus(signedIn, { blocked: true }, createBlockedStatusStore(storage));
    expect(createBlockedStatusStore(storage).isBlocked('u1')).toBe(true);
  });
});
