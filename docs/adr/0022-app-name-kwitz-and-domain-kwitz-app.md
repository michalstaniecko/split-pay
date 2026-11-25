# App name Kwitz, domain kwitz.app

The app is called **Kwitz** and its domain is **kwitz.app**. The name had to be settled before the first public build: the store bundle ID cannot change after publishing, and the domain is baked into group links (ADR-0009), so changing it later breaks invitations that were already sent. `split-pay` stays only as the repo and internal working name.

Kwitz is a coined spelling of "quits" ("we're quits" — nobody owes anyone anything), which is exactly where a settle-up ends; it also nods to the Polish "kwita" with the same meaning. The name targets the global market: an English speaker reads it right away, it has no diacritics, and as a coined word it can be registered as a trademark, unlike a descriptive name.

Identifiers derived from the name:

| What | Value |
|---|---|
| Display name | Kwitz |
| Web and group links | `app.kwitz.app` |
| API | `api.kwitz.app` |
| iOS bundle ID / Android package | `app.kwitz` |
| URL scheme | `kwitz://` |

## Considered Options

- **A Polish name** (e.g. Kwitki, Podzielka): rejected. The product targets the global market from the start; short Polish words were also already registered in all main TLDs.
- **An existing English word** (Quits, EvenUp, Dutchy, Settly, All Square…): rejected. The domains were taken across `.app`, `.com` and `.io`, and some names are taken by apps or companies.
- **Splitchat** (the only candidate with `.app`, `.com` and `.io` free): rejected. Descriptive, hard to protect as a trademark, and lost among the many "split" apps in store search.
- **Requiring `.com`**: rejected. `.app` is HTTPS-only by design, which suits universal links, and group links reach people by being shared, not typed, so a missing `.com` costs little.

## Consequences

- `kwitz.com` belongs to someone else; we don't depend on it and don't promise it anywhere.
- Before the public launch: confirm the store listing name is free in the App Store and Google Play, and check trademarks (EUIPO, USPTO) in our class.
- Repo, package names (`@split-pay/*`), Coolify, R2 and Sentry resources keep the `split-pay` working name — they are internal and never seen by users.
- The staging domain `splitpay.on.ihumbak.website` stays for staging only; production uses `api.kwitz.app` and `app.kwitz.app`.
- On-device storage keys keep the `split-pay` / `splitpay` prefix (SQLite file names, secure-store and web storage prefixes, the background task name). They are never seen by users, and renaming them would drop existing sessions and local data.
- The previous bundle ID `com.website.ihumbak.splitpay` and the `splitpay://` scheme were never published; any development build installed under them has to be reinstalled.
