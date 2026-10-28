-- Instagram inbox foundation for Bagelito.
-- Phase 1 is shadow-mode only: ingest, persist, classify later; never auto-send.

create extension if not exists pgcrypto;

create table if not exists public.instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  instagram_user_id text not null unique,
  username text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.instagram_contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.instagram_accounts(id) on delete cascade,
  instagram_user_id text not null,
  username text null,
  display_name text null,
  detected_language text not null default 'unknown'
    check (detected_language in ('es','en','mixed','unknown')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, instagram_user_id)
);

create table if not exists public.instagram_conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.instagram_accounts(id) on delete cascade,
  contact_id uuid not null references public.instagram_contacts(id) on delete cascade,
  provider_conversation_id text null,
  mode text not null default 'review_required'
    check (mode in ('ai_active','review_required','human_active')),
  status text not null default 'open'
    check (status in ('open','resolved')),
  detected_language text not null default 'unknown'
    check (detected_language in ('es','en','mixed','unknown')),
  last_message_at timestamptz null,
  last_inbound_at timestamptz null,
  last_outbound_at timestamptz null,
  unread_count integer not null default 0 check (unread_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, contact_id)
);

create table if not exists public.instagram_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  processing_error text null
);

create table if not exists public.instagram_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.instagram_conversations(id) on delete cascade,
  provider_message_id text null,
  provider_event_key text not null unique,
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null default 'text',
  text_content text null,
  attachments jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null,
  sent_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists instagram_messages_provider_mid_unique
  on public.instagram_messages(provider_message_id)
  where provider_message_id is not null;

create table if not exists public.instagram_ai_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.instagram_conversations(id) on delete cascade,
  triggering_message_id uuid null references public.instagram_messages(id) on delete set null,
  execution_mode text not null default 'shadow'
    check (execution_mode in ('shadow','draft','auto')),
  intent text null,
  language text not null default 'unknown'
    check (language in ('es','en','mixed','unknown')),
  confidence numeric null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  proposed_reply text null,
  proposed_media jsonb not null default '[]'::jsonb,
  facts_used jsonb not null default '{}'::jsonb,
  model text null,
  status text not null default 'proposed'
    check (status in ('proposed','approved','edited','rejected','escalated','sent','error')),
  human_final_reply text null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.instagram_media_assets (
  id uuid primary key default gen_random_uuid(),
  asset_key text not null unique,
  storage_path text null,
  public_url text null,
  category text not null,
  product_slug text null,
  locale text not null default 'both' check (locale in ('es','en','both')),
  tags text[] not null default '{}',
  approved boolean not null default false,
  sendable boolean not null default false,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path is not null or public_url is not null)
);

create table if not exists public.instagram_conversation_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.instagram_conversations(id) on delete cascade,
  event_type text not null,
  from_mode text null,
  to_mode text null,
  reason text null,
  actor text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists instagram_contacts_last_seen_idx
  on public.instagram_contacts(account_id, last_seen_at desc);
create index if not exists instagram_conversations_last_message_idx
  on public.instagram_conversations(account_id, last_message_at desc);
create index if not exists instagram_messages_conversation_sent_idx
  on public.instagram_messages(conversation_id, sent_at asc);
create index if not exists instagram_ai_runs_conversation_created_idx
  on public.instagram_ai_runs(conversation_id, created_at desc);
create index if not exists instagram_media_assets_category_idx
  on public.instagram_media_assets(category, approved, sendable);

alter table public.instagram_accounts enable row level security;
alter table public.instagram_contacts enable row level security;
alter table public.instagram_conversations enable row level security;
alter table public.instagram_webhook_events enable row level security;
alter table public.instagram_messages enable row level security;
alter table public.instagram_ai_runs enable row level security;
alter table public.instagram_media_assets enable row level security;
alter table public.instagram_conversation_events enable row level security;

revoke all on table public.instagram_accounts from anon, authenticated;
revoke all on table public.instagram_contacts from anon, authenticated;
revoke all on table public.instagram_conversations from anon, authenticated;
revoke all on table public.instagram_webhook_events from anon, authenticated;
revoke all on table public.instagram_messages from anon, authenticated;
revoke all on table public.instagram_ai_runs from anon, authenticated;
revoke all on table public.instagram_media_assets from anon, authenticated;
revoke all on table public.instagram_conversation_events from anon, authenticated;

grant select, insert, update, delete on table public.instagram_accounts to service_role;
grant select, insert, update, delete on table public.instagram_contacts to service_role;
grant select, insert, update, delete on table public.instagram_conversations to service_role;
grant select, insert, update, delete on table public.instagram_webhook_events to service_role;
grant select, insert, update, delete on table public.instagram_messages to service_role;
grant select, insert, update, delete on table public.instagram_ai_runs to service_role;
grant select, insert, update, delete on table public.instagram_media_assets to service_role;
grant select, insert, update, delete on table public.instagram_conversation_events to service_role;
