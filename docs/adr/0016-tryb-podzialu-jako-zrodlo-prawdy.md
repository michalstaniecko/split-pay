# Wpis przechowuje tryb podziału, a udziały i salda są wyliczane

Wydatek i wpływ przechowują to, co wpisał użytkownik: tryb podziału (`equal`, `exact`, `shares`, `commonPlusPersonal`), kwotę w walucie wpisu i zamrożony kurs. Nie przechowują wyliczonych udziałów ani kwot w walucie bazowej. Udziały, salda, statystyki dzienne i rozliczenie liczą czyste funkcje z `packages/shared`, identycznie na telefonie, w www i na serwerze. Dzięki temu edycja wpisu, także offline, jest prosta (zmienia się jedno pole `split`), a udziały nie rozjeżdżają się z kwotą.

## Consequences

- **Algorytm podziału jest częścią modelu danych.** Zmiana `allocate`, `resolveSplit` albo reguły zaokrągleń zmienia salda historycznych wpisów. Każda taka zmiana wymaga świadomej decyzji, a jeśli dotyczy wyników, także wersjonowania algorytmu w wpisie.
- Uczestnicy domyślnego podziału („obecni w dniu wpisu”) są zapisywani w momencie tworzenia wpisu jako lista `memberIds`. Późniejsza zmiana obecności nie zmienia starych wpisów.
- Kurs jest dziesiętnym stringiem (np. `"4.2715"`), a przeliczanie odbywa się na liczbach całkowitych (BigInt), z zaokrągleniem połówek od zera. Kwoty w walucie bazowej najpierw przeliczamy jako sumę, a potem dzielimy proporcjonalnie, więc suma udziałów po przeliczeniu jest zawsze dokładna.
- Jeśli serwer będzie potrzebował zapytań po udziałach (np. raporty SQL), może przechowywać ich wyliczoną kopię, ale źródłem prawdy pozostaje wpis.
