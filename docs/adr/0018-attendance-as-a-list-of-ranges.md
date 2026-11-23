# Attendance is a list of canonical day ranges

A member's attendance was a single range of days, so someone who leaves a trip on Wednesday and comes back on Friday could not be represented, and the default split ("equally among those present that day") wrongly included them on the days they were away. Attendance is now a non-empty list of inclusive day ranges, or `null` for "present for the whole trip". The per-day attendance grid in Group info maps naturally onto it: any set of ticked days becomes a list of ranges.

The list is stored only in a canonical form — sorted by start, with no overlapping and no touching ranges (`1–3` + `4–5` is `1–5`) — and the schema rejects anything else. One set of days has exactly one representation, so the change history and offline sync conflict detection (ADR-0005) compare meaningful changes, not ordering or splitting differences. A single pure helper, `normalizeAttendance`, produces that form, so the mobile app, web and server don't each implement merging.

## Consequences

- **`null` and the empty list are different.** `null` = present for the whole trip; an empty list (zero days) is rejected, so "never present" can't be confused with "always present".
- **No validation against the trip dates.** Shortening or extending a trip never invalidates attendance; days outside the trip are allowed, never match an entry date in practice, and the UI clips them for display.
- **Snapshot rule unchanged** (ADR-0016): default participants are saved as `memberIds` when an entry is created; editing attendance later does not change existing entries.
- Don't "simplify" attendance back to a single range — leave-and-return is a real trip pattern.
