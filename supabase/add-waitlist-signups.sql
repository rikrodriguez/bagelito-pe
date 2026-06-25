-- Bagelito waitlist signups. Run once in the Supabase SQL Editor.
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.batches(id) on delete set null,
  list_date date not null default ((now() at time zone 'America/Lima')::date),
  list_label text not null default ('Waitlist ' || ((now() at time zone 'America/Lima')::date)::text),
  customer_name text not null,
  whatsapp text not null,
  email text not null,
  preferred_pack_slug text null,
  preferred_pack_name text null,
  contact_preference text not null default 'whatsapp' check (contact_preference in ('whatsapp','email','both')),
  locale text not null default 'en' check (locale in ('en','es')),
  source text not null default 'waitlist_page',
  notes text null,
  consent_accepted boolean not null default true,
  status text not null default 'new' check (status in ('new','notified','converted','archived')),
  contacted_at timestamptz null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

drop trigger if exists waitlist_signups_set_updated_at on public.waitlist_signups;
create trigger waitlist_signups_set_updated_at
before update on public.waitlist_signups
for each row
execute function public.set_updated_at();

create index if not exists waitlist_signups_list_date_idx on public.waitlist_signups(list_date desc, created_at desc);
create index if not exists waitlist_signups_email_idx on public.waitlist_signups(email);
create index if not exists waitlist_signups_whatsapp_idx on public.waitlist_signups(whatsapp);
create index if not exists waitlist_signups_status_idx on public.waitlist_signups(status, created_at desc);

alter table public.waitlist_signups enable row level security;
revoke all on table public.waitlist_signups from anon, authenticated;
grant select, insert, update, delete on table public.waitlist_signups to service_role;
