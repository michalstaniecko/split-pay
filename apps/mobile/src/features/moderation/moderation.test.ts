import { DetailedError } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { isAccountBlockedResponse, reportablePhoto, sessionArea } from './moderation';

describe('sessionArea', () => {
  it('signed out → sign-in; a blocked session → only "Konto zablokowane"; otherwise the app', () => {
    expect(sessionArea(false, undefined)).toBe('auth');
    expect(sessionArea(true, { blocked: true })).toBe('blocked');
    expect(sessionArea(true, { blocked: false })).toBe('app');
  });

  it('shows the app while the API has not answered yet (offline: the cache stays usable)', () => {
    expect(sessionArea(true, undefined)).toBe('app');
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
