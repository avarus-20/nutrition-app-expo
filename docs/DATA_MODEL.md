# Data model

The physical schema (tables, constraints, indexes, RLS) is in [DATABASE.md](DATABASE.md). This document covers what the data *means* and how it leaves the app (backup and CSV export).

## Entities

| Entity | Meaning | Notes |
| --- | --- | --- |
| `meals` | One eating occasion on a local day | `local_date` (YYYY-MM-DD, the user's calendar day at logging time) is what day views and statistics group by; `eaten_at` is the exact instant (ISO 8601 UTC). `meal_type` ∈ breakfast, lunch, dinner, snack |
| `meal_items` | One food in a meal | Nutrition is stored **per item as eaten** (already scaled to `quantity`), so later edits to a saved food never change history. `food_id` is an optional link to the food it came from |
| `foods` | The user's food library | Nutrition per `serving_size` + `serving_unit`; `source` = custom or provider |
| `favorite_foods` | Favorite marker for a food | Unique per (user, food) |
| `nutrition_goals` | Daily targets | Unique per (user, nutrient); nutrients: calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, salt_g, water_ml |
| `weight_entries` | Body weight measurement | kg, `measured_at` instant |
| `water_entries` | Drink | ml, grouped by `local_date` |
| `media_files` | Photo attached to a meal | Binary on the device (`local_uri`) and/or in private storage (`storage_path`) |
| `voice_notes` | Recording, optionally attached to a meal | Same storage model as photos, plus `duration_ms` and `transcript` |
| `entry_drafts` | Device-local, unconfirmed entries from photo/voice recognition | Not synchronized and not backed up |

Units: `g`, `ml`, `piece`, `serving`, `slice`, `cup`, `tbsp`, `tsp`. Energy is kcal; macronutrients and salt are grams. Unknown values are `null` (not 0); calories are always known.

Item `source`: `manual`, `food` (from the library), `recent`, `voice`, `photo_ai`, `legacy` (imported from the prototype's AsyncStorage) and `import`.

Every synchronized record has `id` (client-generated UUID), `user_id`, `created_at`, `updated_at` (last-write-wins clock), `deleted_at` (soft delete), `server_updated_at` and `version` (set by the server). See [OFFLINE_SYNC.md](OFFLINE_SYNC.md).

## Backup format (JSON, version 1)

Settings → *Backup and export* → *Export backup* (`src/services/backupService.ts`). Native platforms open the share sheet; the browser downloads the file.

```json
{
  "format": "nutrition-tracker-backup",
  "version": 1,
  "exported_at": "2026-10-07T09:00:00.000Z",
  "app_version": "1.0.0",
  "data": {
    "foods": [{ "id": "…", "created_at": "…", "updated_at": "…", "name": "Oat porridge", "serving_size": 250, "serving_unit": "g", "calories": 180, "…": "…" }],
    "favorite_foods": [],
    "nutrition_goals": [],
    "meals": [],
    "meal_items": [],
    "weight_entries": [],
    "water_entries": []
  }
}
```

- Contains every live (not deleted) record of the current owner, in dependency order.
- Excluded: `user_id`, `deleted_at`, `server_updated_at`, `version` (account/device specific), photos and voice notes (binaries tied to device storage or the account's bucket), drafts, preferences.
- Format changes increase `version`. Older app versions refuse newer files (`unsupported_version`); newer app versions must keep reading every older version.

### Restore rules

1. The whole file is validated before anything is written: format marker, version, and every record against the same schemas used for server rows (`src/sync/remoteSchemas.ts`). Unknown fields are ignored; any invalid record rejects the file.
2. Duplicate ids inside the file collapse to the copy with the newest `updated_at`.
3. Merge per record, in one transaction:
   - unknown id → inserted for the current owner;
   - existing id → replaced only if the backup copy is newer (`updated_at`); a newer local edit or deletion wins;
   - goals and favorites are matched by their natural key (nutrient / food) as well, so a goal is never duplicated;
   - a meal item whose meal (or a favorite whose food) is neither local nor in the file is skipped, as is any record violating a local constraint.
4. Restored changes go through the outbox, so a signed-in user's restore is synchronized.
5. Restoring the same file again changes nothing ("0 new, 0 updated, N unchanged").

## CSV export

*Export entries (CSV)*: one row per logged food item, oldest first, UTF-8 with BOM and CRLF line endings (opens directly in Excel, Numbers, LibreOffice, Google Sheets).

`date,time,meal,food,quantity,unit,calories_kcal,protein_g,carbs_g,fat_g,fiber_g,sugar_g,salt_g,source`

Text cells starting with `= + - @` are prefixed with `'` to prevent spreadsheet formula injection (`src/utils/csv.ts`). Unknown nutrients are empty cells.
