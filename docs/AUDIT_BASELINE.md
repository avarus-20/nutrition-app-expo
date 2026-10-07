# Stage 0 — Baseline audit of the prototype

Audited commit: `87040ab` (main, "Document Nutrition Tracker project").

## Repository state

| Item | Finding |
| --- | --- |
| Branches | `main`, `agent/nutrition-readme-refresh` (README wording only), `agent/production-hardening` (identical to main). Nothing reusable for modernization. |
| Commits | 2 commits: initial prototype + README. |
| Expo SDK | 53 (`expo@53.0.20`, React Native 0.79.5, React 19.0, Expo Router 5). |
| TypeScript | `strict: true`, path alias `@/*`. |
| Lint | `expo lint` (eslint-config-expo flat config). |
| Tests | None. |
| CI | None. |

## Routes (Expo Router)

| Route | File | Behavior |
| --- | --- | --- |
| `/` (tab) | `app/(tabs)/index.tsx` | Add meal (title + calories) for *today*, list, delete. Hardcoded Russian strings. |
| `/stats` (tab) | `app/(tabs)/stats.tsx` | Shows today's calorie total only. Hardcoded Russian. |
| `/history` (tab) | `app/(tabs)/history.tsx` | Lists days with stored data and their totals. Loads every day sequentially. |
| `/day/[date]` | `app/day/[date].tsx` | Placeholder: prints the date only. |
| `+not-found` | `app/+not-found.tsx` | Template screen (English). |

`app/_layout.tsx` renders `<Slot/>` without the `I18nProvider`, so the language switch never worked: `useT()` always returned the default Russian context.

## Domain and storage

* `types/meal.ts`: `Meal { id: string; title: string; calories: number; createdAt: string /* YYYY-MM-DD */ }`.
* `lib/logic.ts`: `sumCalories`, `dayKey(date) => "meals_" + date`, `todayISO()` — **bug:** uses UTC (`toISOString`), so meals entered late evening / early morning are filed under the wrong local day.
* `lib/storage.ts`: AsyncStorage persistence.

### Legacy data that must be preserved

| AsyncStorage key | Value |
| --- | --- |
| `meals_YYYY-MM-DD` | JSON array of `Meal` objects for that day (newest first). |
| `app_lang` | `"ru"` or `"fi"`. |

The values may be malformed (manual edits, partially written JSON, non-numeric calories, duplicated ids). The migration must tolerate this.

## Translations

`lib/i18n.tsx` — a context with RU/FI dictionaries of 13 keys. Most screens ignore it and hardcode Russian. No English.

## Dead / template code

* `lib/index.tsx`, `lib/stats.tsx`, `lib/_layout.tsx` — stale copies of screens with broken relative imports (cause of the TypeScript errors).
* `components/*` (ParallaxScrollView, HelloWave, Collapsible, ExternalLink, HapticTab, IconSymbol, TabBarBackground), `hooks/useThemeColor`, `constants/Colors.ts`, `scripts/reset-project.js`, `assets/images/*react-logo*` — unused create-expo-app template files.
* `structure.txt` — 1.7 MB Windows `tree` dump in a legacy code page.
* `react-native-uuid` — replaced by `expo-crypto`.

## Baseline validation (before any change)

| Check | Result |
| --- | --- |
| `npm ci` | OK (audit warnings) |
| `npx expo lint` | pass |
| `npx tsc --noEmit` | **fail** — 7 errors (dead `lib/*.tsx` imports, i18n literal-type bug) |
| `npx expo-doctor` | **fail** — 2 checks (SDK 53 patch versions out of date) |
| tests | none exist |

## Technical debt summary

1. AsyncStorage blob-per-day storage, no schema, no validation, `.catch(console.error)`.
2. UTC date bug.
3. No i18n in screens, provider not mounted, no English.
4. No theme system (inline styles, hardcoded colors), no dark mode.
5. No tests, no CI, TypeScript errors.
6. No accounts, sync, backup, media, statistics.

## Migration strategy

See `docs/EXECUTION_STATUS.md` (architectural decisions) and `docs/DATABASE.md` (legacy migration). In short:
the app is re-layered (domain → repositories → SQLite) while keeping user data: on first start a versioned,
idempotent importer reads every `meals_*` key, validates and converts each entry into a `meals` row with one
`meal_items` row, inserts in a transaction keyed by deterministic ids, verifies the row counts and records
completion. Original AsyncStorage keys are kept (not deleted) after migration.
