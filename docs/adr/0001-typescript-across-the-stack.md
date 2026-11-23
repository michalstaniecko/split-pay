# TypeScript across the whole stack, monorepo

The mobile app, web and API are written in TypeScript in a single monorepo (pnpm + Turborepo). The main reason: the split and settlement logic (rounding, personal items, debt simplification) must behave identically offline on the phone, on the web and on the server, so it exists exactly once, as pure functions in `packages/shared`. A divergence between implementations would mean different balances in different places.

## Considered Options

- **Python (FastAPI) on the backend**: rejected. It would require maintaining the settlement logic in two languages and generating a TS client from OpenAPI, and auth for React Native would have to be assembled from several libraries. Python is back on the table only as an isolated microservice (e.g. receipt OCR in v2).
