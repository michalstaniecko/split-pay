# split-pay — product specification

> `split-pay` is a working name. The final name and domain are an open task (see [Open tasks](#open-tasks)).
> Domain vocabulary: [GLOSSARY.md](../GLOSSARY.md). Key architecture decisions: [docs/adr/](./adr/).

## Goal

A mobile app (iOS + Android) for splitting expenses between friends — from a single bill ("pizza on Friday") to a multi-day **trip** where someone else does the shared shopping every day. The app splits expenses automatically, shows who spent how much on each day and computes the minimum number of transfers needed to settle up.

Not every participant will install the app — hence **members without an account**, whose expenses are entered by others, and a view-only **web interface**.

## Product character

- A public product in the App Store and Google Play, but the MVP is designed for "friends" scale — no building scalability up front.
- From the start we meet store and EU law requirements: privacy policy, terms of service (DSA — reporting procedure), in-app account deletion, content reporting.
- Free, no ads. Support via GitHub Sponsors — link **only on the web and in the README**, not in the mobile app (review rejection risk, [ADR-0011](./adr/0011-github-sponsors-outside-the-app.md)). In the app, an "About" section without a clickable payment link. AdMob possibly in the future, behind a feature flag.
- A simple feature flags mechanism in the code from the start, so paid features/ads can be added without a rebuild.

## Domain model (summary)

- The only container is a **Group** with an optional date range. A group with dates = a trip; without dates = e.g. a shared flat. A **quick bill** is a group with a single expense, created from one sheet in a single step ([ADR-0002](./adr/0002-group-as-the-only-container.md)).
- A group has **members** — with or without an account. Any member can add a member without an account; later someone can **claim** them ([ADR-0007](./adr/0007-members-without-account-and-claiming.md)).
- On a trip every member has an **attendance** (one or more ranges of days — a member can leave and come back). The default split of an expense covers the members present on the expense's date.
- A group contains **expenses**, **incomes** and **settlements**.

## Data model

Confirmed decisions about the shapes in `packages/shared` (the source of truth for the split logic, [ADR-0016](./adr/0016-split-spec-as-source-of-truth.md)).

- **Attendance** is a non-empty list of day ranges, or `null` = present for the whole trip ([ADR-0018](./adr/0018-attendance-as-a-list-of-ranges.md)). A range is `{ from, to }` — local calendar dates (`YYYY-MM-DD`), inclusive on both ends, `from <= to`. Only the canonical form is accepted: sorted by `from`, no overlapping and no touching ranges (`1–3` + `4–5` is stored as `1–5`), at least one range. `normalizeAttendance` turns any list of ranges (e.g. from the per-day grid) into that form; the UI calls it before saving. Attendance is not checked against the trip dates — days outside the trip are allowed and the UI clips them for display.
- **Presence and default participants**: a member is present on a date when their attendance is `null` or some range contains the date. The default split participants are resolved to a `memberIds` list when the entry is created; later attendance changes do not touch existing entries (ADR-0016). If nobody is present on the entry's date, the default split covers all members.
- **Added by**: an entry stores the member who added it (as well as the user), so "added by" survives account deletion and shows that member's current name ([ADR-0019](./adr/0019-account-deletion-keeps-name-by-default.md)).
- **Shares mode** weights are integers 1–1000. A "half portion" is expressed as a ratio (1:2). A member with no share is simply not listed.
- **Income** has a `recipients` list (who received the money) instead of `payers`.
- **Settlement** carries `currency` and a frozen `rateToBase` like other entries, so it can be in a foreign currency.
- **Categories**: `groceries, food, transport, fuel, accommodation, alcohol, entertainment, other`. Category is required in the model, with `other` as the default; "optional" means the UI doesn't force a choice.
- **Daily stats**: an income reduces the recipient's `paid` and the participants' `consumed` on its date. Invariant: Σ(paid − consumed) over all days = balance excluding settlements.
- **Pairwise settle-up** (debt simplification off) with multiple payers allocates each consumer's share among the payers in proportion to what each paid.
- **Remainders**: leftover minor units are assigned by largest remainder, ties broken by ascending member id — deterministic.
- **Rates**: an entry in the base currency must have rate exactly 1. The rate is stored as a decimal string, conversion uses BigInt, and rounding is half away from zero ([ADR-0003](./adr/0003-amounts-in-minor-units.md), ADR-0016).
- **Archived group** is fully read-only: no adding, editing or deleting entries, settlements included. Unarchive to change anything.

## Permissions

- Every group member can add, edit and delete any expense, income and settlement, and rename any member without an account. A member with an account can be renamed only by its own user. No roles ([ADR-0008](./adr/0008-no-roles-full-change-history.md)).
- Every change goes into the **change history** (who, what, when) with the ability to undo.
- The **owner** has only one extra permission: permanently deleting the group.

## Expenses and splitting

### Amount model

- Amounts are integers in the currency's smallest unit (grosze/cents; supports currencies with 0 and 3 decimal places). Zero floats ([ADR-0003](./adr/0003-amounts-in-minor-units.md)).
- The division remainder (e.g. 100 PLN / 3) is assigned deterministically (e.g. by member ID order) — identical results on the phone, on the web and on the server.
- All split and settlement logic consists of pure functions in `packages/shared`, the most heavily tested part of the system.

### Expense

- Fields: title, amount, currency, date, category (optional), **list of payers with amounts**, **list of shares**, optional receipt photo.
- Multiple payers are in the data model from the start; in the UI one payer by default, "multiple payers" behind an advanced option ([ADR-0004](./adr/0004-expense-with-payers-and-shares-lists.md)).

### Split modes (MVP)

1. **Equal** among selected members (default: those present on the expense's date).
2. **Exact amounts**.
3. **Shares / weights** (e.g. 2:1:1).
4. **Common + personal**: the total amount minus personal items assigned to specific people, the rest split equally (e.g. "Tomek's personal items: 24 PLN").

Percentages — no (they are shares in another form). Splitting by receipt line items (OCR) — v2.

### Income

A reversed expense: someone received money belonging to several people (deposit refund, sale of a shared item).

### Categories

A fixed, translated list with icons (food, transport, accommodation, alcohol, fuel, other…). Optional in the UI (no forced choice); "other" by default or a suggestion based on the title. Every entry still has a category in the data model — see [Data model](#data-model). Custom categories per group — v2.

### Currencies

- A group has a **base currency**; an expense can be in any currency.
- The rate is **frozen** when the expense is added, and can be edited manually.
- A single rate source: the ECB via Frankfurter (self-hostable). The server fetches rates once a day and caches them ([ADR-0014](./adr/0014-single-exchange-rate-source-ecb.md)).
- Offline: the last known rate from the phone's cache.

## Settle-up

- Each member's **balance** in the group's base currency.
- **Debt simplification** (minimum number of transfers) enabled by default, toggle in Group info → settings.
- A **settlement** is recorded as a separate operation type.
- Optional **payout details** in the profile (bank account number, BLIK phone number) — visible only to members of shared groups, with a "copy" button. No payment integration.

## Statistics

- A **days × people** table: how much each person spent (paid) and consumed (sum of shares) on each day.
- Breakdown by category. Incomes reduce their category's total; a category totalling 0 is hidden.
- Members who left the group are shown together in a "Byli członkowie" ("Former members") column.
- Stats refresh when the screen is opened again (no realtime in the MVP).

## Members without an account, invitations, sharing

- A **group link** (secret token) sent via the system share sheet (WhatsApp, Messenger, SMS…) + a **QR code** to show in person. No sending emails/SMS from the server in the MVP ([ADR-0009](./adr/0009-sharing-via-link.md)).
- The link is a universal link / app link:
  - app installed → join screen: "Jesteś jednym z nich?" ("Are you one of them?" — a list of members without an account) or "Dołącz jako nowa osoba" ("Join as a new person");
  - no app → **web preview** + a "download the app" button.
- **Claiming** a member without an account: assigns the whole history to the account. The other members get a notification ("Przejęcie profilu Tomek: Tomek" — "Tomek profile claimed by Tomek"), and anyone can undo it — from the long-press menu on that system message or from the change history.
- Optionally a **personal claim link** for a specific member without an account ("Send Tomek his link"). Without the app it opens the same read-only web view of the whole group as the group link (it reveals nothing more), with that member highlighted: "To Twój profil — przejmij go w aplikacji".
- The group link can be **revoked** and a new one generated.

## Web interface

- The same Expo app with a web target (Expo Router), in SPA mode (`web.output: "single"`) — Unistyles does not work with static rendering without additional SSR configuration, and SEO is not needed.
- Access via the group link, without logging in. The same layout as the app, read-only: the **Conversation** with the balance banner and drawer (no composer, no edit menu; the drawer shows transfers without "Oddaj", "Przypomnij" or "Inna spłata").
- The header opens a limited **Group info**: members and Stats only (no group link, settings or change history).
- A "this is me" option — choosing a member, remembered in the browser. It decides which bubbles sit on the end edge and drives the balance banner ("how much I owe").
- **Entry detail** on the web: the same sheet without the receipt photo, the change history link and "Edytuj".
- **No photos and no editing.**
- Link previews (Open Graph) for messengers — a simple API endpoint.
- This is where (along with the README) the GitHub Sponsors link lives.

## Photos

- Only: a **receipt photo** on an expense and a user **avatar**. A group has an emoji + color instead of a cover. No trip gallery.
- Storage: **Hetzner Object Storage** (S3-compatible), private bucket ([ADR-0006](./adr/0006-private-photos-on-hetzner-object-storage.md)).
- Upload directly from the phone via a presigned URL; the API only issues the URLs.
- On the phone: downscaling (e.g. 1600 px), compression, EXIF stripping (including GPS).
- Access only for group members via short-lived signed URLs. Logged-out web visitors do not see photos.
- Limits: file size, number of photos per expense, daily limit per account. MVP values (`PHOTO_LIMITS` in `@split-pay/shared`): 3 MB per photo, 5 receipt uploads per entry (retakes count; an entry shows one receipt), 50 uploads per account in 24 hours. Receipts are downscaled to 1600 px, avatars to 512 px.
- A "Report" button on a photo, an admin panel for reviewing reports, account blocking. Moderation decisions send no notifications to the reporter or the blocked user. A blocked user can still sign in, but sees only a "Konto zablokowane" screen whose single action is account deletion ([ADR-0019](./adr/0019-account-deletion-keeps-name-by-default.md)).
- Retention: receipt photos deleted one year (365 days) after the group is archived, by a daily job; it also removes photos of deleted groups and uploads never attached to an entry or set as avatar within a day. Avatars are deleted with the account.
- CSAM scanning: **none in the MVP**; apply for Microsoft PhotoDNA at the public store launch.

## Group and account lifecycle

- **"Opuść grupę"** in Group info, above archive / delete. You cannot leave a group with a non-zero balance (warning + block). Leaving keeps your member as a member without an account (same name), so entries and balances stay intact and it can be claimed again.
- A group can be **archived** (read-only) and unarchived by any member. In an archived group only leaving, permanent deletion, revoking the group link and the notifications toggle still work; everything else requires unarchiving.
- Only the owner can permanently delete a group. Ownership follows the owner's member (claiming it makes you the owner). If the owner member has no account — the owner deleted their account or left — every member may delete the group.
- **Account deletion** (Apple requirement, GDPR) offers two choices ([ADR-0010](./adr/0010-account-deletion-turns-into-member-without-account.md), [ADR-0019](./adr/0019-account-deletion-keeps-name-by-default.md)):
  - **"Usuń konto"** (default): email, sign-in methods, avatar and payout details are removed; in every group the user becomes an ordinary member without an account with their **last name**.
  - **"Usuń konto i moją nazwę z grup"**: the same, and the name is cleared. A cleared name is stored as a marker, not text, and each viewer sees "Usunięty użytkownik" / "Deleted user" in their own language.
  - Either way, other people's expenses and balances remain, any member can rename the member, and it can be claimed again. No masked names (e.g. "T…ek").

## Offline

([ADR-0005](./adr/0005-offline-outbox-and-delta-sync.md))

- **Adding** expenses offline: every member (IDs generated on the phone — UUID — so adding causes no conflicts).
- **Editing / deleting** offline: only expenses you added yourself. Others' expenses are read-only offline.
- Every expense has a version number; on conflict the server does not overwrite, the user chooses "keep my / their version".
- Local SQLite (expo-sqlite + Drizzle) as a persistent cache + operation queue (outbox). Sync: send the outbox, then pull changes since `updatedAt` (delta sync per group).

## Notifications and refreshing

- Push via Expo Push (APNs + FCM): a new expense I take part in, editing/deleting such an expense, a settlement in my favor, a manual "nudge" about a balance.
- Notification grouping ("Kasia added 3 expenses").
- Can be disabled globally and per group.
- No realtime (WebSocket/SSE) in the MVP: refresh on entering a screen, pull-to-refresh, silent pushes triggering sync.

## Look and feel

- Two themes: **Fresh** (youthful: vivid colors, larger corner radii, emoji, micro-animations) and **Classic** (subdued), each light and dark — 4 variants.
- Toggle per user. The same screen layout in both themes — they differ only in tokens.
- Custom, minimalist components. RTL-safe styles (`start`/`end`, not `left`/`right`) from day one.
- **Form fields mirror the data model** — one field per value, across the whole app. No free-text parsing into several fields ([ADR-0017](./adr/0017-chat-style-navigation.md)).
- Own bubbles: Fresh — accent fill with on-accent text; Classic — tinted surface with a border. Category icons: emoji in Fresh, monochrome glyphs in Classic (token-mapped).
- All bubble text and pill colour pairs pass WCAG AA (4.5:1) in all 4 variants, checked by a test in `packages/ui`. Screen readers read a bubble as one element; Dynamic Type up to the largest size (amounts never truncate).

## Language

- MVP: **PL and EN**; any other system language falls back to EN. Eventually at least the 15 most popular languages (excluding Russian).
- ICU MessageFormat (plural forms), `Intl` for amounts and dates, Lingui (message extraction into PO catalogs).
- RTL tested when the first RTL language is added.
- Code, names and documentation in English; UI copy is Polish-first with i18n.
- **Gender-neutral copy**: the app doesn't know anyone's gender, so Polish copy uses impersonal or neutral forms everywhere ("Przejęcie profilu Tomek: Kasia", "Do oddania: 20 zł", "Rozliczono"), never masculine-by-default verbs or adjectives ("przejął", "jesteś winien", "rozliczony"). Names are never declined — they go after a colon or in the nominative, as in the change history ("Dołączenie do grupy: Kasia").
- System permission prompts (camera, photo library) are translated too (PL + EN, via `locales` in `app.json`).

## Navigation and screens

Expo Router, chat-style layout — no bottom tabs, no group tabs ([ADR-0017](./adr/0017-chat-style-navigation.md)).

**Inbox** (home)

- Groups sorted by **last activity** (latest entry created/edited; deleting or restoring an entry doesn't move the group); the preview shows the most recently added entry. Archived groups in a collapsed "Zarchiwizowane" section at the bottom.
- Unread: bold row + dot when others added entries since I last opened the group; no counters. "Last seen" stored locally on the device in the MVP.
- Search ("Szukaj grup i wydatków"): group names and entry titles across all groups; an entry result opens the Conversation scrolled to that bubble, highlighted. Runs locally on SQLite, so it works offline and needs no API endpoint.
- Header: bell → **Activity** (feed of changes from all groups); avatar → **Profile** (theme, language, payout details, notifications, account deletion). Both full screens.
- Activity unread: the device stores when Activity was last opened; the bell shows a dot when others changed something since then.
- **"Nowy"** → sheet: **Szybki rachunek** or **Nowa grupa** (name, emoji/colour, optional dates).
- **Szybki rachunek** sheet: amount, title and "Z kim" (names as chips, each becomes a member without an account). Creates a group named after the title, with a 🧾 icon and a random colour, and its single expense: paid by me, equal split, dated today. In the inbox it looks like any other group. The currency defaults to the device region's currency (PLN if unknown) and can be changed in the sheet; no per-user default currency setting.

**Conversation** (group screen)

- Entries as bubbles from their payers, ordered by **entry date**, then creation time within a day. Opens at the bottom (newest); sticky day separators with the group's daily total (net: incomes reduce it; hidden when ≤ 0); tapping a separator opens a day strip to jump to a day; virtualized list.
- Day strip: a group with dates shows every day of the range (days without entries greyed out); a group without dates shows only days with entries. A new entry outside the viewport → scroll to it and highlight briefly.
- Current state only: edited bubbles marked "edytowano"; edits and deletions are not messages. System messages only for settlements and claims.
- Bubble side: end edge when I am among the payers (income: the recipients), start edge otherwise; mirrors in RTL. Multiple payers: "Kasia + 2", avatar of the largest payer.
- Bubble content: title (max 2 lines), amount (foreign currency: original large, base "≈" small), category icon, receipt thumbnail, "twój udział …"; income → "↓ Wpływ" and the positive colour. Tap → entry detail.
- **Entry detail** — a read-only sheet: title, category, date, amount (entry currency + base currency with the rate), payers with amounts, every member's share and the split mode, receipt photo, who added it and when, "edytowano" with a link to the entry's change history. "Edytuj" opens the full form.
- Long-press: Edytuj, Usuń, Historia, Kopiuj kwotę. After Usuń a "Cofnij" snackbar restores the just-deleted entry; older changes are undone from the change history.
- Outbox state: 🕓 while queued, nothing once synced, red **!** on failure or conflict → retry or "keep my / their version".
- Push notifications and Activity items open the Conversation scrolled to the bubble, highlighted.
- **Balance banner** on top → **drawer** with balances and suggested transfers. My transfer: **"Oddaj"** → recipient's payout details with copy buttons, editable prefilled amount, "Zapisz spłatę" (posts a settlement message). A transfer owed to me: **"Przypomnij"** (nudge) — hidden for members without an account (no push); once per 24 h per member and group, until then disabled with "przypomniano dziś". **"Inna spłata"** at the bottom of the drawer opens the same sheet with from / to / amount pickers, for a settlement outside the suggested transfers.
- Archived group: the composer is replaced by a "Grupa zarchiwizowana" bar; long-press offers only Historia and Kopiuj kwotę; the drawer hides "Oddaj", "Inna spłata" and "Przypomnij".

**Group info** — tapping the group header or `⋯`: members and members without an account (with attendance), group link + QR, **Stats** (days × people table, categories), change history, settings (debt simplification, base currency, dates, notifications), "Opuść grupę", archive / delete.

**Adding an expense** — the key flow, goal: **3 taps + amount**.

- Composer at the bottom of the Conversation: **amount** (numeric keyboard, comma or dot, decimals limited to the base currency's minor digits, currency as a label) and **title**. Tapping the composer focuses amount first (no autofocus when the Conversation opens — the keyboard would cover the list), "next" moves to title; send enabled when amount > 0 and title is non-empty.
- Send creates an expense: paid by me, on the default date, split equally among members present that day.
- **Default date** (composer and full form): today; if today is outside the trip's date range, the nearest day of the range. That day also determines who is present.
- Category is not a composer field: suggested from the title on send (default "other", pure function in `packages/shared`), shown as the bubble's icon.
- **"+"** opens the **full expense form** as a sheet, prefilled with the composer's amount and title: payer, date, participants, split modes, multiple payers, income, currency with frozen rate, category, receipt. Dismissing without saving puts the values back in the composer. **📷** takes the receipt photo first, then opens the same form. The full form is also the edit screen.

## Technical architecture

([ADR-0001](./adr/0001-typescript-across-the-stack.md), [ADR-0012](./adr/0012-self-hosting-on-coolify.md), [ADR-0013](./adr/0013-hono-rest-instead-of-trpc.md))

| Area | Choice |
| --- | --- |
| Monorepo | pnpm + Turborepo |
| `apps/mobile` | Expo (React Native) + Expo Router, iOS/Android/web target |
| `apps/api` | Hono + Zod (`@hono/zod-validator`), REST, shared `hc` client |
| `packages/shared` | types, Zod schemas, split and settlement logic (pure functions + tests) |
| `packages/ui` | design tokens, 4 themes |
| Database | PostgreSQL + Drizzle |
| Auth | Better Auth: Sign in with Apple, Google, email OTP (no passwords); token in SecureStore |
| OTP emails | transactional SMTP with a free plan (Resend / Brevo / SES) |
| App data | TanStack Query + expo-sqlite/Drizzle (cache + outbox) |
| Styling | Unistyles 3 |
| File storage | Hetzner Object Storage |
| Push | Expo Push |
| Errors | Sentry (free plan), no personal data |
| Analytics | none in the MVP |

### Infrastructure

- Hetzner VPS (basic, e.g. CX22) with Coolify, EU location.
- Staging and production as separate apps in Coolify; **a shared PostgreSQL instance, separate databases**; separate buckets.
- Database backup at least daily to Object Storage in a **different Hetzner location** than the VPS; restore tested.
- Coolify builds the API image from the Dockerfile: `main` → staging, tag → production. If the VPS runs out of RAM — build the image in GitHub Actions and push to GHCR.

### Repository and CI/CD

([ADR-0012](./adr/0012-self-hosting-on-coolify.md), [ADR-0015](./adr/0015-local-mobile-builds-linux-only-ci.md))

- **Public** repo on GitHub, AGPL license. Secrets only in Coolify and GitHub Secrets.
- GitHub Actions: Linux only — typecheck, lint, tests; Turborepo runs only changed packages; path filters; `concurrency: cancel-in-progress`.
- **Zero mobile builds in CI.** Builds locally on the MacBook (`expo run:ios --configuration Release` / `eas build --local`), distribution via fastlane or Xcode → TestFlight / Google Play.
- OTA: expo-updates + free EAS Update (publish from the laptop); a self-hosted update server only if limits become a problem.

## Scope

### MVP

- Auth (Apple, Google, email OTP)
- Groups with optional dates, attendance per day, quick bill
- Members without an account, claiming, group link + QR
- Expenses: equal, exact amounts, shares, common + personal, multiple payers; incomes
- Multi-currency with a frozen rate
- Balances, debt simplification, settlements, payout details
- Days × people stats, categories
- Receipt photo, avatar
- View-only web
- Chat-style layout: inbox, Conversation, Group info ([ADR-0017](./adr/0017-chat-style-navigation.md))
- Search, unread markers, day strip
- Fresh / Classic × light / dark themes
- Accessibility: screen-reader labels, Dynamic Type, WCAG AA contrast
- PL + EN
- Offline (outbox)
- Push
- Change history with undo
- Group archiving, account deletion
- Content reporting, admin panel, terms of service, privacy policy

### v2

- Receipt OCR (possibly as a separate Python microservice)
- Custom categories per group
- CSV / PDF export
- More languages (up to 15+), RTL
- Recurring expenses (rent)
- AdMob / paid features behind feature flags
- PhotoDNA
- Realtime (if it turns out to be needed)
- Editing from the web for people without an account (if it turns out to be needed)

### Out of scope

- Trip photo gallery, group covers from photos
- Payment / banking integrations
- Roles and permissions within a group
- Sending invitation emails/SMS from the server
- Full offline-first with CRDTs

## Open tasks

- [ ] **App name and domain** — blocks the first public build. The bundle ID cannot change after publishing, and the domain is baked into universal links (changing it breaks already-sent invitations). Planned layout: `app.<domain>` (web + links), `api.<domain>` (API).
- [ ] **PhotoDNA application** — at the public store launch.
- [x] Choose i18next vs Lingui — **Lingui** (#4).
- [ ] Choose an SMTP provider for OTP emails.
