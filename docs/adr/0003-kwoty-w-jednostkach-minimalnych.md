# Kwoty jako liczby całkowite w jednostkach minimalnych

Wszystkie kwoty są przechowywane i liczone jako liczby całkowite w najmniejszej jednostce waluty (grosze, centy, z uwzględnieniem walut z 0 i 3 miejscami po przecinku). Nigdzie nie używamy floatów. Reszta z dzielenia (100 zł / 3 = 33,33 + 33,33 + 33,34) trafia deterministycznie, według kolejności ID członka, a nie losowo, żeby telefon, www i serwer dawały identyczny wynik.
