# Execution status

Branch: `agent/nutrition-production-v2` · Base: `main`

## Recovery procedure (for a new agent session)

1. `git status` and `git log --oneline -20`
2. read this file
3. inspect the implementation for the first unchecked task below
4. continue from there — never restart the migration from scratch

## Current stage

**Final audit and cyclic validation** (Stages 0–14 complete)

## Stages

- [x] Stage 0 — Audit and baseline (`docs/AUDIT_BASELINE.md`)
- [x] Stage 1 — Platform modernization and CI
- [x] Stage 2 — Production architecture
- [x] Stage 3 — SQLite and legacy migration
- [x] Stage 4 — PostgreSQL / Supabase
- [x] Stage 5 — Authentication
- [x] Stage 6 — Offline synchronization
- [x] Stage 7 — Responsive UI, i18n, themes
- [x] Stage 8 — Complete nutrition domain
- [x] Stage 9 — History, statistics, weight, water
- [x] Stage 10 — Photographs
- [x] Stage 11 — Voice notes
- [x] Stage 12 — Backup / restore / export
- [x] Stage 13 — PWA and deployment
- [x] Stage 14 — Production hardening
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
11. Statistics are aggregated in SQL (`mealRepository.rangeSummary`); trend = least-squares slope over logged days; weight trend = 7-entry moving average.
12. AI recognition (photo estimate, speech-to-text) runs in Edge Functions with an OpenAI-compatible provider; results are stored as device-local drafts (`entry_drafts`, SQLite v2) and are never logged without user confirmation.
13. Deleted media objects are removed from Storage by the client after the deletion is pushed (best effort).
14. Voice text is turned into entries by a deterministic local parser (`phraseParser` + `foodMatcher`) rather than a second AI call, so it works offline and never invents nutrition values.
15. Backups are versioned JSON without media binaries, fully validated before writing and merged per record by `updated_at` (docs/DATA_MODEL.md); restored changes are synchronized through the outbox.
16. Web hosting headers (COOP/COEP, CSP, caching) have one source (`scripts/web-headers.mjs`); the service worker precaches the app shell and activates updates only after the user accepts. `web:build` always clears the Metro cache because `EXPO_PUBLIC_*` changes are not detected by the transform cache.
17. Three environments (development / preview / production) with separate bundle ids, EAS profiles/environments and Supabase projects.
8. Account deletion and AI calls run in Supabase Edge Functions; the client only holds the publishable key.
18. AI Edge Functions enforce a per-user fixed-window quota (`consume_ai_quota`, service-role only) and fail closed (503) if the quota cannot be checked.
19. A root error boundary (`ErrorBoundary` export in `src/app/_layout.tsx`) shows a localized crash screen with retry instead of a blank app.
20. Browser E2E (Playwright, Chrome, desktop 1280 px + mobile 390 px) runs against the production web build served with production headers; any console error fails a test; axe checks WCAG 2.1 AA on all main routes.

## Latest validation results

| Check | Result |
| --- | --- |
| baseline lint | pass |
| baseline typecheck | fail (7 errors, see audit) |
| baseline expo-doctor | fail (2 checks) |
| Stage 3 lint / typecheck / jest (56) / web build / expo-doctor | all pass |
| Stage 3 browser smoke (web SQLite + OPFS persistence + legacy import) | pass |
| Stage 4 PostgreSQL 16 tests (`npm run test:db`, 20) | pass |
| Stage 14 lint / typecheck / jest (194 incl. UI render tests) / test:db (22) / `deno test` (4) + `deno check` of 3 functions / web build with PWA checks / expo-doctor 21/21 / Playwright E2E 16/16 (diary, media, backup, PWA offline + update, axe WCAG 2.1 AA: 0 violations on 11 routes, light + dark) | all pass |
| Stage 13 lint / typecheck / jest (190) / web build with PWA checks / expo-doctor 21/21 / `deno test` (3) / app config per variant; browser E2E at 1280 px and 390 px: service worker controls the page, manifest served, offline cold start (cross-origin isolated, data visible), offline deep link, update prompt → reload → old caches removed; all Stage 8–12 browser suites re-run under the production CSP with no errors | all pass |
| Stage 12 lint / typecheck / jest (190) / web build; browser E2E at 1280 px and 390 px: seed → JSON + CSV download → restore into a fresh browser profile (3 new) → restore again (3 unchanged) → foreign file and newer-version file rejected with messages → dashboard shows restored entry | all pass |
| Stage 11 lint / typecheck / jest (181) / web build / `deno check` of each Edge Function; browser E2E with Chrome's fake microphone at 1280 px and 390 px: record → playback position → typed text → draft → confirm → meal editor list → delete; signed-in: fake `transcribe` → draft → confirm → `audio/webm` upload | all pass |
| Stage 10 lint / typecheck / jest (165) / web build / `deno check` of Edge Functions; browser E2E at 1280 px and 390 px: local-only photo attach/remove/replace/reload persistence/dashboard indicator; signed-in flow against an intercepted Supabase API: photo estimate → draft review (unknown calories blocked) → confirm → binary upload then metadata push | all pass |
| Stage 9 lint / typecheck / jest (130) / web build; browser E2E: history month/week/day, stats 7d + custom range, weight add/trend, water presets, no console errors at 1280 px and 390 px | all pass |
| Stage 8 lint / typecheck / jest (122) / web build; browser E2E at 1280 px and 390 px: goals, manual add (+save as food), add from saved food with scaling, item edit with auto-scaling and move to another meal, delete, favorites, day navigation, reload persistence | all pass |
| Stage 7 lint / typecheck / jest (110) / web build; browser check of sidebar (1280px), bottom tabs (390px), RU switch persisted across reload, dark theme | all pass |
| Stage 6 lint / typecheck / jest (95) / web build / expo-doctor 21/21 / test:db (20) | all pass |

## Known technical debt

See `docs/AUDIT_BASELINE.md`. Additionally:

- Web build is served from the domain root only (no sub-path hosting).
- A failed best-effort removal of a deleted media object leaves an unreferenced object until account deletion.

## Known external blockers

None yet.

## Database migration status

- SQLite schema v2 (`src/database/migrations.ts`; v2 adds the local `entry_drafts` table) — implemented and tested.
- Legacy AsyncStorage import (`src/services/legacyMigration.ts`) — implemented, idempotent, verified in Node tests and in a real browser (web build).
- PostgreSQL migrations — `supabase/migrations/2026100700000{1,2,3,4}_*.sql` (schema, RLS, private storage, AI rate limit). Verified against PostgreSQL 16 locally and in CI (`database` job) with a Supabase shim (`supabase/tests/supabase_shim.sql`). Not applied to any hosted project (no credentials available — see DEPLOYMENT.md).

## Synchronization implementation status

Implemented (`src/sync/`): outbox push with batching/isolation/backoff, media upload-before-metadata, keyset pull with overlap, LWW reconciliation, orphan parking, purge, Supabase gateway, provider triggers (sign-in, reconnect, foreground, debounced writes, interval, manual). Tested against an in-memory server with real SQLite. Not exercised against a hosted Supabase project (no credentials).

## Latest important commit

(see `git log`)
