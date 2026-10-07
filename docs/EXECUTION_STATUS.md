# Execution status

Branch: `agent/nutrition-production-v2` · Base: `main`

## Recovery procedure (for a new agent session)

1. `git status` and `git log --oneline -20`
2. read this file
3. inspect the implementation for the first unchecked task below
4. continue from there — never restart the migration from scratch

## Current stage

**Stage 8 — Complete nutrition domain** (next)

## Stages

- [x] Stage 0 — Audit and baseline (`docs/AUDIT_BASELINE.md`)
- [x] Stage 1 — Platform modernization and CI
- [x] Stage 2 — Production architecture
- [x] Stage 3 — SQLite and legacy migration
- [x] Stage 4 — PostgreSQL / Supabase
- [x] Stage 5 — Authentication
- [x] Stage 6 — Offline synchronization
- [x] Stage 7 — Responsive UI, i18n, themes
- [ ] Stage 8 — Complete nutrition domain
- [ ] Stage 9 — History, statistics, weight, water
- [ ] Stage 10 — Photographs
- [ ] Stage 11 — Voice notes
- [ ] Stage 12 — Backup / restore / export
- [ ] Stage 13 — PWA and deployment
- [ ] Stage 14 — Production hardening
- [ ] Final audit and cyclic validation
- [ ] Final PR

## Important architectural decisions

1. **Expo SDK 57** (npm `latest` dist-tag on 2026-10-07). SDK 58 is `next` (pre-release) and is not used.
2. Offline-first: every write goes to SQLite (`expo-sqlite`) first; sync is a background concern.
3. Supabase (PostgreSQL + Auth + Storage + Edge Functions) is the backend. App is fully usable without an account.
4. Client-generated UUID primary keys make every push an idempotent upsert.
5. Conflict policy: record-level last-write-wins on client `updated_at`, enforced by the server trigger `tg_sync_row` (docs/OFFLINE_SYNC.md).
6. Data owner model: rows created before sign-in belong to `local` and are claimed (re-owned + queued) at sign-in.
7. Web media is stored as data URIs in SQLite (no durable browser file system with stable URIs); native media in the document directory.
9. i18n: typed dictionaries (`src/i18n/en.ts` is the type source; RU/FI must match at compile time), Intl plural rules and formatting, language persisted in SQLite preferences; legacy `app_lang` adopted on first start.
10. Responsive shell: JS tabs with a custom tab bar — bottom bar < 1000 px, sidebar ≥ 1000 px; content max width 1180 px.
8. Account deletion and AI calls run in Supabase Edge Functions; the client only holds the publishable key.

## Latest validation results

| Check | Result |
| --- | --- |
| baseline lint | pass |
| baseline typecheck | fail (7 errors, see audit) |
| baseline expo-doctor | fail (2 checks) |
| Stage 3 lint / typecheck / jest (56) / web build / expo-doctor | all pass |
| Stage 3 browser smoke (web SQLite + OPFS persistence + legacy import) | pass |
| Stage 4 PostgreSQL 16 tests (`npm run test:db`, 20) | pass |
| Stage 7 lint / typecheck / jest (110) / web build; browser check of sidebar (1280px), bottom tabs (390px), RU switch persisted across reload, dark theme | all pass |
| Stage 6 lint / typecheck / jest (95) / web build / expo-doctor 21/21 / test:db (20) | all pass |

## Known technical debt

See `docs/AUDIT_BASELINE.md`.

## Known external blockers

None yet.

## Database migration status

- SQLite schema v1 (`src/database/migrations.ts`) — implemented and tested.
- Legacy AsyncStorage import (`src/services/legacyMigration.ts`) — implemented, idempotent, verified in Node tests and in a real browser (web build).
- PostgreSQL migrations — `supabase/migrations/2026100700000{1,2,3}_*.sql` (schema, RLS, private storage). Verified against PostgreSQL 16 locally and in CI (`database` job) with a Supabase shim (`supabase/tests/supabase_shim.sql`). Not applied to any hosted project (no credentials available — see DEPLOYMENT.md).

## Synchronization implementation status

Implemented (`src/sync/`): outbox push with batching/isolation/backoff, media upload-before-metadata, keyset pull with overlap, LWW reconciliation, orphan parking, purge, Supabase gateway, provider triggers (sign-in, reconnect, foreground, debounced writes, interval, manual). Tested against an in-memory server with real SQLite. Not exercised against a hosted Supabase project (no credentials).

## Latest important commit

(see `git log`)
