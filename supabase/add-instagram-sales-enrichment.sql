alter table public.instagram_ai_runs
add column if not exists sales_enrichment_status text not null default 'pending'
  check (sales_enrichment_status in ('pending','processing','completed','error')),
add column if not exists sales_enriched_at timestamptz,
add column if not exists buyer_signal text,
add column if not exists sales_stage text,
add column if not exists next_best_action text,
add column if not exists missing_fields jsonb not null default '[]'::jsonb,
add column if not exists objection_type text,
add column if not exists handoff_reason text,
add column if not exists order_patch jsonb not null default '{}'::jsonb,
add column if not exists voice_score numeric,
add column if not exists voice_pass boolean;

create index if not exists instagram_ai_runs_sales_enrichment_idx
  on public.instagram_ai_runs(sales_enrichment_status, created_at)
  where sales_enrichment_status in ('pending','error');

create extension if not exists pg_net with schema extensions;

create or replace function public.ensure_instagram_sales_internal_secret()
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'instagram_sales_internal_token'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'instagram_sales_internal_token',
      'Internal token for database-to-edge sales enrichment calls'
    );
  end if;
end;
$$;

select public.ensure_instagram_sales_internal_secret();

drop function public.ensure_instagram_sales_internal_secret();

create or replace function public.verify_instagram_sales_internal_token(p_token text)
returns boolean
language sql
security definer
stable
set search_path = public, vault
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'instagram_sales_internal_token'
      and decrypted_secret = p_token
  );
$$;

revoke all on function public.verify_instagram_sales_internal_token(text) from public, anon, authenticated;
grant execute on function public.verify_instagram_sales_internal_token(text) to service_role;

create or replace function public.notify_instagram_sales_enrichment()
returns trigger
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_token text;
  v_request_id bigint;
begin
  if new.status <> 'proposed' or new.triggering_message_id is null then
    return new;
  end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'instagram_sales_internal_token'
  limit 1;

  if v_token is null then
    return new;
  end if;

  select net.http_post(
    url := 'https://enqpahoanbthnkrxfnxf.supabase.co/functions/v1/instagram-sales-enrich',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-internal-token', v_token
    ),
    body := jsonb_build_object('ai_run_id', new.id),
    timeout_milliseconds := 8000
  ) into v_request_id;

  return new;
exception
  when others then
    raise warning 'instagram_sales_enrichment_notify_failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists instagram_ai_runs_notify_sales_enrichment on public.instagram_ai_runs;
create trigger instagram_ai_runs_notify_sales_enrichment
after insert on public.instagram_ai_runs
for each row execute function public.notify_instagram_sales_enrichment();