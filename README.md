# split-pay

> Nazwa robocza.

Aplikacja mobilna (iOS + Android) i podgląd www do dzielenia wydatków między znajomymi — od jednego rachunku po kilkudniowy wyjazd.

## Struktura

```
apps/mobile      Expo (React Native) — iOS, Android, web
apps/api         Hono API
packages/shared  typy, schematy Zod, logika podziału i rozliczeń
packages/ui      design tokeny i motywy
docs/            specyfikacja i ADR-y
```

## Start

Wymagania: Node 26 (`.nvmrc`, `nvm use`), pnpm 12.

```sh
pnpm install
pnpm api          # API na http://localhost:3000
pnpm mobile       # Metro; aplikacja wymaga development builda (Unistyles = moduł natywny)
pnpm --filter @split-pay/mobile ios   # lokalny build iOS
pnpm typecheck
pnpm test
```

Expo Go nie wystarczy — aplikacja używa modułów natywnych, więc uruchamiaj ją przez development build (`expo run:ios|android`).

## Wsparcie

Projekt jest darmowy i open source. Jeśli chcesz go wesprzeć — GitHub Sponsors (link wkrótce).

## Licencja

[AGPL-3.0](./LICENSE)
