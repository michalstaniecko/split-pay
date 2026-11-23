# An entry stores its split mode; shares and balances are derived

Expenses and incomes store what the user entered: the split mode (`equal`, `exact`, `shares`, `commonPlusPersonal`), the amount in the entry's currency and the frozen rate. They do not store computed shares or amounts in the base currency. Shares, balances, daily stats and settle-up are computed by pure functions in `packages/shared`, identically on the phone, on the web and on the server. This keeps editing an entry simple, offline too (a single `split` field changes), and shares never drift away from the amount.

## Consequences

- **The split algorithm is part of the data model.** Changing `allocate`, `resolveSplit` or the rounding rule changes the balances of historical entries. Every such change requires a conscious decision and, if it affects results, versioning the algorithm on the entry.
- The default split participants ("present on the entry's date") are saved when the entry is created as a `memberIds` list. A later change in attendance does not change old entries.
- The rate is a decimal string (e.g. `"4.2715"`), and conversion uses integers (BigInt), rounding halves away from zero. Base-currency amounts are converted as a total first and then divided proportionally, so the sum of shares after conversion is always exact.
- If the server needs to query by shares (e.g. SQL reports), it may store a computed copy of them, but the entry remains the source of truth.
