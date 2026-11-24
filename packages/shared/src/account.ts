import { z } from 'zod';

/**
 * What a viewer sees for a member whose user deleted their account and chose
 * to remove their name too (ADR-0019). The name is stored as a marker
 * (`displayName: null`), so each viewer reads it in their own language.
 */
export const DELETED_USER_NAMES = {
  pl: 'Usunięte konto',
  en: 'Deleted user',
} as const;

/** The deleted user name in `locale` (language code), English when unsupported. */
export function deletedUserName(locale: string): string {
  const language = locale.split('-')[0] ?? locale;
  return language in DELETED_USER_NAMES
    ? DELETED_USER_NAMES[language as keyof typeof DELETED_USER_NAMES]
    : DELETED_USER_NAMES.en;
}

/** A member's name as `locale` shows it: the removed-name marker reads "Deleted user". */
export function memberName(member: { displayName: string | null }, locale: string): string {
  return member.displayName ?? deletedUserName(locale);
}

/**
 * Account deletion request (ADR-0019). By default the user's members keep
 * their last name; `removeName` clears it too (stored as a marker).
 */
export const AccountDeletion = z.object({ removeName: z.boolean().default(false) });
export type AccountDeletion = z.infer<typeof AccountDeletion>;
