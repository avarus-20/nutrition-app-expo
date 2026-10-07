-- Per-user quota for the AI Edge Functions (estimate-photo, transcribe), so a
-- leaked session or a buggy client cannot run up provider costs. Only the
-- Edge Functions (service role) can read or change the counters.

create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  function_name text not null check (function_name in ('estimate-photo', 'transcribe')),
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, function_name, window_start)
);

create index idx_ai_usage_window on public.ai_usage (window_start);

alter table public.ai_usage enable row level security;
-- No policies: API roles have no access at all.
revoke all on public.ai_usage from anon, authenticated;

/**
 * Atomically counts one request in the current fixed window and reports
 * whether it is within `p_limit`. Windows older than a day are pruned.
 */
create or replace function public.consume_ai_quota(
  p_user_id uuid,
  p_function text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid quota parameters';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.ai_usage as u (user_id, function_name, window_start, request_count)
  values (p_user_id, p_function, v_window, 1)
  on conflict (user_id, function_name, window_start)
  do update set request_count = u.request_count + 1
  returning u.request_count into v_count;

  delete from public.ai_usage
  where user_id = p_user_id and function_name = p_function and window_start < now() - interval '1 day';

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_ai_quota(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, text, integer, integer) to service_role;
