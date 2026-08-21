-- Bagelito payment-provider foundation.
-- Run after setup-bagelito-reservations.sql and add-public-api-hardening.sql.
-- Existing manual Yape/Plin orders remain readable and operable.

alter table public.orders
  add column if not exists checkout_session_id uuid,
  add column if not exists payment_provider text not null default 'manual',
  add column if not exists payment_status text not null default 'pending',
  add column if not exists payment_order_id text,
  add column if not exists payment_charge_id text,
  add column if not exists payment_currency text not null default 'PEN',
  add column if not exists payment_amount_minor integer,
  add column if not exists payment_paid_at timestamptz,
  add column if not exists payment_expires_at timestamptz,
  add column if not exists payment_failure_code text,
  add column if not exists payment_failure_message text,
  add column if not exists payment_metadata jsonb;

alter table public.orders alter column payment_method drop not null;
alter table public.orders alter column payment_transaction_number drop not null;
alter table public.orders alter column payment_holder_name drop not null;
alter table public.orders alter column payment_phone_number drop not null;
alter table public.orders alter column payment_screenshot_path drop not null;

alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method is null or payment_method in ('Yape', 'Plin', 'Culqi'));

alter table public.orders drop constraint if exists orders_payment_provider_check;
alter table public.orders
  add constraint orders_payment_provider_check
  check (payment_provider in ('manual', 'culqi'));

alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders
  add constraint orders_payment_status_check
  check (payment_status in ('pending', 'paid', 'failed', 'expired', 'refunded'));

update public.orders
set payment_provider = case when payment_method = 'Culqi' then 'culqi' else 'manual' end,
    payment_status = case
      when status in ('payment_confirmed', 'in_production', 'ready_for_delivery', 'delivered') then 'paid'
      when status = 'cancelled' then 'failed'
      else 'pending'
    end,
    payment_currency = coalesce(nullif(payment_currency, ''), 'PEN'),
    payment_amount_minor = round(total_amount * 100)::integer
