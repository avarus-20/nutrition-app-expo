# Release process

Releases are always cut by a person. Nothing in this repository publishes to the App Store, Google Play or a production web host automatically.

## Versioning

- `package.json` / `app.config.ts` `version` is the user-visible semantic version (`MAJOR.MINOR.PATCH`).
- Native build numbers (`ios.buildNumber`, `android.versionCode`) are managed remotely by EAS (`cli.appVersionSource: "remote"`) and auto-incremented by the `production` profile.
- SQLite schema versions (`src/database/migrations.ts`) and PostgreSQL migrations (`supabase/migrations/`) are versioned independently of the app version. The backup format has its own `version` (`BACKUP_VERSION`).
- Tag releases as `vX.Y.Z` on the merge commit in `main`.

## Checklist

1. **Branch is green**: CI jobs `app`, `e2e`, `edge-functions`, `database` pass on the release commit.
2. **Local validation** (clean clone):

   ```bash
   npm ci
   npm run lint && npm run typecheck && npm test
   npm run test:db          # needs a local PostgreSQL 16 (see TESTING.md)
   npm run web:build && npm run test:e2e
   npx expo-doctor
   DENO_NO_PACKAGE_JSON=1 deno test supabase/functions/
   ```

3. **Database first**: apply new PostgreSQL migrations to *preview*, run the smoke test below, then to *production* (`supabase db push --linked`). Migrations must be backward compatible with the previous app version, because installed apps update slowly (add columns nullable/with defaults; never rename or drop a column that old clients still sync).
4. **Edge Functions**: `supabase functions deploy <name> --project-ref <ref>` for changed functions; secrets via `supabase secrets set` (never in the repository).
5. **Version bump**: update `version` in `package.json`, commit `release: vX.Y.Z`.
6. **Preview builds**: `eas build --profile preview --platform all`; install on real devices and run the manual device checks.
7. **Production builds**: `eas build --profile production --platform all`.
8. **Store submission (manual)**: `eas submit --platform ios --latest` / `eas submit --platform android --latest` uploads to App Store Connect / Play Console *internal testing*. Promotion to a public release is done by a person in the store consoles.
9. **Web**: deploy `dist/` produced by `npm run web:build` with production env (see DEPLOYMENT.md). Verify headers (`curl -I` must show COOP/COEP and CSP) and that the update prompt appears for already-installed PWAs.
10. **Tag** `vX.Y.Z`, update `docs/EXECUTION_STATUS.md` / changelog in the PR description.

## Manual device checks (not automatable in CI)

Run on at least one physical Android and one iOS device with a preview build:

| Area | Check |
| --- | --- |
| First run | fresh install opens the dashboard offline; legacy data from the previous app version is imported once |
| Camera / library | permission prompt text is localized; deny → explanatory message; allow → photo attached, compressed, shown after restart |
| Microphone | permission prompt; record, pause, play back; recording survives backgrounding; deny → message |
| Speech-to-text | signed in: transcript becomes a draft; nothing is logged until confirmed |
| Share sheet | JSON backup and CSV export open the system share sheet with correct file type |
| Document picker | restore from a backup file stored in Files / Downloads |
| Auth | sign up, e-mail confirmation deep link opens the app, sign out keeps local data, account deletion |
| Sync | edit on two devices offline, reconnect, last edit wins; photos upload after reconnect |
| Accessibility | VoiceOver / TalkBack read buttons, tabs and form fields; font scaling 200% keeps layouts usable |
| Themes / languages | system dark mode; RU / FI / EN switch |

## Smoke test after deploying to an environment

1. Sign up a fresh account on the web build of that environment.
2. Add an entry, attach a photo, reload, confirm the photo is still present and visible on a second browser after sign-in.
3. Run photo estimate once (verifies Edge Function secrets and the rate-limit RPC).
4. Delete the test account from Settings.

## Rollback

- **Web**: redeploy the previous `dist/` (hosting providers keep previous deployments). The service worker picks it up as an update.
- **Native**: stores cannot roll back; ship a new build with a higher build number. Keep server changes backward compatible so old binaries continue to work.
- **Database**: migrations are forward-only. Write a new corrective migration instead of editing an applied one. Take a backup (`supabase db dump`) before applying migrations to production.
