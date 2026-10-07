# Nutrition Tracker

Offline-first nutrition and calorie tracker for **Android, iOS, the web and as an installable PWA**, built with Expo (SDK 57), React Native and TypeScript.

Everything works without an account: data is stored on the device in SQLite. Signing in (Supabase) adds synchronization across devices, private cloud storage for photos and voice notes, and optional AI assistance — which only ever creates *drafts* that you confirm.

> This app is a personal tracking tool, not medical or nutritional advice.

## Features

- **Today**: calories and macros against daily goals, meals by type, water, pending drafts, day navigation.
- **Add food**: search saved foods and recent entries, favorites, manual entry (optionally saved as a food), **photo** (camera/library, compressed, attached to the meal) with optional AI estimate, **voice note** with speech-to-text or typed text, parsed into entries (EN/RU/FI).
- **Review drafts**: AI and voice results are never logged automatically — names, amounts and nutrition are edited and confirmed first; unknown calories must be filled in.
- **Edit everything**: meals, items (auto-scaling nutrition), move items between meals, soft delete.
- **Foods library** with favorites and per-serving nutrition.
- **History**: day / week / month calendar with daily totals.
- **Statistics**: 7 days, 30 days, month or custom range, averages, goal adherence and trends (aggregated in SQL).
- **Body**: weight log with 7-entry trend, water tracking with presets.
- **Backup**: versioned JSON export and validated, merging restore; CSV export of all entries.
- **Account & sync** (optional): email/password, offline outbox, conflict resolution, multi-device, account deletion.
- **Languages**: English, Russian, Finnish (system default or manual); **themes**: system / light / dark; responsive layout (bottom tabs on phones, sidebar on wide screens); screen-reader labels, focus styles, WCAG 2.1 AA checked with axe.
- **PWA**: installable, works offline after the first visit, update prompt.

The previous prototype's data (AsyncStorage `meals_YYYY-MM-DD`) is imported automatically and idempotently on first start; the original keys are kept.

## Quick start

Requirements: Node.js 22 and npm. For devices: Expo Go or a development build; Android Studio / Xcode for emulators.

```bash
npm ci
cp .env.example .env      # optional: leave Supabase values empty for local-only mode
npm start                 # Expo dev server (press a / i / w)
npm run web               # browser (http://localhost:8081)
npm run android           # Android emulator / device
npm run ios               # iOS simulator (macOS)
```

## Quality checks

```bash
npm run lint              # ESLint (expo config), zero warnings
npm run typecheck         # TypeScript strict
npm test                  # Jest: domain, services, sync, SQLite migrations, UI render tests
npm run test:db           # PostgreSQL migrations, constraints, triggers and RLS (needs TEST_DATABASE_URL)
npm run web:build         # production web build + PWA checks → dist/
npm run doctor            # expo-doctor
```

Edge Functions (Deno): `DENO_NO_PACKAGE_JSON=1 deno check supabase/functions/<name>/index.ts` and `DENO_NO_PACKAGE_JSON=1 deno test supabase/functions/`. See [docs/TESTING.md](docs/TESTING.md).

## Production builds

```bash
npm run web:build && npm run web:serve        # web/PWA, served with production headers on :8080
eas build --profile preview --platform android
eas build --profile production --platform all
supabase link --project-ref <ref> && supabase db push   # database migrations
```

Details, environments and hosting requirements (COOP/COEP headers are mandatory on the web): [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Release checklist: [docs/RELEASE.md](docs/RELEASE.md).

## Project layout

```
src/app/            Expo Router routes (thin wrappers around feature screens)
src/features/       screens and feature UI (add, nutrition, history, stats, body, photos, voice, drafts, backup…)
src/ui/             design-system components (Button, Card, Screen, Calendar, Charts…)
src/domain/         pure domain logic: types, validation, nutrition math, stats, phrase parser
src/services/       application services (meals, foods, photos, voice, drafts, backup, recognition…)
src/repositories/   SQL access per table
src/database/       SQLite driver, serial queue, versioned migrations, table registry
src/sync/           sync engine, Supabase gateway, provider
src/auth/           auth gateway/provider, local data claim and wipe
src/i18n/           EN (type source), RU, FI dictionaries and formatting
src/pwa/            service worker registration and update prompt (web)
supabase/           PostgreSQL migrations, Edge Functions, local config
public/             web template, manifest, service worker, PWA icons
scripts/            web build post-processing, local server, icon generator
docs/               product, architecture, data, sync, security, privacy, testing, deployment, release
```

## Documentation

[Product](docs/PRODUCT.md) · [Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE.md) · [Data model & backup format](docs/DATA_MODEL.md) · [Offline sync](docs/OFFLINE_SYNC.md) · [Media & AI](docs/MEDIA.md) · [Security](docs/SECURITY.md) · [Privacy](docs/PRIVACY.md) · [Testing](docs/TESTING.md) · [Deployment](docs/DEPLOYMENT.md) · [Release](docs/RELEASE.md) · [Roadmap](docs/ROADMAP.md) · [Agent instructions](docs/AGENT_INSTRUCTIONS.md) · [Execution status](docs/EXECUTION_STATUS.md)

## Security in one paragraph

The app only contains client-safe configuration (Supabase URL and publishable/anon key). All access is enforced by PostgreSQL Row Level Security and private storage policies; AI provider keys and the service role exist only as Edge Function secrets. No secrets are committed — see [docs/SECURITY.md](docs/SECURITY.md).
