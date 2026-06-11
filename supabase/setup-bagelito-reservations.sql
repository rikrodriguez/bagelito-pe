-- Bagelito.pe reservation MVP setup. Run in the Bagelito Supabase SQL Editor.
create extension if not exists pgcrypto;

create sequence if not exists public.bagelito_order_code_seq start 1 increment 1;

create or replace function public.next_order_code()
returns text
language sql
as $$
  select 'BAG-' || lpad(nextval('public.bagelito_order_code_seq')::text, 6, '0');
$$;

revoke execute on function public.next_order_code() from public, anon, authenticated;
grant execute on function public.next_order_code() to service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'waitlist_open' check (status in ('waitlist_open','orders_open','closed','in_production','delivered')),
  orders_open_at timestamptz null,
  orders_close_at timestamptz null,
  delivery_date timestamptz null,
  capacity_packs integer null,
  capacity_bagels integer null,
  created_at timestamptz default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text unique not null,
  batch_id uuid references public.batches(id),
  pack_slug text not null,
  pack_name text not null,
  pack_units integer not null,
  pack_type text not null check (pack_type in ('mixed','single')),
  customer_name text not null,
  whatsapp text not null,
  email text not null,
  delivery_address text not null,
  district text not null,
  address_reference text null,
  delivery_notes text null,
  total_amount numeric not null,
  payment_method text not null check (payment_method in ('Yape','Plin')),
  payment_transaction_number text not null,
  payment_holder_name text not null,
  payment_phone_number text not null,
  payment_screenshot_path text not null,
  terms_accepted boolean not null default false,
  exact_amount_confirmed boolean not null default false,
  status text not null default 'payment_pending_review' check (status in ('payment_pending_review','payment_confirmed','needs_correction','in_production','ready_for_delivery','delivered','cancelled')),
  admin_notes text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  flavor_slug text not null,
  flavor_name text not null,
  quantity integer not null check (quantity > 0),
  created_at timestamptz default now()
);

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  old_status text null,
  new_status text not null,
  changed_by text null,
  created_at timestamptz default now()
);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row
execute function public.set_updated_at();

create index if not exists batches_status_created_at_idx on public.batches(status, created_at desc);
create index if not exists orders_status_created_at_idx on public.orders(status, created_at desc);
create index if not exists orders_batch_id_idx on public.orders(batch_id);
create index if not exists orders_order_code_idx on public.orders(order_code);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_status_history_order_id_idx on public.order_status_history(order_id, created_at desc);

alter table public.batches enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs','payment-proofs',false,5242880,array['image/png','image/jpeg','image/jpg','image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
