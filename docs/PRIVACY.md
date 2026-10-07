# Privacy

Plain-language description of what the app does with personal data. It is the basis for the store privacy labels and a privacy policy; it is not legal advice.

## Without an account (default)

- All entries, foods, goals, weight, water, photos and voice notes are stored **only on the device** (SQLite database and app files; in the browser, the site's storage).
- Nothing is sent to any server. There is no analytics, advertising or tracking SDK.
- AI features (photo estimate, speech-to-text) are not available without an account; voice notes can still be turned into entries by typing.

## With an account (optional)

| Data | Where | Purpose |
| --- | --- | --- |
| Email, password hash | Supabase Auth | sign-in |
| Meals, items, foods, goals, weight, water, transcripts | Supabase PostgreSQL (project region chosen by the operator) | synchronization between your devices |
| Photos, voice recordings | private Supabase Storage bucket, folder named after your user id | synchronization; only you can access them |
| Device record (platform, app version, last seen) | `devices` table | troubleshooting sync |

- Access is restricted to your own records by database Row Level Security; there are no public links to photos or recordings.
- Photos are re-encoded before saving, which removes EXIF metadata such as GPS location.

## AI processing

Only when **you** press *Estimate nutrition* or *Turn into entries*:

- the photo or the recording is sent to the app's Edge Function and from there to the configured AI provider (OpenAI-compatible API, e.g. OpenAI);
- it is processed in memory and not stored by the app's backend; the provider's own data policy applies (operators should choose a provider/plan without training on API data);
- the result is shown as a **draft**; nothing is saved to your diary until you review and confirm it.

## Your controls

- **Export**: Settings → Backup and export → JSON backup (all records) or CSV (entries).
- **Delete entries**: any entry can be deleted; deletions synchronize to your other devices.
- **Sign out**: keeps data on this device; you can keep using the app locally.
- **Delete account**: Settings → Delete account removes your account, all synchronized records and all stored photos and recordings from the server, and the copies on this device. This cannot be undone.

## Retention

- Deleted records are kept as tombstones (no content beyond what was deleted) so other devices learn about the deletion; local tombstones are purged 30 days after they are synchronized.
- AI quota counters (user id, function, hour, count) are kept for at most one day.
- Server backups follow the Supabase project's backup retention.

## Children

The app is not directed at children under 13 (or the minimum age in the user's country).

## Health information

Nutrition and weight data can be sensitive. The app does not share it with third parties, and AI processing only happens on explicit user action. The app does not provide medical advice.
