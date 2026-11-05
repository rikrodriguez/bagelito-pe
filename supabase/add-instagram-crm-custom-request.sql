create or replace function public.enrich_instagram_crm_queue_payload()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_custom_request text;
  v_fields jsonb;
begin
  if new.entity_type <> 'opportunity' then
    return new;
  end if;

  select nullif(trim(custom_request), '')
    into v_custom_request
  from public.instagram_order_drafts
  where id = new.entity_id;

  if v_custom_request is null then
    return new;
  end if;

  select coalesce(jsonb_agg(field), '[]'::jsonb)
    into v_fields
  from jsonb_array_elements(
    coalesce(new.payload #> '{opportunity,customFields}', '[]'::jsonb)
  ) as field
  where field->>'id' <> 'YMf2Xh1tPGAmXWY1Hqko';

  v_fields := v_fields || jsonb_build_array(
    jsonb_build_object(
      'id', 'YMf2Xh1tPGAmXWY1Hqko',
      'fieldValue', v_custom_request
    )
  );

  new.payload := jsonb_set(
    new.payload,
    '{opportunity,customFields}',
    v_fields,
    true
  );
  return new;
end;
$$;

drop trigger if exists instagram_crm_sync_queue_enrich_payload
on public.instagram_crm_sync_queue;
create trigger instagram_crm_sync_queue_enrich_payload
before insert or update of payload, entity_id, entity_version
on public.instagram_crm_sync_queue
for each row execute function public.enrich_instagram_crm_queue_payload();

update public.instagram_crm_sync_queue q
set entity_version = d.version,
    idempotency_key = format('ghl:%s:%s:v%s', q.entity_type, q.entity_id, d.version),
    payload = q.payload,
    updated_at = now()
from public.instagram_order_drafts d
where q.entity_type = 'opportunity'
  and q.entity_id = d.id
  and q.status in ('pending','failed')
  and q.entity_version < d.version;
