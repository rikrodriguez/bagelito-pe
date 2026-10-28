create table if not exists public.instagram_runtime_settings (
  id text primary key,
  enabled boolean not null default false,
  mode text not null default 'shadow'
    check (mode in ('shadow','test_auto','auto')),
  test_recipient_igsid text,
  min_confidence numeric not null default 0.92
    check (min_confidence >= 0 and min_confidence <= 1),
  auto_intents text[] not null default array[
    'menu','price','flavors','product_photo','batch_status',
    'delivery_area','how_to_order','storage','reheating'
  ]::text[],
  media_enabled boolean not null default true,
  max_media integer not null default 7 check (max_media between 0 and 7),
  updated_at timestamptz not null default now()
);

alter table public.instagram_runtime_settings enable row level security;
revoke all on table public.instagram_runtime_settings from anon, authenticated;
grant select, insert, update, delete on table public.instagram_runtime_settings to service_role;

create table if not exists public.instagram_outbound_sends (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.instagram_conversations(id) on delete cascade,
  ai_run_id uuid references public.instagram_ai_runs(id) on delete set null,
  provider_message_id text not null unique,
  recipient_igsid text not null,
  kind text not null check (kind in ('text','image')),
  asset_key text,
  source text not null default 'ai' check (source in ('ai')),
  created_at timestamptz not null default now()
);

alter table public.instagram_outbound_sends enable row level security;
revoke all on table public.instagram_outbound_sends from anon, authenticated;
grant select, insert, update, delete on table public.instagram_outbound_sends to service_role;

create index if not exists instagram_outbound_sends_conversation_idx
  on public.instagram_outbound_sends(conversation_id, created_at desc);
