# split-pay — specyfikacja produktu

> `split-pay` to nazwa robocza. Ostateczna nazwa i domena są otwartym zadaniem (patrz [Otwarte zadania](#otwarte-zadania)).
> Słownictwo domenowe: [GLOSSARY.md](../GLOSSARY.md). Kluczowe decyzje architektoniczne: [docs/adr/](./adr/).

## Cel

Aplikacja mobilna (iOS + Android) do dzielenia wydatków między znajomymi — od pojedynczego rachunku („pizza w piątek”) po kilkudniowy **wyjazd**, na którym każdego dnia ktoś inny robi wspólne zakupy. Aplikacja automatycznie dzieli wydatki, pokazuje kto ile wydał w poszczególne dni i wylicza minimalną liczbę przelewów do rozliczenia.

Nie każdy uczestnik zainstaluje aplikację — dlatego istnieją **członkowie bez konta**, za których wydatki wpisują inni, oraz **interfejs www** tylko do podglądu.

## Charakter produktu

- Publiczny produkt w App Store i Google Play, ale MVP projektowane pod skalę „znajomych” — bez budowania skalowalności na zapas.
- Od początku spełniamy wymogi sklepów i prawa UE: polityka prywatności, regulamin (DSA — procedura zgłoszeń), usuwanie konta w aplikacji, zgłaszanie treści.
- Darmowa, bez reklam. Wsparcie przez GitHub Sponsors — link **tylko w www i README**, nie w aplikacji mobilnej (ryzyko odrzucenia w review, [ADR-0011](./adr/0011-github-sponsors-tylko-poza-aplikacja.md)). W aplikacji sekcja „O aplikacji” bez klikalnego linku do płatności. AdMob ewentualnie w przyszłości, za feature flagą.
- Prosty mechanizm feature flags w kodzie od początku, żeby funkcje płatne/reklamy dało się dodać bez przebudowy.

## Model domeny (skrót)

- Jedynym kontenerem jest **Grupa** z opcjonalnym zakresem dat. Grupa z datami = wyjazd; bez dat = np. mieszkanie. **Szybki rachunek** to grupa z jednym wydatkiem tworzona jednym kliknięciem ([ADR-0002](./adr/0002-grupa-jako-jedyny-kontener.md)).
- Grupa ma **członków** — z kontem lub bez konta. Członka bez konta może dodać każdy członek; później ktoś może go **przejąć** ([ADR-0007](./adr/0007-czlonkowie-bez-konta-i-przejecie.md)).
- Na wyjeździe każdy członek ma **obecność** (zakres dni). Domyślny podział wydatku obejmuje członków obecnych w dniu wydatku.
- W grupie są **wydatki**, **wpływy** i **spłaty**.

## Uprawnienia

- Każdy członek grupy może dodawać, edytować i usuwać każdy wydatek, wpływ i spłatę oraz zmieniać nazwę każdego członka bez konta. Brak ról ([ADR-0008](./adr/0008-brak-rol-pelna-historia-zmian.md)).
- Każda zmiana trafia do **historii zmian** (kto, co, kiedy) z możliwością cofnięcia.
- **Założyciel** ma tylko jedno dodatkowe uprawnienie: trwałe usunięcie grupy.

## Wydatki i podział

### Model kwot

- Kwoty jako liczby całkowite w najmniejszej jednostce waluty (grosze/centy; obsługa walut z 0 i 3 miejscami po przecinku). Zero floatów ([ADR-0003](./adr/0003-kwoty-w-jednostkach-minimalnych.md)).
- Reszta z dzielenia (np. 100 zł / 3) przypisywana deterministycznie (np. wg kolejności ID członka) — identyczny wynik na telefonie, w www i na serwerze.
- Cała logika podziału i rozliczeń to czyste funkcje w `packages/shared`, najmocniej testowana część systemu.

### Wydatek

- Pola: tytuł, kwota, waluta, data, kategoria (opcjonalna), **lista płatników z kwotami**, **lista udziałów**, opcjonalne zdjęcie paragonu.
- Wielu płatników jest w modelu danych od początku; w UI domyślnie jeden płatnik, „kilku płatników” pod opcją zaawansowaną ([ADR-0004](./adr/0004-wydatek-z-lista-platnikow-i-udzialow.md)).

### Tryby podziału (MVP)

1. **Równo** między wybranych członków (domyślnie: obecnych w dniu wydatku).
2. **Dokładne kwoty**.
3. **Udziały / wagi** (np. 2:1:1).
4. **Wspólne + osobiste**: kwota całkowita minus pozycje osobiste przypisane konkretnym osobom, reszta dzielona równo (np. „osobiste Tomka: 24 zł”).

Procenty — nie (to udziały w innej formie). Podział pozycjami z paragonu (OCR) — v2.

### Wpływ

Odwrócony wydatek: ktoś otrzymał pieniądze należące do wielu osób (zwrot kaucji, sprzedaż wspólnej rzeczy).

### Kategorie

Stała, tłumaczona lista z ikonami (jedzenie, transport, nocleg, alkohol, paliwo, inne…). Opcjonalna; domyślnie „inne” lub podpowiedź na podstawie tytułu. Własne kategorie per grupa — v2.

### Waluty

- Grupa ma **walutę bazową**; wydatek może być w dowolnej walucie.
- Kurs **zamrażany** w chwili dodania wydatku, z możliwością ręcznej edycji.
- Jedno źródło kursów: ECB przez Frankfurter (self-hostowalny). Serwer pobiera kursy raz dziennie i cache'uje ([ADR-0014](./adr/0014-jedno-zrodlo-kursow-ecb.md)).
- Offline: ostatni znany kurs z cache telefonu.

## Rozliczenie

- **Saldo** każdego członka w walucie bazowej grupy.
- **Upraszczanie długów** (minimalna liczba przelewów) domyślnie włączone, przełącznik w ustawieniach grupy.
- **Spłata** zapisywana jako osobny typ operacji.
- W profilu opcjonalnie **dane do spłaty** (numer konta, telefon BLIK) — widoczne tylko dla członków wspólnych grup, przycisk „kopiuj”. Bez integracji płatności.

## Statystyki

- Tabela **dni × osoby**: ile kto wydał (zapłacił) i ile skonsumował (suma udziałów) każdego dnia.
- Podział wg kategorii.

## Członkowie bez konta, zaproszenia, udostępnianie

- **Link grupy** (sekretny token) wysyłany przez systemowy arkusz udostępniania (WhatsApp, Messenger, SMS…) + **kod QR** do pokazania na miejscu. Żadnej wysyłki maili/SMS z serwera w MVP ([ADR-0009](./adr/0009-udostepnianie-przez-link.md)).
- Link to universal link / app link:
  - aplikacja zainstalowana → ekran dołączenia: „Jesteś jednym z nich?” (lista członków bez konta) albo „Dołącz jako nowa osoba”;
  - brak aplikacji → **podgląd www** + przycisk „pobierz aplikację”.
- **Przejęcie** członka bez konta: przypisuje całą historię do konta. Pozostali członkowie dostają powiadomienie („Tomek przejął profil Tomek”), każdy może cofnąć.
- Opcjonalnie **osobisty link przejęcia** dla konkretnego członka bez konta („Wyślij Tomkowi jego link”).
- Link grupy można **unieważnić** i wygenerować nowy.

## Interfejs www

- Ta sama aplikacja Expo z targetem web (Expo Router), w trybie SPA (`web.output: "single"`) — Unistyles nie współpracuje z renderowaniem statycznym bez dodatkowej konfiguracji SSR, a SEO nie jest potrzebne.
- Dostęp przez link grupy, bez logowania. Pokazuje: listę wydatków, salda, statystyki dzienne.
- Opcja „to ja” — wybór członka, zapamiętany w przeglądarce, by widzieć „ile jestem winien”.
- **Bez zdjęć i bez edycji.**
- Podglądy linków (Open Graph) dla komunikatorów — prosty endpoint w API.
- Tu (i w README) znajduje się link do GitHub Sponsors.

## Zdjęcia

- Tylko: **zdjęcie paragonu** przy wydatku i **avatar** użytkownika. Grupa ma emoji + kolor zamiast okładki. Żadnej galerii wyjazdu.
- Storage: **Hetzner Object Storage** (S3-kompatybilny), prywatny bucket ([ADR-0006](./adr/0006-prywatne-zdjecia-na-hetzner-object-storage.md)).
- Upload bezpośrednio z telefonu przez presigned URL; API tylko wydaje URL-e.
- Na telefonie: zmniejszenie (np. 1600 px), kompresja, usunięcie EXIF (w tym GPS).
- Dostęp tylko dla członków grupy przez krótkożyjące podpisane URL-e. Niezalogowani w www nie widzą zdjęć.
- Limity: rozmiar pliku, liczba zdjęć na wydatek, dzienny limit na konto.
- Przycisk „Zgłoś” na zdjęciu, panel admina do przeglądu zgłoszeń, blokada konta.
- Retencja: zdjęcia paragonów usuwane np. rok po archiwizacji grupy.
- Skanowanie CSAM: **brak w MVP**; wniosek o Microsoft PhotoDNA przy publicznym wejściu do sklepów.

## Cykl życia grupy i konta

- Nie można wyjść z grupy z niezerowym saldem (ostrzeżenie + blokada).
- Grupę można **zarchiwizować** (tylko do odczytu). Trwale usuwa tylko założyciel.
- **Usunięcie konta** (wymóg Apple): użytkownik staje się zwykłym członkiem bez konta o nazwie „Usunięty użytkownik” — dane osobowe znikają, wydatki i salda innych zostają. Nazwę może zmienić każdy członek grupy; profil może zostać przejęty ([ADR-0010](./adr/0010-usuniecie-konta-zamienia-w-czlonka-bez-konta.md)).

## Offline

([ADR-0005](./adr/0005-offline-outbox-i-delta-sync.md))

- **Dodawanie** wydatków offline: każdy członek (ID generowane na telefonie — UUID — więc dodawanie nie powoduje konfliktów).
- **Edycja / usuwanie** offline: tylko wydatków dodanych przez siebie. Cudze — offline tylko do odczytu.
- Każdy wydatek ma numer wersji; przy konflikcie serwer nie nadpisuje, użytkownik wybiera „zachowaj moją / ich wersję”.
- Lokalny SQLite (expo-sqlite + Drizzle) jako trwały cache + kolejka operacji (outbox). Synchronizacja: wysłanie outboxu, potem pobranie zmian od `updatedAt` (delta sync per grupa).

## Powiadomienia i odświeżanie

- Push przez Expo Push (APNs + FCM): nowy wydatek z moim udziałem, edycja/usunięcie takiego wydatku, spłata na moją rzecz, ręczne „szturchnięcie” o saldo.
- Grupowanie powiadomień („Kasia dodała 3 wydatki”).
- Wyłączanie globalnie i per grupa.
- Bez realtime (WebSocket/SSE) w MVP: odświeżanie przy wejściu na ekran, pull-to-refresh, ciche pushe wyzwalające synchronizację.

## Wygląd

- Dwa motywy: **Fresh** (młodzieżowy: żywe kolory, większe zaokrąglenia, emoji, mikroanimacje) i **Classic** (stonowany), każdy jasny i ciemny — 4 warianty.
- Przełącznik per użytkownik. Ten sam układ ekranów w obu motywach — różnią się tylko tokenami.
- Komponenty własne, minimalistyczne. Style RTL-safe (`start`/`end`, nie `left`/`right`) od pierwszego dnia.

## Język

- MVP: **PL i EN**. Docelowo co najmniej 15 najpopularniejszych języków (bez rosyjskiego).
- ICU MessageFormat (formy liczby mnogiej), `Intl` do kwot i dat, i18next lub Lingui.
- RTL testowany przy dodaniu pierwszego języka RTL.
- Nazwy w kodzie po angielsku; dokumentacja po polsku.

## Nawigacja i ekrany

Expo Router, dolne zakładki:

1. **Grupy** — lista grup z saldem; FAB „+” → nowa grupa lub szybki rachunek.
2. **Aktywność** — feed zmian ze wszystkich grup.
3. **Profil** — motyw, język, dane do spłaty, powiadomienia, usunięcie konta.

Ekran grupy — zakładki:

- **Wydatki** — lista pogrupowana po dniach, suma dnia, kto płacił.
- **Salda** — kto komu ile, przycisk „rozlicz”.
- **Statystyki** — tabela dni × osoby, kategorie.
- **Ludzie** — członkowie, członkowie bez konta, obecność per dzień, zaproszenie/QR.

**Dodanie wydatku** — kluczowy flow, cel: **3 tapnięcia + kwota**. Duża kwota na górze, płatnik (domyślnie ja), data (domyślnie dziś), podział domyślnie „równo między obecnych tego dnia”. Tryby zaawansowane (dokładne kwoty, udziały, pozycje osobiste, kilku płatników) schowane pod rozwinięciem.

## Architektura techniczna

([ADR-0001](./adr/0001-typescript-w-calym-stacku.md), [ADR-0012](./adr/0012-self-hosting-na-coolify.md), [ADR-0013](./adr/0013-hono-rest-zamiast-trpc.md))

| Obszar | Wybór |
| --- | --- |
| Monorepo | pnpm + Turborepo |
| `apps/mobile` | Expo (React Native) + Expo Router, target iOS/Android/web |
| `apps/api` | Hono + Zod (`@hono/zod-validator`), REST, klient `hc` współdzielony |
| `packages/shared` | typy, schematy Zod, logika podziału i rozliczeń (czyste funkcje + testy) |
| `packages/ui` | design tokeny, 4 motywy |
| Baza | PostgreSQL + Drizzle |
| Auth | Better Auth: Sign in with Apple, Google, e-mail OTP (bez haseł); token w SecureStore |
| Maile OTP | transakcyjny SMTP z darmowym planem (Resend / Brevo / SES) |
| Dane w apce | TanStack Query + expo-sqlite/Drizzle (cache + outbox) |
| Stylowanie | Unistyles 3 |
| Storage plików | Hetzner Object Storage |
| Push | Expo Push |
| Błędy | Sentry (plan darmowy), bez danych osobowych |
| Analityka | brak w MVP |

### Infrastruktura

- Hetzner VPS (podstawowy, np. CX22) z Coolify, lokalizacja UE.
- Staging i production jako osobne aplikacje w Coolify; **wspólna instancja PostgreSQL, osobne bazy**; osobne buckety.
- Backup bazy co najmniej codziennie do Object Storage w **innej lokalizacji** Hetzner niż VPS; odtworzenie przetestowane.
- Coolify buduje obraz API z Dockerfile: `main` → staging, tag → production. Jeśli na VPS zabraknie RAM — build obrazu w GitHub Actions i push do GHCR.

### Repozytorium i CI/CD

([ADR-0012](./adr/0012-self-hosting-na-coolify.md), [ADR-0015](./adr/0015-buildy-mobilne-lokalnie-ci-tylko-linux.md))

- **Publiczne** repo na GitHub, licencja AGPL. Sekrety tylko w Coolify i GitHub Secrets.
- GitHub Actions: tylko Linux — typecheck, lint, testy; Turborepo uruchamia tylko zmienione pakiety; filtry ścieżek; `concurrency: cancel-in-progress`.
- **Zero buildów mobilnych w CI.** Buildy lokalnie na MacBooku (`expo run:ios --configuration Release` / `eas build --local`), dystrybucja przez fastlane lub Xcode → TestFlight / Google Play.
- OTA: expo-updates + darmowy EAS Update (publish z laptopa); self-hosted serwer aktualizacji dopiero przy problemach z limitami.

## Zakres

### MVP

- Auth (Apple, Google, e-mail OTP)
- Grupy z opcjonalnymi datami, obecność per dzień, szybki rachunek
- Członkowie bez konta, przejęcie, link grupy + QR
- Wydatki: równo, dokładne kwoty, udziały, wspólne + osobiste, wielu płatników; wpływy
- Multi-waluta z zamrożonym kursem
- Salda, upraszczanie długów, spłaty, dane do spłaty
- Statystyki dni × osoby, kategorie
- Zdjęcie paragonu, avatar
- www tylko do podglądu
- Motywy Fresh / Classic × jasny / ciemny
- PL + EN
- Offline (outbox)
- Push
- Historia zmian z cofaniem
- Archiwizacja grupy, usuwanie konta
- Zgłaszanie treści, panel admina, regulamin, polityka prywatności

### v2

- OCR paragonu (ewentualnie jako osobny mikroserwis w Pythonie)
- Własne kategorie per grupa
- Eksport CSV / PDF
- Kolejne języki (do 15+), RTL
- Powtarzalne wydatki (czynsz)
- AdMob / funkcje płatne za feature flagami
- PhotoDNA
- Realtime (jeśli okaże się potrzebny)
- Edycja z www dla osób bez konta (jeśli okaże się potrzebna)

### Poza zakresem

- Galeria zdjęć wyjazdu, okładki grup ze zdjęć
- Integracje płatności / bankowe
- Role i uprawnienia w grupie
- Wysyłka maili/SMS z zaproszeniami z serwera
- Pełny offline-first z CRDT

## Otwarte zadania

- [ ] **Nazwa aplikacji i domena** — blokuje pierwszy build publiczny. Bundle ID nie zmienia się po publikacji, a domena jest wpisana w universal linki (zmiana psuje wysłane zaproszenia). Planowany układ: `app.<domena>` (www + linki), `api.<domena>` (API).
- [ ] **Wniosek o PhotoDNA** — przy publicznym wejściu do sklepów.
- [ ] Wybór i18next vs Lingui.
- [ ] Wybór dostawcy SMTP dla maili OTP.
