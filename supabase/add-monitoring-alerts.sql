-- Bagelito monitoring alerts. Run after the base reservation schema.

create table if not exists public.monitoring_alert_events (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  level text not null check (level in ('warn', 'error')),
  event_name text not null,
  summary text not null,
  context jsonb not null default '{}'::jsonb,
  occurrences integer not null default 1 check (occurrences >= 1),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists monitoring_alert_events_set_updated_at on public.monitoring_alert_events;
create trigger monitoring_alert_events_set_updated_at
before update on public.monitoring_alert_events
for each row
execute function public.set_updated_at();

create index if not exists monitoring_alert_events_level_seen_idx
  on public.monitoring_alert_events(level, last_seen_at desc);

create index if not exists monitoring_alert_events_event_name_idx
  on public.monitoring_alert_events(event_name, last_seen_at desc);

create or replace function public.record_monitoring_alert(
  p_fingerprint text,
  p_level text,
  p_event_name text,
  p_summary text,
  p_context jsonb,
  p_cooldown_minutes integer default 15
)
returns table (
  event_id uuid,
  occurrences integer,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  last_sent_at timestamptz,
  should_send boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  alert_row public.monitoring_alert_events%rowtype;
  now_ts timestamptz := now();
  cooldown_interval interval := make_interval(mins => greatest(p_cooldown_minutes, 1));
  next_should_send boolean := false;
begin
  if coalesce(trim(p_fingerprint), '') = '' then
    raise exception 'Monitoring alert fingerprint is required.';
  end if;

  if p_level not in ('warn', 'error') then
    raise exception 'Monitoring alert level must be warn or error.';
  end if;

  if coalesce(trim(p_event_name), '') = '' then
    raise exception 'Monitoring event name is required.';
  end if;

  if coalesce(trim(p_summary), '') = '' then
    raise exception 'Monitoring summary is required.';
  end if;

  insert into public.monitoring_alert_events (
    fingerprint,
    level,
    event_name,
    summary,
    context,
    occurrences,
    first_seen_at,
    last_seen_at,
    updated_at
  )
  values (
    p_fingerprint,
    p_level,
    p_event_name,
    p_summary,
    coalesce(p_context, '{}'::jsonb),
    1,
    now_ts,
    now_ts,
    now_ts
  )
  on conflict (fingerprint) do update
  set
    level = excluded.level,
    event_name = excluded.event_name,
    summary = excluded.summary,
    context = excluded.context,
    occurrences = public.monitoring_alert_events.occurrences + 1,
    last_seen_at = now_ts,
    updated_at = now_ts
  returning *
  into alert_row;

  if alert_row.last_sent_at is null or alert_row.last_sent_at + cooldown_interval <= now_ts then
    next_should_send := true;
  end if;

  return query
  select
    alert_row.id,
    alert_row.occurrences,
    alert_row.first_seen_at,
    alert_row.last_seen_at,
    alert_row.last_sent_at,
    next_should_send;
end;
$$;

revoke execute on function public.record_monitoring_alert(text, text, text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.record_monitoring_alert(text, text, text, text, jsonb, integer) to service_role;

create or replace function public.mark_monitoring_alert_sent(
  p_event_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_id is null then
    raise exception 'Monitoring event id is required.';
  end if;

  update public.monitoring_alert_events
  set
    last_sent_at = now(),
    updated_at = now()
  where id = p_event_id;
end;
$$;

revoke execute on function public.mark_monitoring_alert_sent(uuid) from public, anon, authenticated;
grant execute on function public.mark_monitoring_alert_sent(uuid) to service_role;

alter table public.monitoring_alert_events enable row level security;
revoke all on table public.monitoring_alert_events from public, anon, authenticated;
grant select, insert, update, delete on table public.monitoring_alert_events to service_role;
