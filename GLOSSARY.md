# split-pay

Dzielenie wspólnych wydatków między znajomymi — od pojedynczego rachunku po kilkudniowy wyjazd — i wyliczanie, kto komu ile oddaje.

W nawiasach angielskie nazwy używane w kodzie.

## Grupy i ludzie

**Grupa** (`Group`):
Jedyny kontener wydatków i członków; może mieć opcjonalny zakres dat.
_Avoid_: Wydarzenie, event, rachunek (jako kontener)

**Wyjazd** (`Group` z datami):
Grupa z zakresem dat. Nie jest osobnym bytem — to nazwa potoczna dla grupy z datami.
_Avoid_: Trip, wycieczka, event

**Szybki rachunek**:
Grupa tworzona jednym kliknięciem w celu podzielenia jednego wydatku.
_Avoid_: Bill, rachunek współdzielony

**Użytkownik** (`User`):
Osoba z kontem w aplikacji.
_Avoid_: Konto (w znaczeniu osoby), account

**Członek** (`Member`):
Osoba należąca do grupy — z kontem lub bez. Wydatki, udziały i salda zawsze odnoszą się do członka, nie do użytkownika.
_Avoid_: Uczestnik, participant, user (w kontekście grupy)

**Członek bez konta** (`Member` bez `User`):
Członek, który nie ma konta lub nie przejął jeszcze swojego profilu; jego wydatki wpisują inni.
_Avoid_: Ghost, gość, placeholder, osoba wirtualna

**Założyciel** (`owner`):
Członek, który utworzył grupę; jedyny, który może ją trwale usunąć.
_Avoid_: Admin, właściciel

**Przejęcie** (`claim`):
Powiązanie członka bez konta z użytkownikiem, przenoszące na niego całą historię w grupie.
_Avoid_: Scalenie, merge, połączenie

**Obecność** (`attendance`):
Zakres dni wyjazdu, w których członek jest obecny; wyznacza domyślnych uczestników podziału.
_Avoid_: Dostępność, pobyt

**Link grupy**:
Sekretny, unieważnialny link prowadzący do dołączenia do grupy (w aplikacji) lub jej podglądu (w www).
_Avoid_: Zaproszenie e-mail, kod grupy

**Osobisty link przejęcia**:
Link wskazujący konkretnego członka bez konta do przejęcia.

## Pieniądze

**Wydatek** (`Expense`):
Zapłata dokonana przez jednego lub kilku płatników, dzielona na udziały członków.
_Avoid_: Rachunek, transakcja, koszt

**Wpływ** (`Income`):
Pieniądze otrzymane przez członka, a należące do wielu członków (np. zwrot kaucji); odwrotność wydatku.
_Avoid_: Ujemny wydatek, zwrot (jako typ)

**Spłata** (`Settlement`):
Przekazanie pieniędzy od jednego członka drugiemu w celu wyrównania sald.
_Avoid_: Płatność, przelew (jako typ), payment

**Płatnik** (`payer`):
Członek, który zapłacił (całość lub część) wydatku.
_Avoid_: Kupujący, payer-user

**Udział** (`share`):
Część wydatku lub wpływu przypadająca na danego członka.
_Avoid_: Split, część, porcja

**Pozycja osobista**:
Część wydatku przypisana w całości jednemu członkowi, wyłączona z podziału wspólnego.
_Avoid_: Wyjątek, wykluczenie

**Saldo** (`balance`):
Różnica między tym, co członek zapłacił, a tym, co skonsumował, w walucie bazowej grupy.
_Avoid_: Dług, bilans

**Konsumpcja**:
Suma udziałów członka w danym okresie (np. dniu).
_Avoid_: Wydatki członka (myli się z tym, co zapłacił)

**Rozliczenie**:
Zestaw proponowanych spłat sprowadzający wszystkie salda do zera.
_Avoid_: Settle-up, podsumowanie

**Waluta bazowa**:
Waluta grupy, w której liczone są salda i rozliczenie.
_Avoid_: Waluta domyślna, waluta główna

**Zamrożony kurs**:
Kurs przeliczenia waluty wydatku na walutę bazową, ustalony w chwili dodania wydatku.
_Avoid_: Kurs bieżący

**Dane do spłaty**:
Numer konta lub telefon BLIK użytkownika, widoczny dla członków wspólnych grup.

## Stan i historia

**Historia zmian**:
Zapis każdej zmiany w grupie (kto, co, kiedy), umożliwiający cofnięcie.
_Avoid_: Log, audyt (w UI)

**Archiwizacja**:
Przejście grupy w stan tylko do odczytu.
_Avoid_: Zamknięcie, usunięcie

**Konflikt**:
Sytuacja, w której zmiana offline dotyczy wersji wydatku, która w międzyczasie zmieniła się na serwerze.

## Wygląd

**Motyw** (`theme`):
Zestaw tokenów wyglądu: Fresh lub Classic, każdy w wariancie jasnym i ciemnym. Wybierany per użytkownik.
_Avoid_: Skórka, styl, layout
