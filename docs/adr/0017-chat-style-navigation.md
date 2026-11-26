# Chat-style navigation instead of tabs

We prototyped three mobile layouts (#34): A — a group list with bottom tabs and group tabs, B — balance first, C — a chat. We chose C. The home screen is an inbox of groups sorted by last activity; a group opens as a **Conversation** of entries shown as bubbles from their payers, with a balance banner on top and an inline composer (amount + title) at the bottom. Everything else about the group lives in **Group info**. There are no bottom tabs and no group tabs. Friends already split bills in messengers, and a chat keeps the key flow — adding an expense — one step from the inbox.

## Consequences

- **Activity** and **Profile** move to the inbox header (bell with an unread dot, the user's avatar) and open as full screens.
- **Stats** and **People** (members, members without an account, attendance, group link + QR) move into Group info, together with change history and settings (including debt simplification).
- The Conversation is ordered by **entry date**, not by creation time; backdated entries land in their day. It shows the current state only: edits and deletions are not messages, settlements and claims are.
- The web does not show the Conversation but a **group preview**, a formal statement (settle-up, balances, a table of entries). A chat reads poorly on a wide screen and needs a "this is me" choice before it makes sense, which a visitor from a link has not made; the preview works for anyone and "this is me" only highlights.
- **Form fields mirror the data model** across the app: the composer has separate amount and title fields, there is no free-text parsing into several fields.
- Issues #6–#10, #16 and #21 were written against the tab layout; their UI changes (inbox instead of the Groups list, Group info instead of the People and Stats tabs, the balance drawer instead of the Balances tab, the bell instead of the Activity tab), their domain scope does not.