where payment_provider is null
   or payment_status is null
   or payment_currency is null
   or payment_amount_minor is null;

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null check (provider in ('culqi')),
  provider_order_id text not null,
  provider_charge_id text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired', 'refunded')),
  payment_method text,
  amount_minor integer not null check (amount_minor > 0),
  currency_code text not null default 'PEN' check (currency_code = 'PEN'),
  expires_at timestamptz,
  paid_at timestamptz,
  failure_code text,
  failure_message text,
  provider_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_order_id)
);

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('culqi')),
  provider_event_id text not null,
  event_type text not null,
  provider_order_id text,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create or replace function public.create_culqi_reservation_order(
  p_order_code text,
  p_checkout_session_id uuid,
  p_batch_id uuid,
  p_pack_slug text,
  p_pack_name text,
  p_pack_units integer,
  p_pack_type text,
  p_customer_name text,
  p_whatsapp text,
  p_email text,
  p_delivery_address text,
  p_district text,
  p_address_reference text,
  p_delivery_notes text,
  p_marketing_opt_in boolean,
  p_total_amount numeric,
  p_payment_expires_at timestamptz,
  p_terms_accepted boolean,
  p_items jsonb
)
returns table (
  order_id uuid,
  order_code text,
  payment_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  batch_row public.batches%rowtype;
  created_order_id uuid;
  item_payload jsonb;
  item_flavor_name text;
  item_flavor_slug text;
  item_quantity integer;
  inserted_bagel_count integer := 0;
  reserved_bagel_count integer := 0;
  reserved_pack_count integer := 0;
  now_ts timestamptz := now();
begin
  if p_checkout_session_id is null then
    raise exception 'Checkout session is required.';
  end if;

  -- Serialize retries for the same browser checkout session so two requests
  -- cannot create two orders before the unique index becomes visible.
  perform pg_advisory_xact_lock(hashtext(p_checkout_session_id::text)::bigint);

  select o.id, o.order_code, o.payment_expires_at
  into order_id, order_code, payment_expires_at
  from public.orders as o
  where o.checkout_session_id = p_checkout_session_id;

  if found then
    return next;
    return;
  end if;

  if coalesce(trim(p_order_code), '') = '' or p_batch_id is null then
    raise exception 'Order code and batch are required.';
  end if;

  if coalesce(p_pack_units, 0) < 1 or coalesce(p_total_amount, 0) <= 0 then
    raise exception 'Pack units and total must be positive.';
  end if;

  if p_payment_expires_at is null or p_payment_expires_at <= now_ts then
    raise exception 'Payment expiry must be in the future.';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Reservation items are required.';
  end if;

  select *
  into batch_row
  from public.batches
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'Reservation batch not found.';
  end if;

  if batch_row.status <> 'orders_open' then
    raise exception 'This Bagelito batch is currently closed. Join the waitlist for the next opening.';
  end if;

  if batch_row.orders_close_at is not null and batch_row.orders_close_at <= now_ts then
    raise exception 'This Bagelito batch has already closed. Join the waitlist for the next batch.';
  end if;

  select
    count(*)::integer,
    coalesce(sum(o.pack_units), 0)::integer
  into reserved_pack_count, reserved_bagel_count
  from public.orders as o
  where o.batch_id = p_batch_id
    and o.status <> 'cancelled'
    and not (
      o.payment_provider = 'culqi'
      and o.payment_status in ('pending', 'failed')
      and o.payment_expires_at is not null
      and o.payment_expires_at <= now_ts
    );

  if batch_row.capacity_packs is not null
     and reserved_pack_count + 1 > batch_row.capacity_packs then
    raise exception 'This Bagelito batch is full. Join the waitlist.';
  end if;

  if batch_row.capacity_bagels is not null
     and reserved_bagel_count + p_pack_units > batch_row.capacity_bagels then
    raise exception 'This Bagelito batch is full for the pack size selected. Join the waitlist.';
  end if;

  insert into public.orders (
    order_code,
    checkout_session_id,
    batch_id,
    pack_slug,
    pack_name,
    pack_units,
    pack_type,
    customer_name,
    whatsapp,
    email,
    delivery_address,
    district,
    address_reference,
    delivery_notes,
    marketing_opt_in,
    total_amount,
    payment_method,
    payment_transaction_number,
    payment_holder_name,
    payment_phone_number,
    payment_screenshot_path,
    payment_provider,
    payment_status,
    payment_currency,
    payment_amount_minor,
    payment_expires_at,
    terms_accepted,
    exact_amount_confirmed,
    status
  )
  values (
    p_order_code,
    p_checkout_session_id,
    p_batch_id,
    p_pack_slug,
    p_pack_name,
    p_pack_units,
    p_pack_type,
    p_customer_name,
    p_whatsapp,
    p_email,
    p_delivery_address,
    p_district,
    nullif(trim(coalesce(p_address_reference, '')), ''),
    nullif(trim(coalesce(p_delivery_notes, '')), ''),
    coalesce(p_marketing_opt_in, false),
    p_total_amount,
    'Culqi',
    null,
    null,
    null,
    null,
    'culqi',
    'pending',
    'PEN',
    round(p_total_amount * 100)::integer,
    p_payment_expires_at,
    coalesce(p_terms_accepted, false),
    true,
    'payment_pending_review'
  )
  returning id into created_order_id;

  for item_payload in
    select value from jsonb_array_elements(p_items)
  loop
    item_flavor_slug := trim(coalesce(item_payload ->> 'flavor_slug', ''));
    item_flavor_name := trim(coalesce(item_payload ->> 'flavor_name', ''));
    item_quantity := nullif(item_payload ->> 'quantity', '')::integer;

    if item_flavor_slug = '' or item_flavor_name = ''
       or item_quantity is null or item_quantity < 1 then
      raise exception 'Invalid reservation item payload.';
    end if;

    insert into public.order_items (
      order_id,
      flavor_slug,
      flavor_name,
      quantity
    )
    values (
      created_order_id,
      item_flavor_slug,
      item_flavor_name,
      item_quantity
    );

    inserted_bagel_count := inserted_bagel_count + item_quantity;
  end loop;

  if inserted_bagel_count <> p_pack_units then
    raise exception 'Reservation item quantities do not match the selected pack.';
  end if;

  insert into public.order_status_history (
    order_id,
    old_status,
    new_status,
    changed_by
  )
  values (
    created_order_id,
    null,
    'payment_pending_review',
    'culqi checkout'
  );

  return query
  select created_order_id, p_order_code, p_payment_expires_at;
end;
$$;

revoke execute on function public.create_culqi_reservation_order(
  text, uuid, uuid, text, text, integer, text, text, text, text, text, text, text,
  text, boolean, numeric, timestamptz, boolean, jsonb
) from public, anon, authenticated;

grant execute on function public.create_culqi_reservation_order(
  text, uuid, uuid, text, text, integer, text, text, text, text, text, text, text,
  text, boolean, numeric, timestamptz, boolean, jsonb
) to service_role;

drop trigger if exists payment_attempts_set_updated_at on public.payment_attempts;
create trigger payment_attempts_set_updated_at
before update on public.payment_attempts
for each row
execute function public.set_updated_at();

create index if not exists orders_payment_provider_order_idx
  on public.orders(payment_provider, payment_order_id);
create unique index if not exists orders_checkout_session_id_idx
  on public.orders(checkout_session_id)
  where checkout_session_id is not null;
create index if not exists orders_payment_status_idx
  on public.orders(payment_status, created_at desc);
create index if not exists payment_attempts_order_id_idx
  on public.payment_attempts(order_id, created_at desc);
create index if not exists payment_webhook_events_order_idx
  on public.payment_webhook_events(provider_order_id, created_at desc);

alter table public.payment_attempts enable row level security;
alter table public.payment_webhook_events enable row level security;
revoke all on table public.payment_attempts from public, anon, authenticated;
revoke all on table public.payment_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on table public.payment_attempts to service_role;
grant select, insert, update, delete on table public.payment_webhook_events to service_role;
