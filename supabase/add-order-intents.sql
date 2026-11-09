-- BAGELITO: DRAFT ONLY. DO NOT APPLY TO PRODUCTION WITHOUT AUTHORIZATION.
-- Non-binding interest capture; intentionally separate from public.orders/payment_attempts.
create extension if not exists pgcrypto;
create table if not exists public.order_intents (
  id uuid primary key default gen_random_uuid(),
  store_id text not null default 'bagelito-01' check (store_id = 'bagelito-01'),
  source text not null default 'web' check (source = 'web'),
  idempotency_key uuid not null,
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  catalog_version text not null check (catalog_version = 'bagelito.catalog.prices.2026-11-06.v1'),
  customer_name text not null check (char_length(customer_name) between 2 and 100),
  whatsapp text not null check (char_length(whatsapp) between 7 and 15),
  email text not null check (char_length(email) between 5 and 150),
  district text not null check (char_length(district) between 2 and 80),
  delivery_address text null check (delivery_address is null or char_length(delivery_address) between 5 and 200),
  notes text not null default '' check (char_length(notes) <= 350),
  consent_accepted boolean not null check (consent_accepted = true),
  marketing_opt_in boolean not null default false,
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 20),
  status text not null default 'awaiting_human_review' check (status in ('awaiting_human_review','reviewing','approved_for_followup','rejected','expired')),
  review_note text not null default '' check (char_length(review_note) <= 500),
  reviewed_at timestamptz null,
  quote_status text not null default 'review_required' check (quote_status = 'review_required'),
  payment_status text not null default 'not_requested' check (payment_status = 'not_requested'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id,source,idempotency_key)
);
create index if not exists order_intents_review_queue_idx on public.order_intents(status,created_at desc);
alter table public.order_intents enable row level security;
revoke all on table public.order_intents from public, anon, authenticated;
grant select,insert,update on table public.order_intents to service_role;
-- NO PUBLIC POLICIES. Only strictly server-side privileged workflows may read PII.
-- No payment amount, payment proof, charge, kitchen origin or automatic delivery date.

-- Audit and immutable-intent safeguards, in the same transaction as the status change.
create table if not exists public.order_intent_review_history (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null references public.order_intents(id) on delete cascade,
  old_status text not null,
  new_status text not null,
  changed_by text not null default 'admin_panel',
  created_at timestamptz not null default now()
);
create index if not exists order_intent_review_history_lookup_idx
  on public.order_intent_review_history(intent_id, created_at desc);
alter table public.order_intent_review_history enable row level security;
revoke all on table public.order_intent_review_history from public, anon, authenticated;
grant select,insert on table public.order_intent_review_history to service_role;

create or replace function public.guard_order_intent_review_update()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if row(NEW.id,NEW.store_id,NEW.source,NEW.idempotency_key,NEW.payload_fingerprint,
     NEW.catalog_version,NEW.customer_name,NEW.whatsapp,NEW.email,NEW.district,
     NEW.delivery_address,NEW.notes,NEW.consent_accepted,NEW.marketing_opt_in,
     NEW.items,NEW.quote_status,NEW.payment_status,NEW.created_at)
     is distinct from
     row(OLD.id,OLD.store_id,OLD.source,OLD.idempotency_key,OLD.payload_fingerprint,
     OLD.catalog_version,OLD.customer_name,OLD.whatsapp,OLD.email,OLD.district,
     OLD.delivery_address,OLD.notes,OLD.consent_accepted,OLD.marketing_opt_in,
     OLD.items,OLD.quote_status,OLD.payment_status,OLD.created_at) then
    raise exception 'Immutable request fields cannot be altered';
  end if;
  if not (
    (OLD.status = 'awaiting_human_review' and NEW.status in ('reviewing','rejected','expired'))
    or (OLD.status = 'reviewing' and NEW.status in ('approved_for_followup','rejected','expired'))
    or (OLD.status = 'approved_for_followup' and NEW.status in ('reviewing','expired'))
  ) then
    raise exception 'Invalid request review transition';
  end if;
  return NEW;
end;
$$;
drop trigger if exists order_intents_guard_review on public.order_intents;
create trigger order_intents_guard_review before update on public.order_intents
for each row execute function public.guard_order_intent_review_update();

create or replace function public.audit_order_intent_review_status()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  insert into public.order_intent_review_history(intent_id, old_status, new_status, changed_by)
  values(NEW.id, OLD.status, NEW.status, 'admin_panel');
  return NEW;
end;
$$;
drop trigger if exists order_intents_audit_review on public.order_intents;
create trigger order_intents_audit_review after update on public.order_intents
for each row execute function public.audit_order_intent_review_status();
-- DRAFT ONLY: the shared existing admin session does not identify a unique staff member.
