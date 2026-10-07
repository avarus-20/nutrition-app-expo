# Deployment

Nothing in this repository deploys automatically. Hosting, Supabase projects, EAS builds and store submissions are explicit, manual steps run by a maintainer with the right credentials. See [RELEASE.md](RELEASE.md) for the release checklist.

## Environments

| Environment | App variant (`APP_VARIANT`) | Bundle id / package | Supabase project | Typical use |
| --- | --- | --- | --- | --- |
| development | `development` | `com.avarus.nutrition.dev` | dev project or `supabase start` (local) | Expo Go / dev client, `npm run web` |
| preview | `preview` | `com.avarus.nutrition.preview` | staging project | internal testers (EAS internal distribution), web preview deploys |
| production | `production` | `com.avarus.nutrition` | production project | store builds, production website |

- Different bundle ids let all three apps be installed side by side; each variant has its own display name (`app.config.ts`).
- **Use one Supabase project per environment.** Never point a development or preview build at production data.
- The app works without any backend: if `EXPO_PUBLIC_SUPABASE_URL` / key are empty, it runs local-only (no account, no sync, no AI) — this is also how CI builds the web bundle.

### Configuration and secrets

| Value | Where it lives | Client-safe? |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `EXPO_PUBLIC_SUPABASE_ANON_KEY`), `EXPO_PUBLIC_SUPABASE_MEDIA_BUCKET` | `.env` locally; EAS environment variables (development / preview / production); web host build env | yes — inlined into the bundle; protected by RLS |
| `APP_VARIANT`, `EAS_PROJECT_ID` | `eas.json` profiles / EAS env / `.env` | yes |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_VISION_MODEL`, `AI_STT_MODEL`, `MEDIA_BUCKET` | Supabase Edge Function secrets (`supabase secrets set`) | **no — server only** |
| `SUPABASE_SERVICE_ROLE_KEY` | injected by Supabase into Edge Functions | **no — never in the app, never in `.env` of the app** |
| Supabase DB password, access tokens, Apple/Google credentials | the maintainer's machine / EAS credentials service | **no** |

Rules: only `EXPO_PUBLIC_*` values are visible to the app, so nothing secret may ever get that prefix. `.env` and `.env.*` are git-ignored (only `.env.example` files are committed).

> `EXPO_PUBLIC_*` values are inlined at build time and Metro's transform cache does not notice when they change. `npm run web:build` therefore always uses `expo export --clear`; do the same for any manual export.

## Supabase (database, auth, storage, functions)

Prerequisites: [Supabase CLI](https://supabase.com/docs/guides/cli), a Supabase account, one project per environment.

### Local stack

```bash
supabase start                      # Postgres, Auth, Storage, Studio on localhost (config: supabase/config.toml)
supabase db reset                   # applies supabase/migrations/*.sql to the local database
cp supabase/functions/.env.example supabase/functions/.env   # optionally add AI_API_KEY
supabase functions serve --env-file supabase/functions/.env
```

Then set `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and the local publishable/anon key printed by `supabase start` in `.env`.

### Hosted project

```bash
supabase login
supabase link --project-ref <project-ref>          # once per environment
supabase db push                                   # applies pending migrations (see "Migrations" below)
supabase secrets set --env-file supabase/functions/.env   # AI_* and MEDIA_BUCKET
supabase functions deploy delete-account
supabase functions deploy estimate-photo
supabase functions deploy transcribe
```

Dashboard settings that are not in migrations:

- **Auth → URL configuration**: Site URL = the web origin of that environment; redirect URLs: `nutritiontracker://` (native) and the web origin(s).
- **Auth → Providers**: email enabled; minimum password length 8; enable email confirmation for production.
- **Auth → Rate limits / CAPTCHA**: enable for production.
- Storage: the `user-media` bucket and its policies are created by migration `20261007000003_private_media_storage.sql` — do not make it public.

### Migrations

