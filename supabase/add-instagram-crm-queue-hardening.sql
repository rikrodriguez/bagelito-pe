create or replace function public.fill_instagram_custom_request()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.handoff_reason = 'custom_feasibility'
     and nullif(trim(coalesce(new.custom_request, '')), '') is null
     and new.source_message_id is not null then
    select nullif(trim(text_content), '')
      into new.custom_request
    from public.instagram_messages
    where id = new.source_message_id;
  end if;
  return new;
end;
$$;

drop trigger if exists instagram_order_drafts_fill_custom_request
on public.instagram_order_drafts;
create trigger instagram_order_drafts_fill_custom_request
before insert or update of handoff_reason, custom_request, source_message_id
on public.instagram_order_drafts
for each row execute function public.fill_instagram_custom_request();

update public.instagram_order_drafts d
set custom_request = m.text_content
from public.instagram_messages m
where d.source_message_id = m.id
  and d.handoff_reason = 'custom_feasibility'
  and nullif(trim(coalesce(d.custom_request, '')), '') is null
  and nullif(trim(coalesce(m.text_content, '')), '') is not null;

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

  update public.instagram_crm_sync_queue older
  set status = 'succeeded',
      processed_at = now(),
      locked_at = null,
      last_error = 'superseded_by_newer_version',
      response_payload = jsonb_build_object(
        'superseded', true,
        'entity_version', older.entity_version
      ),
      updated_at = now()
  where older.status in ('pending','failed')
    and exists (
      select 1
      from public.instagram_crm_sync_queue newer
      where newer.target = older.target
        and newer.entity_type = older.entity_type
        and newer.entity_id = older.entity_id
        and newer.entity_version > older.entity_version
        and newer.status in ('pending','processing','succeeded','failed')
    );

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

revoke all on function public.claim_instagram_crm_sync_jobs(integer)
from public, anon, authenticated;
grant execute on function public.claim_instagram_crm_sync_jobs(integer)
to service_role;
