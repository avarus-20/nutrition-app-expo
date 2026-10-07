-- Row Level Security: every user-owned table is private to its owner.
-- Clients never hard-delete synchronized rows (soft deletion via deleted_at),
-- so synchronized tables have no DELETE policy.

-- Explicit privileges (Supabase grants broad defaults; we narrow them).
revoke all on all tables in schema public from anon;

do $$
declare
  t text;
begin
  foreach t in array array[
    'foods', 'favorite_foods', 'nutrition_goals', 'meals', 'meal_items',
    'media_files', 'voice_notes', 'weight_entries', 'water_entries'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || '_insert_own', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_update_own', t
    );
  end loop;
end;
$$;

-- profiles
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
revoke all on public.profiles from anon, authenticated;
grant select, update (display_name) on public.profiles to authenticated;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- user_settings
alter table public.user_settings enable row level security;
alter table public.user_settings force row level security;
revoke all on public.user_settings from anon, authenticated;
grant select, update (locale, theme, timezone) on public.user_settings to authenticated;
create policy user_settings_select_own on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy user_settings_update_own on public.user_settings
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- devices
alter table public.devices enable row level security;
alter table public.devices force row level security;
revoke all on public.devices from anon, authenticated;
grant select, insert, update, delete on public.devices to authenticated;
create policy devices_select_own on public.devices
  for select to authenticated using (user_id = (select auth.uid()));
create policy devices_insert_own on public.devices
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy devices_update_own on public.devices
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy devices_delete_own on public.devices
  for delete to authenticated using (user_id = (select auth.uid()));

-- Trigger functions must not be callable through the API.
revoke execute on function public.tg_sync_row() from public, anon, authenticated;
revoke execute on function public.tg_touch_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
