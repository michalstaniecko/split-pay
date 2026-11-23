# split-pay

Aplikacja do dzielenia wydatków między znajomymi. pnpm monorepo (Turborepo), TypeScript w całym stacku.

- Specyfikacja produktu: `docs/SPEC.md`. Decyzje architektoniczne: `docs/adr/`. Słownictwo domenowe: `GLOSSARY.md` — używaj tych terminów w kodzie i rozmowie.
- `apps/mobile` — Expo (iOS/Android/web), Expo Router, Unistyles. Szczegóły: `apps/mobile/AGENTS.md`.
- `apps/api` — Hono, eksportuje typowany klient z `@split-pay/api/client`.
- `packages/shared` — logika podziału i rozliczeń (czyste funkcje). Każda zmiana tutaj wymaga testów.
- `packages/ui` — design tokeny i motywy (Fresh/Classic × light/dark).

## Zasady

- Kwoty to liczby całkowite w jednostkach minimalnych waluty — nigdy floaty (ADR-0003).
- Style RTL-safe: `start`/`end`, nie `left`/`right`.
- Kod i nazwy po angielsku, dokumentacja po polsku.
- Przed zakończeniem zadania: `pnpm typecheck && pnpm test`.
