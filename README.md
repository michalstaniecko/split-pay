# split-pay

> Working name.

A mobile app (iOS + Android) and web preview for splitting expenses between friends — from a single bill to a multi-day trip.

## Structure

```
apps/mobile      Expo (React Native) — iOS, Android, web
apps/api         Hono API
packages/shared  types, Zod schemas, split and settlement logic
packages/ui      design tokens and themes
docs/            specification and ADRs
```

## Getting started

Requirements: Node 26 (`.nvmrc`, `nvm use`), pnpm 12.

```sh
pnpm install
pnpm api          # API at http://localhost:3000
pnpm mobile       # Metro; the app requires a development build (Unistyles = native module)
pnpm --filter @split-pay/mobile ios   # local iOS build
pnpm typecheck
pnpm test
```

Expo Go is not enough — the app uses native modules, so run it via a development build (`expo run:ios|android`).

## Support

The project is free and open source. If you'd like to support it — GitHub Sponsors (link coming soon).

## License

[AGPL-3.0](./LICENSE)
