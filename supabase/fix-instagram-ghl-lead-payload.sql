create or replace function public.prepare_instagram_ghl_lead_payload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.instagram_leads%rowtype;
  v_contact public.instagram_contacts%rowtype;
  v_config jsonb;
  v_name text;
  v_stage text;
  v_pipeline_id text;
  v_stage_id text;
  v_field_stage text;
  v_field_next_action text;
  v_opp jsonb;
begin
  if new.target <> 'ghl'
     or new.entity_type <> 'contact'
     or new.operation <> 'upsert' then
    return new;
  end if;

  if coalesce(new.payload->'opportunity','null'::jsonb) <> 'null'::jsonb then
    return new;
  end if;

  select f.fact_value
    into v_config
  from public.instagram_agent_facts f
  where f.fact_key='ghl_crm_config'
  limit 1;

  if v_config is null
     or coalesce((v_config->>'enabled')::boolean,false) is not true then
    return new;
  end if;

  v_pipeline_id := nullif(v_config->>'pipelineId','');
  v_field_stage := nullif(v_config #>> '{opportunityFields,stage}','');
  v_field_next_action := nullif(v_config #>> '{opportunityFields,nextBestAction}','');

  if v_pipeline_id is null
     or v_field_stage is null
     or v_field_next_action is null then
    return new;
  end if;

  select *
    into v_lead
  from public.instagram_leads
  where id=coalesce((new.payload->>'leadId')::uuid,new.entity_id);

  if not found then
    return new;
  end if;

  select *
    into v_contact
  from public.instagram_contacts
  where id=v_lead.contact_id;

  if not found then
    return new;
  end if;

  v_stage := coalesce(v_lead.current_sales_stage,'new_inquiry');
  v_stage_id := nullif(
    coalesce(
      v_config #>> array['stages',v_stage],
      v_config #>> '{stages,new_inquiry}'
    ),
    ''
  );

  if v_stage_id is null then
    return new;
  end if;

  v_name := coalesce(
    nullif(btrim(v_contact.display_name),''),
    nullif(btrim(v_contact.username),''),
    'Instagram Lead '||right(v_contact.instagram_user_id,6)
  );

  v_opp := jsonb_build_object(
    'id',v_lead.ghl_opportunity_id,
    'body',jsonb_build_object(
      'pipelineId',v_pipeline_id,
      'pipelineStageId',v_stage_id,
      'name','Bagelito | '||v_name,
      'status',case
        when v_stage='completed' then 'won'
        when v_stage='lost' then 'lost'
        else 'open'
      end,
      'monetaryValue',0
    ),
    'customFields',jsonb_build_array(
      jsonb_build_object('id',v_field_stage,'fieldValue',v_stage),
      jsonb_build_object(
        'id',
        v_field_next_action,
        'fieldValue',
        public.instagram_next_action_for_stage(v_stage)
      )
    )
  );

  new.payload := jsonb_set(new.payload,'{opportunity}',v_opp,true);
  return new;
end;
$$;

revoke all on function public.prepare_instagram_ghl_lead_payload()
from public, anon, authenticated;
grant execute on function public.prepare_instagram_ghl_lead_payload()
to service_role;
