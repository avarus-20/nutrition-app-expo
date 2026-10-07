# Product

## Vision

A calm, fast nutrition diary that works anywhere — on a plane, in a basement canteen, in a browser tab — and never loses an entry. Logging should take seconds; AI may help, but the user stays in control of every number.

## Target users

- People tracking calories and macros for weight management or training.
- Users who switch between phone and computer (sync) or who don't want an account at all (local-only).
- Russian, Finnish and English speakers.

## Principles

1. **Offline first, account optional.** Full functionality without network or sign-up; sync is an add-on.
2. **Fast logging.** Recent and favorite foods, saved foods with automatic scaling, meal type preselected, one-tap water.
3. **User confirms AI.** Photo estimates and voice transcriptions become editable drafts; unknown values must be filled in, nothing is logged silently.
4. **Honest numbers.** Unknown macros stay "unknown" instead of zero; history stores what was eaten even if a saved food changes later.
5. **Own your data.** Export (JSON/CSV), restore, delete account.
6. **Accessible and localized.** Screen-reader labels, sufficient contrast, large touch targets, system/light/dark theme, localized numbers and dates.

## Feature map

| Area | Capabilities |
| --- | --- |
| Today | calorie ring/progress vs goal, macros, meals by type with photo/voice indicators, water, drafts banner, previous/next day |
| Add food | search (saved + recent), favorites, manual entry with optional "save as food", photo tab, voice tab, target date and meal type |
| Meals & items | edit meal time/notes/type, edit items with auto-scaling, move item to another meal, soft delete with confirmation |
| Foods | library with brand, serving size/unit, nutrition, favorites; barcode field prepared for provider lookup |
| Photos | camera or library, compression, multiple per meal, viewer, replace/remove, upload when online; AI estimate (signed in) |
| Voice notes | record up to 3 minutes, play/pause, delete, transcript; speech-to-text (signed in) or typed text → parsed entries |
| History | month calendar with daily totals and goal status, week list, day detail |
| Statistics | 7 / 30 days, month, custom range; averages, days within goal, trend, macro energy split, charts |
| Body | weight log with trend, water presets and custom amounts |
| Goals | calories, protein, carbs, fat, fiber, sugar, salt, water |
| Settings | language, theme, account, sync status and manual sync, goals, foods, backup, privacy note, version |
| Account | email/password sign-up/in, password reset, sign out (keeps local data), delete account (server + device) |

## Non-goals (current release)

- Medical advice, diagnosis or meal plans.
- Social features, public sharing.
- Built-in nutrition database / barcode provider (the provider interface exists; see [ROADMAP.md](ROADMAP.md)).
- Automatic publishing to app stores.

## Success criteria

- An entry can be logged offline in under 10 seconds from app start.
- No data loss across app updates (versioned migrations, legacy import), sign-in/out and multi-device edits.
- Lint, types, unit, database, Edge Function and browser test suites green on every change.
