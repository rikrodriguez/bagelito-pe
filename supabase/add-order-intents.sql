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
