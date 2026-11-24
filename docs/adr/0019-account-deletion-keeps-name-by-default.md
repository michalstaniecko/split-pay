# Account deletion keeps the member's name by default

ADR-0010 turned a deleted account into a member without an account named "Deleted user". In practice that name hid who the person was from the friends whose balances still include them. The display name is not real identity data: the app never asks for a real name, and other members often typed it themselves. So deletion now offers two choices. **"Usuń konto"** (the default) removes the email, sign-in methods, avatar and payout details, and leaves the member in every group as a member without an account with their **last name**. **"Usuń konto i moją nazwę z grup"** does the same and also clears the name. A cleared name is stored as a marker, not as text, and each viewer sees it as "Usunięty użytkownik" / "Deleted user" in their own language.

Every entry also remembers which **member** added it, not only which user. Deleting the account no longer turns "added by" into "unknown person". It shows that member's current name.

A **blocked** user can still sign in, but only to a "Konto zablokowane" screen whose single action is account deletion. That way the right to erasure (GDPR) and Apple's in-app deletion requirement work without manual support.

## Consequences

- No masked or "anonymised" name (e.g. "T…ek"). Friends can still recognise it, so it isn't anonymisation. Any member can rename a member without an account anyway.
- The avatar is always deleted, under both options. A face identifies a person far more strongly than a name.
- A member left behind by account deletion is an ordinary member without an account. Anyone can claim it, including the same person with a new account, and the claim can be undone as usual (ADR-0007).
- "Unknown person" remains only as a fallback for missing data.
- Moderation decisions send no notifications. The blocked user learns about the block from the "Konto zablokowane" screen.

Amends [ADR-0010](./0010-account-deletion-turns-into-member-without-account.md).
