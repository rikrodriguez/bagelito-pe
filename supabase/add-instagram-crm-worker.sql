create or replace function public.claim_instagram_crm_sync_jobs(p_limit integer default 10)
returns setof public.instagram_crm_sync_queue
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_limit < 1 or p_limit > 50 then
    raise exception 'invalid_claim_limit';
  end if;

  return query
  with candidates as (
    select id
    from public.instagram_crm_sync_queue
    where status in ('pending','failed')
      and available_at <= now()
    order by created_at
    for update skip locked
    limit p_limit
  )
  update public.instagram_crm_sync_queue q
  set status = 'processing',
      attempts = q.attempts + 1,
      locked_at = now(),
      updated_at = now()
  from candidates
  where q.id = candidates.id
  returning q.*;
end;
$$;

create or replace function public.complete_instagram_crm_sync_job(
  p_id uuid,
  p_success boolean,
  p_response_payload jsonb default null,
  p_error text default null,
  p_retry_seconds integer default 60
)
returns public.instagram_crm_sync_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.instagram_crm_sync_queue;
begin
  if p_retry_seconds < 0 or p_retry_seconds > 86400 then
    raise exception 'invalid_retry_seconds';
  end if;

  update public.instagram_crm_sync_queue
  set status = case
        when p_success then 'succeeded'
        when attempts >= 5 then 'dead'
        else 'failed'
      end,
      processed_at = case when p_success then now() else processed_at end,
      available_at = case
        when p_success or attempts >= 5 then available_at
        else now() + make_interval(secs => p_retry_seconds)
      end,
      locked_at = null,
      last_error = case when p_success then null else left(coalesce(p_error, 'unknown_error'), 2000) end,
      response_payload = p_response_payload,
      updated_at = now()
  where id = p_id
  returning * into v_job;

  if v_job.id is null then
    raise exception 'crm_sync_job_not_found';
  end if;

  return v_job;
end;
$$;

create or replace function public.requeue_stale_instagram_crm_sync_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.instagram_crm_sync_queue
  set status = case when attempts >= 5 then 'dead' else 'failed' end,
      available_at = now(),
      locked_at = null,
      last_error = coalesce(last_error, 'stale_processing_lock'),
      updated_at = now()
  where status = 'processing'
    and locked_at < now() - interval '10 minutes';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.claim_instagram_crm_sync_jobs(integer) from public, anon, authenticated;
revoke all on function public.complete_instagram_crm_sync_job(uuid,boolean,jsonb,text,integer) from public, anon, authenticated;
revoke all on function public.requeue_stale_instagram_crm_sync_jobs() from public, anon, authenticated;

grant execute on function public.claim_instagram_crm_sync_jobs(integer) to service_role;
grant execute on function public.complete_instagram_crm_sync_job(uuid,boolean,jsonb,text,integer) to service_role;
grant execute on function public.requeue_stale_instagram_crm_sync_jobs() to service_role;
