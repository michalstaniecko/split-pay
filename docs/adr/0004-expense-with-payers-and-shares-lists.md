# An expense has a list of payers and a list of shares

From day one, an expense in the data model has a list of payers with amounts (rather than a single `paidBy` field) and a list of shares. An income is the same model with the direction reversed. The UI shows a single payer by default, and multiple payers sit behind an advanced option. Changing the data model after launch is expensive, while simplifying the UI is cheap.
