-- Nutrition Tracker — initial PostgreSQL schema.
-- Column names of synchronized tables match the local SQLite schema
-- (src/database/migrations.ts). Never edit an applied migration; add a new one.

-- ---------------------------------------------------------------------------
-- Sync trigger: server clock, versioning and controlled last-write-wins.
-- ---------------------------------------------------------------------------
create or replace function public.tg_sync_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Clamp client clocks that run ahead so a wrong device clock cannot make a
  -- record unbeatable forever.
  if new.updated_at > clock_timestamp() + interval '5 minutes' then
    new.updated_at := clock_timestamp();
  end if;

  if tg_op = 'INSERT' then
    new.version := 1;
    new.server_updated_at := clock_timestamp();
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, new.created_at);
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'user_id is immutable' using errcode = '42501';
  end if;

  -- Last-write-wins on the client modification time. Older or equal writes
  -- (including idempotent retries of the same change) are ignored silently.
  if new.updated_at <= old.updated_at then
    return null;
  end if;

  new.created_at := old.created_at;
  new.version := old.version + 1;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account-level tables (not part of the offline sync set).
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  locale text check (locale is null or locale in ('en', 'ru', 'fi')),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  timezone text check (timezone is null or char_length(timezone) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.devices (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web', 'other')),
  app_version text check (app_version is null or char_length(app_version) <= 32),
  name text check (name is null or char_length(name) <= 100),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index devices_user_idx on public.devices (user_id);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.tg_touch_updated_at();
create trigger user_settings_touch before update on public.user_settings
  for each row execute function public.tg_touch_updated_at();
create trigger devices_touch before update on public.devices
  for each row execute function public.tg_touch_updated_at();

-- Create profile + settings rows for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Synchronized, user-owned tables.
-- Every table has: id, user_id, created_at, updated_at (client clock, LWW),
-- deleted_at (soft deletion), server_updated_at (pull cursor), version.
-- ---------------------------------------------------------------------------
create table public.foods (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  brand text check (brand is null or char_length(brand) <= 200),
  barcode text check (barcode is null or barcode ~ '^[0-9]{6,14}$'),
  serving_size double precision not null check (serving_size > 0 and serving_size <= 100000),
  serving_unit text not null check (serving_unit in ('g', 'ml', 'piece', 'serving', 'slice', 'cup', 'tbsp', 'tsp')),
  source text not null default 'custom' check (source in ('custom', 'provider')),
  external_id text check (external_id is null or char_length(external_id) <= 200),
  calories double precision not null check (calories >= 0 and calories <= 20000),
  protein_g double precision check (protein_g is null or protein_g >= 0),
  carbs_g double precision check (carbs_g is null or carbs_g >= 0),
  fat_g double precision check (fat_g is null or fat_g >= 0),
  fiber_g double precision check (fiber_g is null or fiber_g >= 0),
  sugar_g double precision check (sugar_g is null or sugar_g >= 0),
  salt_g double precision check (salt_g is null or salt_g >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (id, user_id)
);
create index foods_user_name_idx on public.foods (user_id, lower(name));
create index foods_barcode_idx on public.foods (barcode) where barcode is not null;

create table public.favorite_foods (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  food_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (user_id, food_id),
  foreign key (food_id, user_id) references public.foods (id, user_id) on delete cascade
);

create table public.nutrition_goals (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  nutrient text not null check (
    nutrient in ('calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'salt_g', 'water_ml')
  ),
  target double precision not null check (target > 0 and target <= 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (user_id, nutrient)
);

create table public.meals (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  eaten_at timestamptz not null,
  local_date date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  title text check (title is null or char_length(title) <= 200),
  notes text check (notes is null or char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (id, user_id)
);
create index meals_user_eaten_idx on public.meals (user_id, eaten_at);
create index meals_user_date_idx on public.meals (user_id, local_date) where deleted_at is null;

create table public.meal_items (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  meal_id uuid not null,
  food_id uuid,
  food_name text not null check (char_length(btrim(food_name)) between 1 and 200),
  quantity double precision not null check (quantity > 0 and quantity <= 100000),
  unit text not null check (unit in ('g', 'ml', 'piece', 'serving', 'slice', 'cup', 'tbsp', 'tsp')),
  source text not null default 'manual' check (
    source in ('manual', 'food', 'recent', 'voice', 'photo_ai', 'legacy', 'import')
  ),
  calories double precision not null check (calories >= 0 and calories <= 20000),
  protein_g double precision check (protein_g is null or protein_g >= 0),
  carbs_g double precision check (carbs_g is null or carbs_g >= 0),
  fat_g double precision check (fat_g is null or fat_g >= 0),
  fiber_g double precision check (fiber_g is null or fiber_g >= 0),
  sugar_g double precision check (sugar_g is null or sugar_g >= 0),
  salt_g double precision check (salt_g is null or salt_g >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  version integer not null default 1,
  -- Composite keys guarantee the parent belongs to the same user.
  foreign key (meal_id, user_id) references public.meals (id, user_id) on delete cascade,
  foreign key (food_id, user_id) references public.foods (id, user_id) on delete set null (food_id)
);
create index meal_items_meal_idx on public.meal_items (meal_id);
create index meal_items_user_created_idx on public.meal_items (user_id, created_at desc);
create index meal_items_food_idx on public.meal_items (food_id) where food_id is not null;

create table public.media_files (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  meal_id uuid not null,
  kind text not null default 'photo' check (kind in ('photo')),
  -- Objects must live inside the owner's folder of the private bucket.
  storage_path text not null check (storage_path like user_id::text || '/%' and storage_path not like '%..%'),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint check (size_bytes is null or (size_bytes >= 0 and size_bytes <= 10485760)),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  version integer not null default 1,
  foreign key (meal_id, user_id) references public.meals (id, user_id) on delete cascade
);
create index media_files_user_meal_idx on public.media_files (user_id, meal_id);

create table public.voice_notes (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  meal_id uuid,
  storage_path text not null check (storage_path like user_id::text || '/%' and storage_path not like '%..%'),
  mime_type text not null check (mime_type like 'audio/%'),
  size_bytes bigint check (size_bytes is null or (size_bytes >= 0 and size_bytes <= 26214400)),
  duration_ms integer check (duration_ms is null or (duration_ms >= 0 and duration_ms <= 1800000)),
  transcript text check (transcript is null or char_length(transcript) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  version integer not null default 1,
  foreign key (meal_id, user_id) references public.meals (id, user_id) on delete set null (meal_id)
);
create index voice_notes_user_meal_idx on public.voice_notes (user_id, meal_id);

create table public.weight_entries (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  measured_at timestamptz not null,
  weight_kg double precision not null check (weight_kg > 0 and weight_kg < 1000),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index weight_entries_user_measured_idx on public.weight_entries (user_id, measured_at);

create table public.water_entries (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  consumed_at timestamptz not null,
  local_date date not null,
  amount_ml integer not null check (amount_ml > 0 and amount_ml <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index water_entries_user_date_idx on public.water_entries (user_id, local_date);

-- Sync trigger + pull-cursor index on every synchronized table.
do $$
declare
  t text;
begin
  foreach t in array array[
    'foods', 'favorite_foods', 'nutrition_goals', 'meals', 'meal_items',
    'media_files', 'voice_notes', 'weight_entries', 'water_entries'
  ] loop
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.tg_sync_row()',
      t || '_sync', t
    );
    execute format(
      'create index %I on public.%I (user_id, server_updated_at, id)',
      t || '_pull_idx', t
    );
  end loop;
end;
$$;
