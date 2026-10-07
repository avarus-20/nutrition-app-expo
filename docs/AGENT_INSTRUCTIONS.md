# Instructions for coding agents

Read this before changing the repository.

## Recovery

1. `git status`, `git log --oneline -20`.
2. Read `docs/EXECUTION_STATUS.md` (current stage, decisions, tech debt, blockers).
3. Continue from the first unchecked item. Never restart migrations or rewrite applied database migrations.

## Non-negotiable rules

- Never commit secrets or real `.env` files. Client env holds only `EXPO_PUBLIC_*` publishable values. Service-role keys and AI provider keys live only in Edge Function secrets.
- Never disable, skip or delete tests to make CI pass; never add blanket ignore/suppress hacks; never weaken `tsconfig` strictness.
- Never push to or force-push `main`; work on a branch and open a PR. Never publish store releases automatically.
- Every user-data write goes to SQLite first through a repository (`insertEntity` / `updateEntity` / `softDeleteEntity`), which also enqueues the outbox change and emits a `dataEvents` topic. Do not write synced tables directly.
- AI output is a draft; it is never logged without explicit user confirmation and never invents nutrition values.
- Applied SQLite / PostgreSQL migrations are immutable; add a new version.
- Keep `docs/EXECUTION_STATUS.md` up to date with each significant change.

## Commands

| Purpose | Command |
| --- | --- |
| install | `npm ci` |
| dev server | `npm start` (`--web`, `--android`, `--ios`) |
| lint (React Compiler rules, zero warnings) | `npm run lint` |
| typecheck | `npm run typecheck` |
| unit + UI tests | `npm test` |
| PostgreSQL tests | `npm run test:db` (needs `PG*` env pointing at PostgreSQL 16) |
| Edge Function tests | `DENO_NO_PACKAGE_JSON=1 deno test supabase/functions/` |
| Edge Function typecheck | `DENO_NO_PACKAGE_JSON=1 deno check supabase/functions/<name>/index.ts` (each function separately) |
| web build + PWA checks | `npm run web:build` |
| serve build with production headers | `npm run web:serve -- --port 8080` |
| browser E2E | `npm run test:e2e` (after `web:build`; needs Chrome) |
| Expo health | `npx expo-doctor` |

## Gotchas

- **Deno and package.json**: without `DENO_NO_PACKAGE_JSON=1`, Deno resolves npm imports through the root `package.json`/`node_modules` and fails or type-checks against the wrong versions.
- **Metro cache and env**: `EXPO_PUBLIC_*` values are inlined at build time and Metro's transform cache does not notice when they change. `web:build` therefore runs `expo export --clear`; keep it that way.
- **Web SQLite** requires cross-origin isolation (COOP/COEP). Use `npm run web:serve`, not a generic static server, when testing a build. Headers are defined once in `scripts/web-headers.mjs`; `vercel.json` must match (the build fails on drift).
- **Platform files**: web-specific implementations live in `*.web.ts` (media as data URIs, file download, service worker). Keep native and web exports identical.
- **React Native Testing Library 14**: `render` and `fireEvent` are async — always `await` them. UI tests mock `@/database/client`, `@/backend/supabase` and `expo-router` (see `tests/ui/screens.test.tsx`).
- **SQL parameters**: repositories use positional `?` parameters; do not mix numbered (`$1`) and positional parameters in one statement.
- **React Compiler lint**: no mutation of props/state, no reading refs during render, no conditional hooks; prefer derived values over effects that set state.
- **E2E fixture** fails a test on any console error or warning; fix the cause instead of filtering it.
- **i18n**: `src/i18n/en.ts` is the type source; RU and FI must provide every key (compile error otherwise). Use plural forms for counts.

## Conventions

- TypeScript strict, zod validation at every boundary (backup files, server rows, Edge Function payloads).
- Errors are `AppError` with an `AppErrorCode`, mapped to localized messages; screens show loading / empty / error states.
- Commit messages: `stage-N: ...` during the roadmap, conventional imperative sentences afterwards.
- Formatting (no Prettier config is committed): `npx prettier --single-quote --print-width 120 --trailing-comma all --write <files>`.
