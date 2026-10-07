// Deletes the calling user's account, storage objects and (via ON DELETE
// CASCADE) every row they own. Runs server-side with the service role key,
// which Supabase injects into Edge Functions; it never reaches the client.
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = Deno.env.get('MEDIA_BUCKET') ?? 'user-media';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'unauthorized' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json(401, { error: 'unauthorized' });
  const userId = userData.user.id;

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Remove every object below <userId>/ (paged listing per folder).
  for (const folder of ['photo', 'voice']) {
    for (;;) {
      const { data: files, error } = await admin.storage.from(BUCKET).list(`${userId}/${folder}`, { limit: 100 });
      if (error) return json(500, { error: 'storage_list_failed' });
      if (!files || files.length === 0) break;
      const { error: removeError } = await admin.storage
        .from(BUCKET)
        .remove(files.map((f) => `${userId}/${folder}/${f.name}`));
      if (removeError) return json(500, { error: 'storage_remove_failed' });
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) return json(500, { error: 'delete_failed' });
  return json(200, { deleted: true });
});
