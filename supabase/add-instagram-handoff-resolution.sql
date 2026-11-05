alter table public.instagram_order_drafts
add column if not exists custom_request_status text not null default 'none'
  check (custom_request_status in ('none','pending','approved_standard_pricing','declined')),
add column if not exists handoff_resolved_at timestamptz,
add column if not exists handoff_resolution text,
add column if not exists handoff_resolved_by text;

create or replace function public.resolve_instagram_sales_handoff(
  p_draft_id uuid,
  p_resolution text,
  p_resolved_by text default 'human'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.instagram_order_drafts%rowtype;
  v_resume boolean := false;
begin
  if p_resolution not in ('approved_standard_pricing','declined_continue_standard','resume_standard_flow','resolved_no_resume') then
    raise exception 'invalid_handoff_resolution';
  end if;

  select * into v_draft
  from public.instagram_order_drafts
  where id = p_draft_id
  for update;

  if not found then
    raise exception 'draft_not_found';
  end if;

  if v_draft.handoff_reason is null and v_draft.status <> 'human_review' then
    return jsonb_build_object('ok',true,'duplicate',true,'draft_id',p_draft_id);
  end if;

  if v_draft.handoff_reason = 'custom_feasibility' then
    if p_resolution = 'approved_standard_pricing' then
      v_resume := true;
      update public.instagram_order_drafts
      set handoff_reason=null,
          handoff_at=null,
          handoff_resolved_at=now(),
          handoff_resolution=p_resolution,
          handoff_resolved_by=p_resolved_by,
          custom_request_status='approved_standard_pricing',
          status='active',
          sales_stage='order_configuration',
          quote_verified=false,
          quote_sent_at=null,
          updated_at=now()
      where id=p_draft_id;
    elsif p_resolution = 'declined_continue_standard' then
      v_resume := true;
      update public.instagram_order_drafts
      set handoff_reason=null,
          handoff_at=null,
          handoff_resolved_at=now(),
          handoff_resolution=p_resolution,
          handoff_resolved_by=p_resolved_by,
          custom_request_status='declined',
          custom_request=null,
          status='active',
          sales_stage='order_configuration',
          quote_verified=false,
          quote_sent_at=null,
          updated_at=now()
      where id=p_draft_id;
    else
      update public.instagram_order_drafts
      set handoff_resolved_at=now(),
          handoff_resolution=p_resolution,
          handoff_resolved_by=p_resolved_by,
          updated_at=now()
      where id=p_draft_id;
    end if;
  elsif p_resolution = 'resume_standard_flow' then
    v_resume := true;
    update public.instagram_order_drafts
    set handoff_reason=null,
        handoff_at=null,
        handoff_resolved_at=now(),
        handoff_resolution=p_resolution,
        handoff_resolved_by=p_resolved_by,
        status='active',
        sales_stage='new_inquiry',
        updated_at=now()
    where id=p_draft_id;
  else
    update public.instagram_order_drafts
    set handoff_resolved_at=now(),
        handoff_resolution=p_resolution,
        handoff_resolved_by=p_resolved_by,
        updated_at=now()
    where id=p_draft_id;
  end if;

  if v_resume then
    update public.instagram_conversations c
    set mode='ai_active', updated_at=now()
    where c.id=v_draft.conversation_id
      and c.mode='human_active';
  end if;

  return jsonb_build_object(
    'ok',true,
    'draft_id',p_draft_id,
    'resolution',p_resolution,
    'resumed',v_resume
  );
end;
$$;

revoke all on function public.resolve_instagram_sales_handoff(uuid,text,text) from public;
grant execute on function public.resolve_instagram_sales_handoff(uuid,text,text) to service_role;
