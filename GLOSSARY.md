# split-pay

Splitting shared expenses between friends — from a single bill to a multi-day trip — and working out who pays back whom and how much.

The app UI is Polish-first, so each term lists its Polish UI name.

## Groups and people

**Group** (PL: Grupa):
The only container for expenses and members; it can have an optional date range.
_Avoid_: Event, bill (as a container)

**Trip** (PL: Wyjazd):
A group with a date range. Not a separate entity — just the everyday name for a group with dates.
_Avoid_: Journey, excursion, event

**Quick bill** (PL: Szybki rachunek):
A group created with a single tap to split one expense.
_Avoid_: Bill, shared bill

**User** (PL: Użytkownik):
A person with an account in the app.
_Avoid_: Account (meaning a person)

**Member** (PL: Członek):
A person belonging to a group — with or without an account. Expenses, shares and balances always refer to a member, never to a user.
_Avoid_: Participant, user (in a group context)

**Member without account** (PL: Członek bez konta):
A member who has no account or has not yet claimed their profile; others enter their expenses.
_Avoid_: Ghost, guest, placeholder, virtual person

**Owner** (PL: Założyciel):
The member who created the group; the only one who can permanently delete it.
_Avoid_: Admin, founder

**Claim** (PL: Przejęcie):
Linking a member without account to a user, transferring their whole history in the group to that user.
_Avoid_: Merge, link-up

**Attendance** (PL: Obecność):
The range of trip days on which a member is present; it determines the default split participants.
_Avoid_: Availability, stay

**Group link** (PL: Link grupy):
A secret, revocable link that leads to joining the group (in the app) or previewing it (on the web).
_Avoid_: Email invitation, group code

**Personal claim link** (PL: Osobisty link przejęcia):
A link pointing to a specific member without account to be claimed.

## Money

**Entry** (PL: Wpis):
The common name for an expense, an income and a settlement — everything that changes balances in a group.
_Avoid_: Transaction, operation, record

**Expense** (PL: Wydatek):
A payment made by one or more payers, split into members' shares.
_Avoid_: Bill, transaction, cost

**Income** (PL: Wpływ):
Money received by a member that belongs to several members (e.g. a deposit refund); the reverse of an expense.
_Avoid_: Negative expense, refund (as a type)

**Settlement** (PL: Spłata):
A transfer of money from one member to another to even out balances.
_Avoid_: Payment, transfer (as a type)

**Payer** (PL: Płatnik):
A member who paid (all or part of) an expense.
_Avoid_: Buyer, purchaser

**Share** (PL: Udział):
The part of an expense or income that falls to a given member.
_Avoid_: Split (for a single member's part), portion, cut

**Split mode** (PL: Tryb podziału):
How an entry's amount is divided into shares: equally, by exact amounts, by weights, or "common + personal".
_Avoid_: Split type, method

**Personal item** (PL: Pozycja osobista):
A part of an expense assigned entirely to one member, excluded from the common split.
_Avoid_: Exception, exclusion

**Balance** (PL: Saldo):
The difference between what a member paid and what they consumed, in the group's base currency.
_Avoid_: Debt, net

**Consumption** (PL: Konsumpcja):
The sum of a member's shares over a given period (e.g. a day).
_Avoid_: Member's expenses (confused with what they paid)

**Settle-up** (PL: Rozliczenie):
The set of suggested settlements that brings all balances to zero.
_Avoid_: Summary, reconciliation

**Base currency** (PL: Waluta bazowa):
The group's currency, in which balances and the settle-up are computed.
_Avoid_: Default currency, main currency

**Frozen rate** (PL: Zamrożony kurs):
The rate for converting an expense's currency to the base currency, fixed when the expense is added.
_Avoid_: Current rate, live rate

**Payout details** (PL: Dane do spłaty):
A user's bank account number or BLIK phone number, visible to members of shared groups.

## State and history

**Change history** (PL: Historia zmian):
A record of every change in a group (who, what, when) that allows undoing it.
_Avoid_: Log, audit (in the UI)

**Archiving** (PL: Archiwizacja):
Putting a group into a read-only state.
_Avoid_: Closing, deletion

**Conflict** (PL: Konflikt):
A situation where an offline change targets a version of an expense that has meanwhile changed on the server.

## Look and feel

**Theme** (PL: Motyw):
A set of look-and-feel tokens: Fresh or Classic, each in a light and dark variant. Chosen per user.
_Avoid_: Skin, style, layout
