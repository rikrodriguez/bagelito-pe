alter table public.instagram_ai_runs
add column if not exists proposed_messages jsonb not null default '[]'::jsonb;

alter table public.instagram_runtime_settings
add column if not exists max_text_messages integer not null default 2
  check (max_text_messages between 1 and 2);
