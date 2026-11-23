# Amounts as integers in minor units

All amounts are stored and computed as integers in the currency's smallest unit (grosze, cents, taking into account currencies with 0 and 3 decimal places). Floats are never used. The remainder of a division (100 PLN / 3 = 33.33 + 33.33 + 33.34) is assigned deterministically, by member ID order rather than randomly, so that the phone, the web and the server produce identical results.
