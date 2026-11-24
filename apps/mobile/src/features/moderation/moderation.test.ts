import { describe, expect, it } from 'vitest';
import { isAccountBlockedError, reportablePhoto } from './moderation';

describe('isAccountBlockedError', () => {
  it('recognises the sign-in refusal for a blocked account', () => {
    expect(isAccountBlockedError({ status: 403, code: 'ACCOUNT_BLOCKED' })).toBe(true);
    expect(isAccountBlockedError({ status: 400, code: 'INVALID_OTP' })).toBe(false);
    expect(isAccountBlockedError(null)).toBe(false);
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
