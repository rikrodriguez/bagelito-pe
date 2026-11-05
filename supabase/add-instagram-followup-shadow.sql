create table if not exists public.instagram_followup_queue (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.instagram_conversations(id) on delete cascade,
  draft_id uuid references public.instagram_order_drafts(id) on delete set null,
  source_last_inbound_at timestamptz not null,
  stage text not null,
  objective text not null,
  status text not null default 'candidate'
    check (status in ('candidate','shadow_generated','approved','sent','skipped','expired','error')),
  eligible_at timestamptz not null,
  expires_at timestamptz not null,
  proposed_messages jsonb not null default '[]'::jsonb,
  model text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  generated_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, source_last_inbound_at)
);

create index if not exists instagram_followup_queue_status_idx
  on public.instagram_followup_queue(status, eligible_at, expires_at);

create or replace function public.instagram_followup_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists instagram_followup_queue_touch_updated_at
on public.instagram_followup_queue;
create trigger instagram_followup_queue_touch_updated_at
before update on public.instagram_followup_queue
for each row execute function public.instagram_followup_touch_updated_at();

create or replace function public.refresh_instagram_followup_candidates()
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  update public.instagram_followup_queue q
  set status = 'expired',
      reason = case
        when c.last_inbound_at is distinct from q.source_last_inbound_at
          then 'customer_replied_or_window_reopened'
        else 'messaging_window_safety_cutoff'
      end,
      updated_at = now()
  from public.instagram_conversations c
  where c.id = q.conversation_id
    and q.status in ('candidate','shadow_generated','approved')
    and (
      c.last_inbound_at is distinct from q.source_last_inbound_at
      or now() > q.expires_at
    );

  insert into public.instagram_followup_queue (
    conversation_id,
    draft_id,
    source_last_inbound_at,
    stage,
    objective,
    status,
    eligible_at,
    expires_at,
    metadata
  )
  select
    c.id,
    d.id,
    c.last_inbound_at,
    coalesce(d.sales_stage, l.current_sales_stage, 'new_inquiry') as stage,
    case coalesce(d.sales_stage, l.current_sales_stage, 'new_inquiry')
      when 'payment_pending' then 'gentle_payment_reminder'
      when 'details_collection' then 'collect_missing_details'
      when 'order_configuration' then 'resume_order_choice'
      when 'recommendation' then 'resume_recommendation'
      else 'reopen_choice'
    end as objective,
    'candidate',
    c.last_outbound_at + interval '4 hours',
    c.last_inbound_at + interval '23 hours',
    jsonb_build_object(
      'policy_version','bagelito-instagram-followup-2026-11-04-v1',
      'shadow_only',true,
      'standard_window_hours',24,
      'safety_buffer_minutes',60,
      'missing_fields', to_jsonb(array_remove(array[
        case when d.id is not null and not exists (
          select 1 from public.instagram_order_draft_items i
          where i.draft_id=d.id and i.item_kind='bagel' and i.quantity>0
        ) then 'items' end,
        case when d.id is not null and coalesce(trim(d.customer_name),'')='' then 'customer_name' end,
        case when d.id is not null and coalesce(trim(d.phone),'')='' then 'phone' end,
        case when d.id is not null and coalesce(trim(d.district),'')='' then 'district' end,
        case when d.id is not null and coalesce(trim(d.delivery_address),'')='' then 'address' end
      ],null))
    )
  from public.instagram_conversations c
  left join public.instagram_leads l
    on l.contact_id = c.contact_id
  left join lateral (
    select d0.*
    from public.instagram_order_drafts d0
    where d0.conversation_id = c.id
      and d0.status not in ('delivered','lost','cancelled')
    order by d0.updated_at desc
    limit 1
  ) d on true
  where c.last_inbound_at is not null
    and c.last_outbound_at is not null
    and c.last_outbound_at > c.last_inbound_at
    and coalesce(c.mode,'ai_active') <> 'human_active'
    and now() >= c.last_outbound_at + interval '4 hours'
    and now() <= c.last_inbound_at + interval '23 hours'
    and coalesce(d.handoff_reason,'') = ''
    and coalesce(d.sales_stage, l.current_sales_stage, 'new_inquiry') in (
      'menu_discovery',
      'recommendation',
      'order_configuration',
      'details_collection',
      'quote_ready',
      'payment_pending'
    )
    and coalesce(d.sales_stage, l.current_sales_stage, 'new_inquiry') not in (
      'payment_evidence_received',
      'confirmed',
      'production',
      'delivery',
      'completed',
      'lost',
      'human_review'
    )
  on conflict (conversation_id, source_last_inbound_at) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

alter table public.instagram_followup_queue enable row level security;
revoke all on public.instagram_followup_queue from anon, authenticated;
grant select, insert, update, delete on public.instagram_followup_queue to service_role;

revoke all on function public.refresh_instagram_followup_candidates()
from public, anon, authenticated;
grant execute on function public.refresh_instagram_followup_candidates()
to service_role;
