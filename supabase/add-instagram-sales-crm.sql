create extension if not exists pgcrypto;

create table if not exists public.instagram_leads (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null unique references public.instagram_contacts(id) on delete cascade,
  source text not null default 'instagram',
  status text not null default 'active'
    check (status in ('active','customer','lost','do_not_contact')),
  current_sales_stage text not null default 'new_inquiry'
    check (current_sales_stage in (
      'new_inquiry','menu_discovery','recommendation','order_configuration',
      'details_collection','quote_ready','payment_pending',
      'payment_evidence_received','confirmed','production','delivery',
      'completed','lost','human_review'
    )),
  buyer_signal text,
  first_intent text,
  last_intent text,
  preferred_language text,
  preferred_flavors jsonb not null default '[]'::jsonb,
  notes text,
  ghl_contact_id text,
  lifetime_order_count integer not null default 0 check (lifetime_order_count >= 0),
  lifetime_revenue numeric(12,2) not null default 0 check (lifetime_revenue >= 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.instagram_order_drafts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.instagram_conversations(id) on delete cascade,
  contact_id uuid not null references public.instagram_contacts(id) on delete cascade,
  lead_id uuid references public.instagram_leads(id) on delete set null,
  batch_id uuid references public.batches(id) on delete set null,
  final_order_id uuid references public.orders(id) on delete set null,
  source_message_id uuid references public.instagram_messages(id) on delete set null,
  last_ai_run_id uuid references public.instagram_ai_runs(id) on delete set null,
  version integer not null default 1 check (version >= 1),
  sales_stage text not null default 'new_inquiry'
    check (sales_stage in (
      'new_inquiry','menu_discovery','recommendation','order_configuration',
      'details_collection','quote_ready','payment_pending',
      'payment_evidence_received','confirmed','production','delivery',
      'completed','lost','human_review'
    )),
  buyer_signal text,
  status text not null default 'active'
    check (status in ('active','quoted','payment_pending','payment_verification','confirmed','in_production','ready_for_delivery','delivered','lost','cancelled','human_review')),
  pack_slug text,
  pack_name text,
  units integer check (units is null or units > 0),
  customer_name text,
  phone text,
  email text,
  district text,
  delivery_address text,
  address_reference text,
  delivery_notes text,
  requested_delivery_at timestamptz,
  custom_request text,
  currency text not null default 'PEN' check (currency = 'PEN'),
  items_subtotal numeric(12,2) check (items_subtotal is null or items_subtotal >= 0),
  schmears_subtotal numeric(12,2) check (schmears_subtotal is null or schmears_subtotal >= 0),
  delivery_fee numeric(12,2) check (delivery_fee is null or delivery_fee >= 0),
  total_amount numeric(12,2) check (total_amount is null or total_amount >= 0),
  quote_verified boolean not null default false,
  quote_sent_at timestamptz,
  payment_method text,
  payment_status text not null default 'none'
    check (payment_status in ('none','pending','evidence_received','confirmed','failed','refunded')),
  payment_evidence_path text,
  payment_evidence_received_at timestamptz,
  payment_verified_at timestamptz,
  handoff_reason text,
  handoff_at timestamptz,
  ghl_opportunity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists instagram_order_drafts_one_active_per_conversation_idx
  on public.instagram_order_drafts(conversation_id)
  where status not in ('delivered','lost','cancelled');

create index if not exists instagram_order_drafts_stage_idx
  on public.instagram_order_drafts(sales_stage, updated_at desc);

create index if not exists instagram_order_drafts_batch_idx
  on public.instagram_order_drafts(batch_id, status);

create index if not exists instagram_order_drafts_payment_idx
  on public.instagram_order_drafts(payment_status, updated_at desc);

create table if not exists public.instagram_order_draft_items (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.instagram_order_drafts(id) on delete cascade,
  item_kind text not null check (item_kind in ('bagel','schmear','addon')),
  item_key text not null,
  item_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) check (unit_price is null or unit_price >= 0),
  line_total numeric(12,2) generated always as (
    case when unit_price is null then null else round(unit_price * quantity, 2) end
  ) stored,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_id, item_kind, item_key)
);

create index if not exists instagram_order_draft_items_kind_idx
  on public.instagram_order_draft_items(item_kind, item_key);

create table if not exists public.instagram_sales_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.instagram_conversations(id) on delete cascade,
  lead_id uuid references public.instagram_leads(id) on delete set null,
  draft_id uuid references public.instagram_order_drafts(id) on delete set null,
  message_id uuid references public.instagram_messages(id) on delete set null,
  ai_run_id uuid references public.instagram_ai_runs(id) on delete set null,
  event_type text not null,
  from_stage text,
  to_stage text,
  actor text not null default 'system' check (actor in ('customer','ai','human','system')),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists instagram_sales_events_conversation_idx
  on public.instagram_sales_events(conversation_id, occurred_at desc);

create index if not exists instagram_sales_events_draft_idx
  on public.instagram_sales_events(draft_id, occurred_at desc);

