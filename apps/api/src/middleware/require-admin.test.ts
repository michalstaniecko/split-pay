import { describe, expect, it } from 'vitest';
import { isAdminEmail, parseAdminEmails } from './require-admin';

describe('ADMIN_EMAILS', () => {
  it('is a comma-separated, case-insensitive allowlist; unset = no admins', () => {
    const admins = parseAdminEmails(' Mod@Example.com, ,ops@example.com ');
    expect(admins).toEqual(['mod@example.com', 'ops@example.com']);
    expect(isAdminEmail(admins, 'MOD@example.com')).toBe(true);
    expect(isAdminEmail(admins, 'ania@example.com')).toBe(false);
    expect(parseAdminEmails(undefined)).toEqual([]);
  });
});
