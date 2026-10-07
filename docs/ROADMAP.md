# Roadmap

Everything required for the v2 production scope is implemented (see `EXECUTION_STATUS.md`). Items below are optional follow-ups, ordered roughly by value.

## Near term

- **Hosted environments**: create the preview and production Supabase projects, apply migrations, deploy Edge Functions and run the release smoke test (blocked only on credentials; see DEPLOYMENT.md).
- **Dependency hygiene**: enable Dependabot / Renovate for npm and GitHub Actions; re-evaluate the transitive `npm audit` advisories when Expo publishes fixed versions (SECURITY.md).
- **OAuth sign-in**: Google and Sign in with Apple (Apple is required by App Store rules once any third-party login is offered).
- **Native E2E**: Maestro flows for camera, microphone, share sheet and document picker on EAS-built preview binaries.
- **Crash and error reporting**: opt-in Sentry (or similar) with PII scrubbing, wired into the root error boundary.

## Product

- Barcode scanning backed by a nutrition database (Open Food Facts) with the result going through the existing draft-confirmation flow.
- Undo for deletions (soft delete already makes this cheap).
- Recipes / composite foods with per-serving nutrition.
- Reminders (local notifications) for meals, water and weigh-ins.
- Micronutrient goals and more chart types (weekly macro split, goal adherence streaks).
- Health Connect / Apple Health import of weight and water.
- Media in backups (optional ZIP with photos and audio).

## Platform

- Sub-path web hosting (configurable `baseUrl`, service worker scope and manifest `start_url`).
- Optional encryption at rest for the local database (SQLCipher) and an app lock.
- Server-side cleanup job for orphaned Storage objects whose best-effort client removal failed.
- Field-level merge instead of record-level last-write-wins for meals edited on several devices.
- Server-side text search over foods when the local catalogue grows large.