create table if not exists public.instagram_crm_sync_queue (
  id uuid primary key default gen_random_uuid(),
  target text not null default 'ghl' check (target = 'ghl'),
  entity_type text not null check (entity_type in ('contact','opportunity','order')),
  entity_id uuid not null,
  operation text not null check (operation in ('upsert','stage_update','status_update','note')),
  entity_version integer not null check (entity_version >= 1),
  idempotency_key text not null unique,
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending','processing','succeeded','failed','dead')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  response_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists instagram_crm_sync_queue_pending_idx
  on public.instagram_crm_sync_queue(status, available_at, created_at)
  where status in ('pending','failed');

create or replace function public.instagram_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists instagram_leads_touch_updated_at on public.instagram_leads;
create trigger instagram_leads_touch_updated_at
before update on public.instagram_leads
for each row execute function public.instagram_touch_updated_at();

drop trigger if exists instagram_order_drafts_touch_updated_at on public.instagram_order_drafts;
create trigger instagram_order_drafts_touch_updated_at
before update on public.instagram_order_drafts
for each row execute function public.instagram_touch_updated_at();

drop trigger if exists instagram_order_draft_items_touch_updated_at on public.instagram_order_draft_items;
create trigger instagram_order_draft_items_touch_updated_at
before update on public.instagram_order_draft_items
for each row execute function public.instagram_touch_updated_at();

drop trigger if exists instagram_crm_sync_queue_touch_updated_at on public.instagram_crm_sync_queue;
create trigger instagram_crm_sync_queue_touch_updated_at
before update on public.instagram_crm_sync_queue
for each row execute function public.instagram_touch_updated_at();

create or replace function public.instagram_bump_order_draft_version()
returns trigger
language plpgsql
as $$
begin
  if row(new.*) is distinct from row(old.*) then
    new.version = old.version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists instagram_order_drafts_bump_version on public.instagram_order_drafts;
create trigger instagram_order_drafts_bump_version
before update on public.instagram_order_drafts
for each row execute function public.instagram_bump_order_draft_version();

create or replace function public.enqueue_instagram_crm_sync(
  p_entity_type text,
  p_entity_id uuid,
  p_operation text,
  p_entity_version integer,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_key text;
begin
  if p_entity_type not in ('contact','opportunity','order') then
    raise exception 'invalid_entity_type';
  end if;
  if p_operation not in ('upsert','stage_update','status_update','note') then
    raise exception 'invalid_operation';
  end if;
  if p_entity_version < 1 then
    raise exception 'invalid_entity_version';
  end if;

  v_key := format('ghl:%s:%s:v%s', p_entity_type, p_entity_id, p_entity_version);

  insert into public.instagram_crm_sync_queue (
    entity_type,
    entity_id,
    operation,
    entity_version,
    idempotency_key,
    payload
  ) values (
    p_entity_type,
    p_entity_id,
    p_operation,
    p_entity_version,
    v_key,
    p_payload
  )
  on conflict (idempotency_key) do update
  set payload = excluded.payload,
      updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.enqueue_instagram_crm_sync(text,uuid,text,integer,jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_instagram_crm_sync(text,uuid,text,integer,jsonb) to service_role;

create or replace view public.instagram_production_by_flavor
with (security_invoker = true)
as
select
  d.batch_id,
  i.item_key as flavor_key,
  max(i.item_name) as flavor_name,
  sum(i.quantity)::integer as bagels_required,
  count(distinct d.id)::integer as order_count
from public.instagram_order_drafts d
join public.instagram_order_draft_items i on i.draft_id = d.id
where i.item_kind = 'bagel'
  and d.status in ('confirmed','in_production','ready_for_delivery')
group by d.batch_id, i.item_key;

create or replace view public.instagram_delivery_schedule
with (security_invoker = true)
as
select
  d.id as draft_id,
  d.final_order_id,
  d.batch_id,
  d.customer_name,
  d.phone,
  d.district,
  d.delivery_address,
  d.address_reference,
  d.delivery_notes,
  d.requested_delivery_at,
  d.status,
  d.payment_status,
  d.total_amount
from public.instagram_order_drafts d
where d.status in ('confirmed','in_production','ready_for_delivery');

create or replace view public.instagram_sales_pipeline_summary
with (security_invoker = true)
as
select
  sales_stage,
  status,
  payment_status,
  count(*)::integer as order_count,
  coalesce(sum(total_amount), 0)::numeric(12,2) as pipeline_value,
  coalesce(sum(total_amount) filter (where payment_status = 'confirmed'), 0)::numeric(12,2) as confirmed_revenue
from public.instagram_order_drafts
group by sales_stage, status, payment_status;

create or replace view public.instagram_payment_state_summary
with (security_invoker = true)
as
select
  payment_status,
  count(*)::integer as order_count,
  coalesce(sum(total_amount), 0)::numeric(12,2) as total_value
from public.instagram_order_drafts
group by payment_status;

alter table public.instagram_leads enable row level security;
alter table public.instagram_order_drafts enable row level security;
alter table public.instagram_order_draft_items enable row level security;
alter table public.instagram_sales_events enable row level security;
alter table public.instagram_crm_sync_queue enable row level security;

revoke all on public.instagram_leads from anon, authenticated;
revoke all on public.instagram_order_drafts from anon, authenticated;
revoke all on public.instagram_order_draft_items from anon, authenticated;
revoke all on public.instagram_sales_events from anon, authenticated;
revoke all on public.instagram_crm_sync_queue from anon, authenticated;
revoke all on public.instagram_production_by_flavor from anon, authenticated;
revoke all on public.instagram_delivery_schedule from anon, authenticated;
revoke all on public.instagram_sales_pipeline_summary from anon, authenticated;
revoke all on public.instagram_payment_state_summary from anon, authenticated;

grant select, insert, update, delete on public.instagram_leads to service_role;
grant select, insert, update, delete on public.instagram_order_drafts to service_role;
grant select, insert, update, delete on public.instagram_order_draft_items to service_role;
grant select, insert, update, delete on public.instagram_sales_events to service_role;
grant select, insert, update, delete on public.instagram_crm_sync_queue to service_role;
grant select on public.instagram_production_by_flavor to service_role;
grant select on public.instagram_delivery_schedule to service_role;
grant select on public.instagram_sales_pipeline_summary to service_role;
grant select on public.instagram_payment_state_summary to service_role;
