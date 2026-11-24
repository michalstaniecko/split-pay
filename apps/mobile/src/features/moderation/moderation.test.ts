import { DetailedError } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createBlockedStatusStore, isAccountBlockedResponse, reportablePhoto, sessionArea } from './moderation';

describe('sessionArea', () => {
  it('signed out → sign-in; a blocked session → only "Konto zablokowane"; otherwise the app', () => {
    expect(sessionArea(false, undefined, false)).toBe('auth');
    expect(sessionArea(true, { blocked: true }, false)).toBe('blocked');
    expect(sessionArea(true, { blocked: false }, false)).toBe('app');
  });

  it("the API's answer wins over what the device remembers", () => {
    expect(sessionArea(true, { blocked: false }, true)).toBe('app');
    expect(sessionArea(true, { blocked: true }, false)).toBe('blocked');
  });

  it('without an answer (offline, error) routes on the last known status: a blocked user never reaches the inbox', () => {
    expect(sessionArea(true, undefined, true)).toBe('blocked');
    expect(sessionArea(true, undefined, false)).toBe('app');
  });

  it('signed out → sign-in, whatever the device remembers', () => {
    expect(sessionArea(false, undefined, true)).toBe('auth');
  });
});

describe('createBlockedStatusStore', () => {
  const memoryStorage = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };

  it('remembers on the device that an account is blocked, per user', () => {
    const storage = memoryStorage();
    createBlockedStatusStore(storage).remember('u-1', true);
    const afterRestart = createBlockedStatusStore(storage);
    expect(afterRestart.isBlocked('u-1')).toBe(true);
    expect(afterRestart.isBlocked('u-2')).toBe(false);
    expect(afterRestart.isBlocked(undefined)).toBe(false);
  });

  it('forgets it when the API says the account is not blocked', () => {
    const store = createBlockedStatusStore(memoryStorage());
    store.remember('u-1', true);
    store.remember('u-1', false);
    expect(store.isBlocked('u-1')).toBe(false);
  });

  it('forgets it on sign-out', () => {
    const storage = memoryStorage();
    const store = createBlockedStatusStore(storage);
    store.remember('u-1', true);
    store.forget();
    expect(store.isBlocked('u-1')).toBe(false);
    expect(createBlockedStatusStore(storage).isBlocked('u-1')).toBe(false);
  });

  it('notifies subscribers when the status changes', () => {
    const store = createBlockedStatusStore(memoryStorage());
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    store.remember('u-1', true);
    store.remember('u-1', true);
    store.forget();
    unsubscribe();
    store.remember('u-1', true);
    expect(calls).toBe(2);
  });
});

describe('isAccountBlockedResponse', () => {
  const failed = (statusCode: number, data: unknown) =>
    new DetailedError(`${statusCode}`, { statusCode, detail: { data, statusText: '' } });

  it('recognises the API refusing a blocked session', () => {
    expect(isAccountBlockedResponse(failed(403, { error: 'account_blocked' }))).toBe(true);
    expect(isAccountBlockedResponse(failed(403, { error: 'forbidden' }))).toBe(false);
    expect(isAccountBlockedResponse(failed(401, { error: 'unauthorized' }))).toBe(false);
    expect(isAccountBlockedResponse(new Error('network'))).toBe(false);
  });
});

describe('reportablePhoto', () => {
  it('is the avatar of someone else; my own avatar and members without one are not reportable', () => {
    const avatars = new Map([
      ['m-ania', { photoId: 'p-ania', url: 'u1' }],
      ['m-me', { photoId: 'p-me', url: 'u2' }],
    ]);
    expect(reportablePhoto(avatars, { id: 'm-ania', isMe: false })).toBe('p-ania');
    expect(reportablePhoto(avatars, { id: 'm-me', isMe: true })).toBeNull();
    expect(reportablePhoto(avatars, { id: 'm-bartek', isMe: false })).toBeNull();
    expect(reportablePhoto(undefined, { id: 'm-ania', isMe: false })).toBeNull();
  });
});
