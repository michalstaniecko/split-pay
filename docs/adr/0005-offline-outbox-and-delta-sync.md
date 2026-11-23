# Offline: outbox + delta sync, offline editing only of your own expenses

The app works offline thanks to a local SQLite database (a cache plus an operation queue, i.e. an outbox) and a "send the outbox, then pull changes since `updatedAt`" sync. Conflicts are limited by rules rather than by an algorithm:
- anyone may add offline, because the ID (UUID) is generated on the phone, so adding never causes conflicts;
- offline editing and deleting applies only to expenses you added yourself;
- every expense has a version number, and on conflict the user decides.

## Considered Options

- **Offline writes only for the group owner**: rejected. It barely reduces conflicts (adding causes none anyway), and it blocks the person who is actually doing the shopping without signal.
- **An off-the-shelf sync engine (PowerSync, ElectricSQL)**: rejected. It is an extra service to host, and with the rules above our own implementation is small.
- **Full offline-first with CRDTs**: overkill.
