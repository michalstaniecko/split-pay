# TypeScript w całym stacku, monorepo

Aplikacja mobilna, www i API są napisane w TypeScript, w jednym monorepo (pnpm + Turborepo). Główny powód: logika podziału i rozliczeń (zaokrąglenia, pozycje osobiste, upraszczanie długów) musi działać identycznie offline na telefonie, w www i na serwerze, więc istnieje dokładnie raz, jako czyste funkcje w `packages/shared`. Rozbieżność między implementacjami oznaczałaby różne salda w różnych miejscach.

## Considered Options

- **Python (FastAPI) na backendzie**: odrzucony. Wymagałby utrzymywania logiki rozliczeń w dwóch językach i generowania klienta TS z OpenAPI, a auth dla RN trzeba by składać z kilku bibliotek. Python wraca do rozważenia tylko jako izolowany mikroserwis (np. OCR paragonów w v2).
