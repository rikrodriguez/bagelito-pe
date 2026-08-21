-- Bagelito Libro de Reclamaciones. Run after the base reservation schema.
create extension if not exists pgcrypto;

create sequence if not exists public.bagelito_complaint_code_seq start 1 increment 1;

create or replace function public.next_complaint_code()
returns text
language sql
security definer
set search_path = public
as $$
  select 'LR-' ||
    to_char(timezone('America/Lima', now()), 'YYYY') || '-' ||
    lpad(nextval('public.bagelito_complaint_code_seq')::text, 6, '0');
$$;

revoke execute on function public.next_complaint_code() from public, anon, authenticated;
grant execute on function public.next_complaint_code() to service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.consumer_complaints (
  id uuid primary key default gen_random_uuid(),
  complaint_code text unique not null,
  consumer_name text not null,
  document_type text not null check (document_type in ('DNI','CE','PASSPORT','RUC')),
  document_number text not null,
  consumer_address text not null,
  phone text not null,
  email text not null,
  is_minor boolean not null default false,
  representative_name text null,
  representative_document text null,
  item_type text not null check (item_type in ('product','service')),
  amount numeric(12,2) not null check (amount >= 0),
  item_description text not null,
  request_type text not null check (request_type in ('reclamo','queja')),
  detail text not null,
  requested_action text not null,
  privacy_accepted boolean not null default false,
  status text not null default 'received' check (status in ('received','in_review','responded','closed')),
  provider_actions text null,
  responded_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists consumer_complaints_set_updated_at on public.consumer_complaints;
create trigger consumer_complaints_set_updated_at
before update on public.consumer_complaints
for each row
execute function public.set_updated_at();

create index if not exists consumer_complaints_status_created_at_idx
  on public.consumer_complaints(status, created_at desc);
create index if not exists consumer_complaints_email_created_at_idx
  on public.consumer_complaints(email, created_at desc);
create index if not exists consumer_complaints_document_number_idx
  on public.consumer_complaints(document_number);

alter table public.consumer_complaints enable row level security;
revoke all on table public.consumer_complaints from anon, authenticated;
grant select, insert, update, delete on table public.consumer_complaints to service_role;

comment on table public.consumer_complaints is
  'Private Bagelito Libro de Reclamaciones records. Access only through server-side service role routes.';
