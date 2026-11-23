import { z } from 'zod';

/**
 * Name a member gets when its user deletes their account (ADR-0010), per UI
 * language. It is an ordinary display name afterwards: anyone may rename it.
 */
export const DELETED_USER_NAMES = {
  pl: 'Usunięty użytkownik',
  en: 'Deleted user',
} as const;

/** The deleted user name in `locale` (language code), English when unsupported. */
export function deletedUserName(locale: string): string {
  return locale in DELETED_USER_NAMES
    ? DELETED_USER_NAMES[locale as keyof typeof DELETED_USER_NAMES]
    : DELETED_USER_NAMES.en;
}

/** Account deletion request: the UI language of the deleting user names the leftover members. */
export const AccountDeletion = z.object({ locale: z.string().min(1).max(35) });
export type AccountDeletion = z.infer<typeof AccountDeletion>;
