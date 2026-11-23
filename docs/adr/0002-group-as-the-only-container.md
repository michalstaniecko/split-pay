# Group as the only container

There are no separate "trip", "event" or "bill" entities: there is a single Group with an optional date range. A trip is a group with dates, and a quick bill is a group with a single expense. A group → trip → bill hierarchy would force the question of which level balances are computed at and would complicate settlement, while giving almost nothing in return.