- Files: `supabase/migrations/<timestamp>_<name>.sql` — schema (`…01`), RLS (`…02`), private storage (`…03`).
- Always test first: `npm run test:db` runs them against a throwaway PostgreSQL database (with `supabase/tests/supabase_shim.sql` standing in for Supabase's `auth`/`storage` schemas) and checks constraints, sync triggers and RLS. CI runs the same job.
- Order of rollout: development → preview → production, each with `supabase db push` after `supabase link` to that project. Take a backup (Dashboard → Database → Backups, or `supabase db dump`) before pushing to production.
- Migrations are forward-only and must stay compatible with the previous app version (old clients keep syncing until users update): add columns as nullable or with defaults, never rename/drop in the same release. See [DATABASE.md](DATABASE.md#migration-strategy).

## Web / PWA

```bash
npm ci
npm run web:build        # expo export --clear → dist/, then scripts/build-pwa.mjs
npm run web:serve        # serves dist/ on http://localhost:8080 with production headers
```

`scripts/build-pwa.mjs` stamps `dist/sw.js` with a content hash and its precache list, writes `dist/_headers` and `dist/_redirects`, and fails the build if the manifest, icons, SQLite wasm or `vercel.json` headers are missing or inconsistent.

### Required hosting behavior

1. **Headers on every response** (single source: `scripts/web-headers.mjs`):
   - `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` — mandatory: the local database (expo-sqlite on WebAssembly with OPFS) needs a cross-origin isolated page. Without them the app shows a startup error.
   - `Content-Security-Policy` — allows only same-origin code plus `*.supabase.co`. **If you use a custom Supabase domain, add it to `connect-src`** in `scripts/web-headers.mjs` and `vercel.json`.
   - `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (camera and microphone for this origin only).
2. **SPA fallback**: unknown paths serve `/index.html` (deep links such as `/history`).
3. **Caching**: `index.html`, `sw.js`, `manifest.webmanifest` with `Cache-Control: no-cache`; `/_expo/static/*` and `/assets/*` are content-hashed and can be cached immutably.
4. **HTTPS** (service workers, camera and microphone require a secure context).
5. Served from the domain root (`/`). Sub-path hosting would need `experiments.baseUrl` and changes to the manifest and service worker scope.

Ready-made configs:

| Host | Config |
| --- | --- |
| Netlify, Cloudflare Pages | `dist/_headers` + `dist/_redirects` (generated). Build command `npm run web:build`, output `dist` |
| Vercel | `vercel.json` (build command, output, rewrites, headers) |
| Any static server / CDN | replicate the four rules above (nginx: `add_header … always;` + `try_files $uri /index.html;`) |

Set the `EXPO_PUBLIC_*` variables of the target environment in the host's build settings (or build locally with them and upload `dist/`).

### Offline behavior and updates

- The service worker (`public/sw.js`) precaches the app shell (HTML, JS bundles, SQLite wasm, icon font, manifest, icons) on first visit; afterwards the app starts and works fully offline. Other assets are cached on first use. Supabase requests are never cached by the service worker.
- A new deployment produces a new build hash. Open tabs download it in the background and show *"A new version of the app is available — Reload"*; the new version activates only when the user accepts. Old caches are deleted on activation.
- Data lives in the browser's origin storage (OPFS). Clearing site data deletes local entries that were not synchronized — users without an account should export backups.

## Native apps (EAS)

Prerequisites: `npm i -g eas-cli`, an Expo account, `eas login`, then once: `eas init` (writes the project id; set `EAS_PROJECT_ID` accordingly) and `eas credentials` per platform (Apple Developer / Google Play accounts are needed only for store builds).

Profiles (`eas.json`):

| Profile | Purpose | Output |
| --- | --- | --- |
| `development` | dev client (`expo-dev-client`) for `npx expo start --dev-client` | Android APK, iOS device build (internal) |
| `development-simulator` | same, for the iOS simulator | iOS simulator build |
| `preview` | release-mode build for internal testers | Android APK, iOS ad-hoc (internal) |
| `production` | store-ready, `autoIncrement` build numbers (remote app version source) | Android AAB, iOS IPA |

Each profile selects the EAS environment of the same name, so set the `EXPO_PUBLIC_*` values per environment once:

```bash
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://<staging-ref>.supabase.co --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <staging publishable key> --visibility plaintext
# repeat for development and production
```

Builds:

```bash
eas build --profile development --platform android
eas build --profile preview --platform all
eas build --profile production --platform all
```

Local native builds without EAS (requires Android Studio / Xcode):

```bash
APP_VARIANT=development npx expo run:android
APP_VARIANT=development npx expo run:ios
```

Store submission (`eas submit`) is a manual release step — see [RELEASE.md](RELEASE.md). Nothing in CI submits or publishes.

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and `agent/**` and on pull requests:

| Job | Steps |
| --- | --- |
| app | `npm ci`, lint, typecheck, jest, `web:build` (incl. PWA checks), `expo-doctor` |
| edge-functions | `deno check` of every function, `deno test supabase/functions/` |
| database | PostgreSQL 16 service, `npm run test:db` (migrations, constraints, triggers, RLS) |

CI never needs secrets: the web bundle is built in local-only mode.
