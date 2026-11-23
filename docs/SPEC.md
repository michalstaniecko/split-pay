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

- The only container is a **Group** with an optional date range. A group with dates = a trip; without dates = e.g. a shared flat. A **quick bill** is a group with one expense created with a single tap ([ADR-0002](./adr/0002-group-as-the-only-container.md)).
- A group has **members** — with or without an account. Any member can add a member without an account; later someone can **claim** them ([ADR-0007](./adr/0007-members-without-account-and-claiming.md)).
- On a trip every member has an **attendance** (a range of days). The default split of an expense covers the members present on the expense's date.
- A group contains **expenses**, **incomes** and **settlements**.

## Permissions

- Every group member can add, edit and delete any expense, income and settlement, and rename any member without an account. No roles ([ADR-0008](./adr/0008-no-roles-full-change-history.md)).
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

A fixed, translated list with icons (food, transport, accommodation, alcohol, fuel, other…). Optional; "other" by default or a suggestion based on the title. Custom categories per group — v2.

### Currencies

- A group has a **base currency**; an expense can be in any currency.
- The rate is **frozen** when the expense is added, and can be edited manually.
- A single rate source: the ECB via Frankfurter (self-hostable). The server fetches rates once a day and caches them ([ADR-0014](./adr/0014-single-exchange-rate-source-ecb.md)).
- Offline: the last known rate from the phone's cache.

## Settle-up

- Each member's **balance** in the group's base currency.
- **Debt simplification** (minimum number of transfers) enabled by default, toggle in group settings.
- A **settlement** is recorded as a separate operation type.
- Optional **payout details** in the profile (bank account number, BLIK phone number) — visible only to members of shared groups, with a "copy" button. No payment integration.

## Statistics

- A **days × people** table: how much each person spent (paid) and consumed (sum of shares) on each day.
- Breakdown by category.

## Members without an account, invitations, sharing

- A **group link** (secret token) sent via the system share sheet (WhatsApp, Messenger, SMS…) + a **QR code** to show in person. No sending emails/SMS from the server in the MVP ([ADR-0009](./adr/0009-sharing-via-link.md)).
- The link is a universal link / app link:
  - app installed → join screen: "Jesteś jednym z nich?" ("Are you one of them?" — a list of members without an account) or "Dołącz jako nowa osoba" ("Join as a new person");
  - no app → **web preview** + a "download the app" button.
- **Claiming** a member without an account: assigns the whole history to the account. The other members get a notification ("Tomek przejął profil Tomek" — "Tomek claimed the Tomek profile"), and anyone can undo it.
- Optionally a **personal claim link** for a specific member without an account ("Send Tomek his link").
- The group link can be **revoked** and a new one generated.

## Web interface

- The same Expo app with a web target (Expo Router), in SPA mode (`web.output: "single"`) — Unistyles does not work with static rendering without additional SSR configuration, and SEO is not needed.
- Access via the group link, without logging in. Shows: list of expenses, balances, daily stats.
- A "this is me" option — choosing a member, remembered in the browser, to see "how much I owe".
- **No photos and no editing.**
- Link previews (Open Graph) for messengers — a simple API endpoint.
- This is where (along with the README) the GitHub Sponsors link lives.

## Photos

- Only: a **receipt photo** on an expense and a user **avatar**. A group has an emoji + color instead of a cover. No trip gallery.
- Storage: **Hetzner Object Storage** (S3-compatible), private bucket ([ADR-0006](./adr/0006-private-photos-on-hetzner-object-storage.md)).
- Upload directly from the phone via a presigned URL; the API only issues the URLs.
- On the phone: downscaling (e.g. 1600 px), compression, EXIF stripping (including GPS).
- Access only for group members via short-lived signed URLs. Logged-out web visitors do not see photos.
- Limits: file size, number of photos per expense, daily limit per account.
- A "Report" button on a photo, an admin panel for reviewing reports, account blocking.
- Retention: receipt photos deleted e.g. one year after the group is archived.
- CSAM scanning: **none in the MVP**; apply for Microsoft PhotoDNA at the public store launch.

## Group and account lifecycle

- You cannot leave a group with a non-zero balance (warning + block).
- A group can be **archived** (read-only). Only the owner can permanently delete it.
- **Account deletion** (Apple requirement): the user becomes an ordinary member without an account named "Usunięty użytkownik" ("Deleted user") — personal data is removed, other people's expenses and balances remain. Any group member can rename it; the profile can be claimed ([ADR-0010](./adr/0010-account-deletion-turns-into-member-without-account.md)).

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

## Language

- MVP: **PL and EN**. Eventually at least the 15 most popular languages (excluding Russian).
- ICU MessageFormat (plural forms), `Intl` for amounts and dates, i18next or Lingui.
- RTL tested when the first RTL language is added.
- Code, names and documentation in English; UI copy is Polish-first with i18n.

## Navigation and screens

Expo Router, bottom tabs:

1. **Groups** — list of groups with balances; FAB "+" → new group or quick bill.
2. **Activity** — feed of changes from all groups.
3. **Profile** — theme, language, payout details, notifications, account deletion.

Group screen — tabs:

- **Expenses** — list grouped by day, daily total, who paid.
- **Balances** — who owes whom how much, a "settle up" button.
- **Stats** — days × people table, categories.
- **People** — members, members without an account, attendance per day, invitation/QR.

**Adding an expense** — the key flow, goal: **3 taps + amount**. Large amount at the top, payer (me by default), date (today by default), split by default "equally among those present that day". Advanced modes (exact amounts, shares, personal items, multiple payers) hidden behind an expander.

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
- Fresh / Classic × light / dark themes
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
- [ ] Choose i18next vs Lingui.
- [ ] Choose an SMTP provider for OTP emails.
