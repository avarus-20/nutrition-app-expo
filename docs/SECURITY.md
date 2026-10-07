# Security

## Trust model

| Component | Trusted with |
| --- | --- |
| App (any platform) | the user's own data on that device; Supabase URL + **publishable/anon key** (public by design) and the user's session |
| PostgreSQL (Supabase) | authorization: Row Level Security, ownership constraints, sync trigger |
| Supabase Storage | private bucket `user-media`, per-user folder policies |
| Edge Functions | provider keys (`AI_API_KEY`), service role (injected by Supabase), quota enforcement |

The client is assumed hostile: anything it sends is validated again on the server.

## Secrets

- The app bundle contains only `EXPO_PUBLIC_*` values: Supabase URL, publishable/anon key, bucket name, app variant. They grant nothing beyond what RLS allows an anonymous or signed-in user.
- **Never in the app or repository:** the service role key, database passwords, AI provider keys, signing keys/keystores, Apple/Google credentials. `.env` / `.env.*` are git-ignored; only `.env.example` files with empty values are committed. Keystores and provisioning files are ignored as well (`*.jks`, `*.p8`, `*.p12`, `*.key`, `*.mobileprovision`, `*.pem`).
- Edge Function secrets are set per environment with `supabase secrets set`; EAS credentials are managed by EAS.
- If a secret leaks: rotate it in the provider/Supabase dashboard first, then purge it from history.

## Authorization (server)

- RLS is enabled and forced on every synchronized table: users can only `select/insert/update` rows where `user_id = auth.uid()`; there is no DELETE policy (soft delete); `anon` has no privileges (`supabase/migrations/20261007000002_row_level_security.sql`).
- Composite foreign keys `(meal_id, user_id)` prevent attaching rows to another user's meal even with a known id; `user_id` cannot be changed by updates (trigger).
- Last-write-wins and clock clamping happen in the database trigger, so a client cannot overwrite newer data with stale writes or push timestamps far into the future.
- Storage: bucket `user-media` is private; object paths must start with the caller's user id (policies in `…03_private_media_storage.sql`; `storage_path` CHECK constraints mirror this). Clients download through the authenticated Storage API — there are no public URLs.
- Verified by `npm run test:db` (owner isolation, upsert hijacking, cross-user inserts, anonymous access, storage folders, quota privileges).

## Edge Functions

- `verify_jwt = true` for every function; each function also resolves the user from the JWT (`requireUser`).
- `estimate-photo` / `transcribe`: allow-listed MIME types, base64 validation and size limits (5 MB image, 20 MB audio) before any provider call; provider timeouts (45 s / 60 s); responses sanitized (names trimmed, numeric ranges, max 30 items) and validated again on the client.
- **Per-user hourly quota** (`consume_ai_quota`, table `ai_usage`, defaults 30 photo estimates / 60 transcriptions per hour) — fails closed if the quota cannot be checked. `ai_usage` is not reachable with user sessions.
- `delete-account`: removes the user's storage objects, then the auth user (cascade deletes all rows). Uses the service role, which exists only inside the function.
- Images and audio are processed in memory and not logged. Errors are logged without payloads.
- CORS is `*` because authorization is the bearer token, not cookies.

## Client hardening

- All input is validated with zod (`src/domain/validation.ts`) before writes; SQLite mirrors the server CHECK constraints. SQL is parameterized everywhere; table/column names come from the static registry (`src/database/schema.ts`).
- Untrusted data entering the app — server rows (`src/sync/remoteSchemas.ts`), AI output (`sanitizeDraftItems`), backups (`parseBackup`) — is schema-validated; invalid rows are rejected, never partially written.
- CSV export neutralizes spreadsheet formula injection (cells starting with `= + - @` are prefixed with `'`).
- Photos are re-encoded before storage, which strips EXIF metadata including GPS location.
- Media MIME types are allow-listed; file sizes are limited before upload.
- Auth: passwords ≥ 8 characters (client and Supabase setting), generic error for unknown accounts on password reset, refresh token rotation.

## Web

Served with (single source `scripts/web-headers.mjs`, enforced by `scripts/build-pwa.mjs`):

- `Content-Security-Policy`: `default-src 'self'`, scripts only from the origin (+ `wasm-unsafe-eval` for SQLite), network only to the origin and `*.supabase.co`, `frame-ancestors 'none'`, `object-src 'none'`. No inline scripts are used.
- `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Resource-Policy: same-origin`.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` limiting camera/microphone to the app origin.
- The service worker only caches same-origin GET requests of the app shell; API and storage responses are never cached.

## Data at rest on the device

- Native: SQLite database and media live in the app sandbox (protected by OS sandboxing and device encryption). The database itself is not separately encrypted.
- Web: data lives in the origin's storage (OPFS); anyone with access to the browser profile can read it. Users on shared computers should sign out and clear site data.
- Signing out keeps local data (so unsynced changes are not lost); deleting the account wipes it.

## Dependencies

- `npm audit` (2026-10-07): 62 advisories, all transitive and inside Expo/Jest tooling (`braces` via Jest, `node-forge` via `@expo/cli` dev certificates, `uuid`/`sprintf-js` via native build tooling) plus `decode-uri-component@0.2.2` via `expo-router → query-string` (client-side URL parsing DoS, low impact). None has a non-breaking fix; `npm audit fix --force` would downgrade Expo packages and is not used. Re-check on every Expo SDK update.
- Dependabot/Renovate is recommended (see [ROADMAP.md](ROADMAP.md)).

## Reporting

Please report vulnerabilities privately to the repository owner (GitHub security advisories) rather than in public issues.
