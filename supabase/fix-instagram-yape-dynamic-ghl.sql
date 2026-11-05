create or replace function public.ghl_stage_id_for_instagram_sales_stage(p_stage text)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when coalesce((f.fact_value->>'enabled')::boolean, false)
      then f.fact_value #>> array['stages', coalesce(p_stage,'new_inquiry')]
    else null
  end
  from public.instagram_agent_facts f
  where f.fact_key='ghl_crm_config'
  limit 1;
$$;

create or replace function public.verify_instagram_yape_order(
  p_draft_id uuid,
  p_verified_by text
)
returns table(order_id uuid, order_code text, payment_verified_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.instagram_order_drafts%rowtype;
  v_order public.orders%rowtype;
  v_now timestamptz:=clock_timestamp();
  v_payload jsonb;
  v_fields jsonb;
  v_ghl_config jsonb;
  v_stage_id text;
  v_pipeline_id text;
  v_field_stage text;
  v_field_next_action text;
  v_field_payment_status text;
  v_field_total text;
begin
  if nullif(btrim(p_verified_by),'') is null then
    raise exception 'verified_by_required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_draft_id::text)::bigint);

  select d.* into v_draft
  from public.instagram_order_drafts d
  where d.id=p_draft_id
  for update;
  if not found then raise exception 'instagram_order_draft_not_found'; end if;

  if v_draft.final_order_id is null then
    perform public.finalize_instagram_order_draft(p_draft_id,'instagram-yape-evidence');
    select d.* into v_draft
    from public.instagram_order_drafts d
    where d.id=p_draft_id
    for update;
  end if;

  if v_draft.payment_status not in ('evidence_received','confirmed') then
    raise exception 'payment_evidence_required';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id=v_draft.final_order_id
  for update;
  if not found then raise exception 'final_order_not_found'; end if;

  update public.orders o
  set payment_status='paid',
      payment_paid_at=coalesce(o.payment_paid_at,v_now),
      exact_amount_confirmed=true,
      status='payment_confirmed',
      admin_notes=concat_ws(
        E'\n',
        nullif(o.admin_notes,''),
        'Yape verified by '||p_verified_by||' at '||v_now::text
      )
  where o.id=v_order.id;

  if v_order.status<>'payment_confirmed' then
    insert into public.order_status_history(order_id,old_status,new_status,changed_by)
    values(v_order.id,v_order.status,'payment_confirmed',p_verified_by);
  end if;

  update public.instagram_order_drafts d
  set payment_status='confirmed',
      payment_verified_at=coalesce(d.payment_verified_at,v_now),
      status='confirmed',
      sales_stage='confirmed',
      handoff_reason=null,
      updated_at=v_now
  where d.id=p_draft_id;

  update public.instagram_leads l
  set current_sales_stage='confirmed',
      buyer_signal='payment_sent',
      updated_at=v_now
  where l.id=v_draft.lead_id;

  insert into public.instagram_sales_events(
    conversation_id,
    lead_id,
    draft_id,
    message_id,
    ai_run_id,
    event_type,
    from_stage,
    to_stage,
    actor,
    payload,
    occurred_at
  )
  select
    d.conversation_id,
    d.lead_id,
    d.id,
    d.source_message_id,
    d.last_ai_run_id,
    'payment_verified',
    v_draft.sales_stage,
    'confirmed',
    'human',
    jsonb_build_object(
      'verified_by', p_verified_by,
      'total_amount', d.total_amount,
      'payment_method', d.payment_method
    ),
    v_now
  from public.instagram_order_drafts d
  where d.id=p_draft_id
    and v_draft.payment_status <> 'confirmed';

  select f.fact_value into v_ghl_config
  from public.instagram_agent_facts f
  where f.fact_key='ghl_crm_config'
  limit 1;

  if coalesce((v_ghl_config->>'enabled')::boolean,false)
     and nullif(v_draft.ghl_opportunity_id,'') is not null then

    v_pipeline_id := v_ghl_config->>'pipelineId';
    v_stage_id := v_ghl_config #>> '{stages,confirmed}';
    v_field_stage := v_ghl_config #>> '{opportunityFields,stage}';
    v_field_next_action := v_ghl_config #>> '{opportunityFields,nextBestAction}';
    v_field_payment_status := v_ghl_config #>> '{opportunityFields,paymentStatus}';
    v_field_total := v_ghl_config #>> '{opportunityFields,total}';

    select q.payload into v_payload
    from public.instagram_crm_sync_queue q
    where q.entity_type='opportunity'
      and q.entity_id=p_draft_id
      and q.payload #>> '{opportunity,body,pipelineId}' = v_pipeline_id
    order by q.created_at desc
    limit 1;

    if v_payload is not null
       and nullif(v_pipeline_id,'') is not null
       and nullif(v_stage_id,'') is not null
       and nullif(v_field_stage,'') is not null
       and nullif(v_field_next_action,'') is not null
       and nullif(v_field_payment_status,'') is not null
       and nullif(v_field_total,'') is not null then

      select coalesce(jsonb_agg(field),'[]'::jsonb)
      into v_fields
      from jsonb_array_elements(
        coalesce(v_payload #> '{opportunity,customFields}','[]'::jsonb)
      ) field
      where field->>'id' not in (
        v_field_stage,
        v_field_next_action,
        v_field_payment_status,
        v_field_total
      );

      v_fields := v_fields || jsonb_build_array(
        jsonb_build_object('id',v_field_stage,'fieldValue','confirmed'),
        jsonb_build_object('id',v_field_next_action,'fieldValue','confirm_fulfillment'),
        jsonb_build_object('id',v_field_payment_status,'fieldValue','confirmed'),
        jsonb_build_object('id',v_field_total,'fieldValue',v_draft.total_amount)
      );

      v_payload:=jsonb_set(
        v_payload,'{opportunity,id}',to_jsonb(v_draft.ghl_opportunity_id),true
      );
      v_payload:=jsonb_set(
        v_payload,'{opportunity,body,pipelineId}',to_jsonb(v_pipeline_id),true
      );
      v_payload:=jsonb_set(
        v_payload,'{opportunity,body,pipelineStageId}',to_jsonb(v_stage_id),true
      );
      v_payload:=jsonb_set(
        v_payload,'{opportunity,body,status}',to_jsonb('open'::text),true
      );
      v_payload:=jsonb_set(
        v_payload,'{opportunity,body,monetaryValue}',to_jsonb(v_draft.total_amount),true
      );
      v_payload:=jsonb_set(
        v_payload,'{opportunity,customFields}',v_fields,true
      );

      perform public.enqueue_instagram_crm_sync(
        'opportunity',
        p_draft_id,
        'upsert',
        v_draft.version+1,
        v_payload
      );
    end if;
  end if;

  return query
  select o.id,o.order_code,d.payment_verified_at
  from public.orders o
  join public.instagram_order_drafts d on d.final_order_id=o.id
  where d.id=p_draft_id;
end;
$$;

revoke all on function public.ghl_stage_id_for_instagram_sales_stage(text)
from public, anon, authenticated;
grant execute on function public.ghl_stage_id_for_instagram_sales_stage(text)
to service_role;

revoke all on function public.verify_instagram_yape_order(uuid,text)
from public, anon, authenticated;
grant execute on function public.verify_instagram_yape_order(uuid,text)
to service_role;

revoke all on function public.finalize_instagram_order_draft(uuid,text)
from public, anon, authenticated;
grant execute on function public.finalize_instagram_order_draft(uuid,text)
to service_role;
