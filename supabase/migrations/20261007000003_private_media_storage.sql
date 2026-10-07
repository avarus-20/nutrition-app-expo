-- Private object storage for meal photos and voice notes.
-- Object names are `<user_id>/<kind>/<record_id>.<ext>`; access is limited to
-- the owner's top-level folder. The bucket is never public: clients use
-- authenticated downloads or short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-media',
  'user-media',
  false,
  26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp',
    'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/wav'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy user_media_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'user-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy user_media_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'user-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy user_media_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'user-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'user-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy user_media_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'user-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
