alter table public.instagram_ai_runs
add column if not exists human_final_media jsonb not null default '[]'::jsonb;
