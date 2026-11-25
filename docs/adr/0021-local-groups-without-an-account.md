# Local groups without an account

The app can be used without signing in, but only through **local groups**: groups that live solely in a separate SQLite file on the device (not tied to any user), are never sent to the server, and tell others what they owe only through a plain-text **settle-up summary** shared via the system share sheet or the clipboard. This lowers the entry barrier for a one-off bill and follows App Store guideline 5.1.1 (no forced sign-in for features that don't need an account). A local group is still a Group (ADR-0002) and everyone in it is a member without an account (ADR-0007), so the split and settle-up logic in `packages/shared` runs unchanged on the device.

## Considered Options

- **Forced sign-in**: rejected. It is the main entry barrier for "split one pizza bill", and a review risk under guideline 5.1.1.
- **Anonymous account on the server** (a silent device-bound user): rejected. It still needs the server for everything (and exchange rates, photos, sync), creates orphaned accounts and personal-data processing for people who never asked for an account, while the goal was "data stays only on this phone".
- **Local groups in the signed-in user's cache file**: rejected. That file is per user and is deleted with the account; local groups belong to the device and must survive signing in and out.

## Consequences

- Local groups drop everything that needs the server or other people: foreign currencies (rates come from our server, ADR-0014), receipt photos, change history, trip dates and attendance, archiving, reminders and push, payout details, group link and QR, claiming. Deleting a local group is immediate and cannot be undone.
- The data is lost with the app or the phone; the app says so plainly. No backup or export in the MVP.
- After signing in, existing local groups stay next to synced ones; new groups are always synced. Moving a local group to an account is v2 — client-generated UUIDs keep that a plain upload.
- Without an account the app is available on iOS and Android only; the web has no local database and stays the read-only group view.
