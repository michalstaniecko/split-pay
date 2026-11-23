# split-pay

An app for splitting expenses between friends. pnpm monorepo (Turborepo), TypeScript across the whole stack.

- Product specification: `docs/SPEC.md`. Architecture decisions: `docs/adr/`. Domain vocabulary: `GLOSSARY.md` — use these terms in code and conversation.
- `apps/mobile` — Expo (iOS/Android/web), Expo Router, Unistyles. Details: `apps/mobile/AGENTS.md`.
- `apps/api` — Hono, exports a typed client from `@split-pay/api/client`.
- `packages/shared` — split and settlement logic (pure functions). Every change here requires tests.
- `packages/ui` — design tokens and themes (Fresh/Classic × light/dark).

## Rules

- Amounts are integers in the currency's minor units — never floats (ADR-0003).
- RTL-safe styles: `start`/`end`, not `left`/`right`.
- Code, names and documentation in English.
- Before finishing a task: `pnpm typecheck && pnpm test`.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (`michalstaniecko/split-pay`, via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
