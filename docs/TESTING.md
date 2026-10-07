# Testing

| Layer | Tool | Command | Count | Runs in CI |
| --- | --- | --- | --- | --- |
| Domain, services, repositories, SQLite migrations, legacy import, sync engine, i18n | Jest (jest-expo) + real SQLite (better-sqlite3) | `npm test` | 190 | app |
| UI render tests (screens with real services) | React Native Testing Library 14 | `npm test` (`tests/ui`) | 4 | app |
| PostgreSQL schema, constraints, sync trigger, RLS, storage policies, AI quota | Jest + `pg` against PostgreSQL 16 | `npm run test:db` | 22 | database |
| Edge Function helpers; type-check of every function | Deno | `deno test` / `deno check` | 4 | edge-functions |
| Browser end-to-end on the production web build (desktop 1280 px + mobile 390 px) | Playwright + Chrome, axe-core | `npm run test:e2e` | 16 | e2e |
| Static checks | ESLint (expo, React Compiler rules), TypeScript strict, expo-doctor | `npm run lint`, `npm run typecheck`, `npm run doctor` | — | app |

## Unit and integration tests (`tests/`)

- Services run against a real in-memory SQLite database through `tests/helpers/nodeDriver.ts` (better-sqlite3 behind the same `SqlDatabase` interface as expo-sqlite), with the production migrations. This catches SQL, constraint and transaction bugs, not just logic.
- Media binaries use `tests/helpers/fakeFiles.ts`; the server side of sync is `tests/helpers/fakeRemote.ts` (an in-memory implementation of the `RemoteGateway` with the same LWW semantics as the PostgreSQL trigger), so multi-device scenarios (offline edits, conflicts, orphans, deletions, media download) are tested end-to-end in Node.
- UI tests (`tests/ui`) render real screens inside the app providers (`tests/helpers/renderApp.tsx`) and assert on behavior: validation messages, drafts not being logged before confirmation, export/restore results. RNTL 14's `render` and `fireEvent` are async — always `await` them.
- Expo modules without a Node implementation are mocked in `tests/setup.ts` (crypto, AsyncStorage) or per test (`@/backend/supabase`, `@/media/fileTransfer`, `expo-router`).

## Database tests (`tests-db/`)

```bash
docker run -d --name nt-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16   # or any local PostgreSQL ≥ 15
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run test:db
```

Each run creates a throwaway database, applies `supabase/tests/supabase_shim.sql` (minimal `auth`/`storage` schemas, roles and `auth.uid()`), then every migration in order. Tests switch roles (`authenticated`, `anon`, `service_role`) and JWT claims to verify policies as the API would.

## Edge Functions

```bash
export DENO_NO_PACKAGE_JSON=1          # functions resolve npm: specifiers themselves
for f in supabase/functions/*/index.ts; do deno check "$f"; done   # check each entry point separately
deno test supabase/functions/
```

`supabase functions serve` runs them locally against `supabase start`.

## Browser end-to-end (`e2e/`)

```bash
npm run web:build          # the suite runs against dist/ (local-only mode)
npm run test:e2e           # starts scripts/serve-web.mjs on :8090 with production headers
npx playwright test e2e/pwa.spec.ts --project=mobile   # single spec / viewport
```

- Uses the installed Google Chrome (`channel: 'chrome'`) with a fake camera/microphone, so voice recording is real.
- Every test fails on any console error/warning or uncaught exception (`e2e/fixtures.ts`).
- Specs: diary flows (goals, manual and saved-food entries, scaling, editing, moving, deletion, reload persistence, history, statistics, weight, water); photos (attach offline, persistence, removal); voice (record, playback, typed text → draft → confirmation rules); backup (JSON/CSV download, restore into a fresh profile, idempotent re-restore, foreign and newer-version files); PWA (manifest, service worker control, offline cold start with cross-origin isolation and local data, update prompt and cache rotation); accessibility (axe WCAG 2.1 A/AA on 11 screens, light and dark).
- Signed-in flows (sync, photo estimate, transcription) were additionally verified manually with a build pointing at a fake Supabase URL and Playwright request interception; they are covered automatically by the Node sync and recognition tests.
- Failures keep traces in `test-results/` (uploaded as a CI artifact).

## What is not automated

- Native device runs (camera/microphone permissions, share sheet, document picker on iOS/Android): manual checklist in [RELEASE.md](RELEASE.md).
- Real Supabase project and AI provider: no credentials in CI by design; covered by the PostgreSQL tests, the fake gateway and manual release checks.

## Conventions

- Never disable or skip tests to get a green build; fix the cause.
- New SQL goes through a Node test with the real migrations; new server rules need a `tests-db` case; new screens need loading/empty/error states and, for flows, an e2e or RNTL test.
