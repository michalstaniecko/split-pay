import { createElement, type ReactElement } from 'react';
// @ts-expect-error -- the app has no @types/react-dom; only `renderToString` is used.
import { renderToString as untypedRenderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createBlockedStatusStore, type SessionArea } from './moderation';
import { useSessionArea } from './use-session-area';

// Server rendering runs the hook without a DOM (effects don't run, so the
// tests seed the store directly instead of through `GET /me`'s answer).
const renderToString: (element: ReactElement) => string = untypedRenderToString;

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
