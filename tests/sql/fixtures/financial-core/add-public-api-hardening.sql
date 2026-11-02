-- Bagelito public API hardening. Run after the base reservation schema.
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

create table if not exists public.api_rate_limits (
  scope text not null,
  identifier_hash text not null,
  window_started_at timestamptz not null default now(),
  hits integer not null default 0 check (hits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (scope, identifier_hash)
);

drop trigger if exists api_rate_limits_set_updated_at on public.api_rate_limits;
create trigger api_rate_limits_set_updated_at
before update on public.api_rate_limits
for each row
execute function public.set_updated_at();

create index if not exists api_rate_limits_window_started_idx
  on public.api_rate_limits(window_started_at asc);

create or replace function public.consume_api_rate_limit(
  p_scope text,
  p_identifier text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  hits integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.api_rate_limits%rowtype;
  now_ts timestamptz := now();
  window_interval interval := make_interval(secs => greatest(p_window_seconds, 1));
  reset_at timestamptz;
begin
  if coalesce(trim(p_scope), '') = '' or coalesce(trim(p_identifier), '') = '' then
    raise exception 'Rate limit scope and identifier are required.';
  end if;

  if p_limit < 1 then
    raise exception 'Rate limit must be at least 1.';
  end if;

  select *
  into current_row
  from public.api_rate_limits
  where scope = p_scope
    and identifier_hash = p_identifier
  for update;

  if not found then
    insert into public.api_rate_limits (scope, identifier_hash, window_started_at, hits)
    values (p_scope, p_identifier, now_ts, 1);

    return query
    select true, 1, 0;
    return;
  end if;

  reset_at := current_row.window_started_at + window_interval;

  if reset_at <= now_ts then
    update public.api_rate_limits
    set hits = 1,
        updated_at = now_ts,
        window_started_at = now_ts
    where scope = p_scope
      and identifier_hash = p_identifier;

    return query
    select true, 1, 0;
    return;
  end if;

  if current_row.hits >= p_limit then
    return query
    select
      false,
      current_row.hits,
      greatest(1, ceil(extract(epoch from (reset_at - now_ts)))::integer);
    return;
  end if;

  update public.api_rate_limits
  set hits = current_row.hits + 1,
      updated_at = now_ts
  where scope = p_scope
    and identifier_hash = p_identifier;

  return query
  select true, current_row.hits + 1, 0;
end;
$$;

revoke execute on function public.consume_api_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer) to service_role;

create or replace function public.create_reservation_order(
  p_order_code text,
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
  p_payment_method text,
  p_payment_transaction_number text,
  p_payment_holder_name text,
  p_payment_phone_number text,
  p_payment_screenshot_path text,
  p_terms_accepted boolean,
  p_exact_amount_confirmed boolean,
  p_items jsonb
)
returns table (
  order_id uuid,
  order_code text
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
  reserved_bagel_count integer := 0;
  reserved_pack_count integer := 0;
  now_ts timestamptz := now();
begin
  if coalesce(trim(p_order_code), '') = '' then
    raise exception 'Order code is required.';
  end if;

  if p_batch_id is null then
    raise exception 'Reservation batch is required.';
  end if;

  if coalesce(p_pack_units, 0) < 1 then
    raise exception 'Reservation pack units must be at least 1.';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
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
    coalesce(sum(pack_units), 0)::integer
  into reserved_pack_count, reserved_bagel_count
  from public.orders
  where batch_id = p_batch_id
    and status <> 'cancelled';

  if batch_row.capacity_packs is not null and reserved_pack_count + 1 > batch_row.capacity_packs then
    raise exception 'This Bagelito batch is full. Join the waitlist.';
  end if;

  if batch_row.capacity_bagels is not null and reserved_bagel_count + p_pack_units > batch_row.capacity_bagels then
    raise exception 'This Bagelito batch is full for the pack size selected. Join the waitlist.';
  end if;

  insert into public.orders (
    order_code,
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
    terms_accepted,
    exact_amount_confirmed,
    status
  )
  values (
    p_order_code,
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
    p_payment_method,
    p_payment_transaction_number,
    p_payment_holder_name,
    p_payment_phone_number,
    p_payment_screenshot_path,
    coalesce(p_terms_accepted, false),
    coalesce(p_exact_amount_confirmed, false),
    'payment_pending_review'
  )
  returning id into created_order_id;

  for item_payload in
    select value from jsonb_array_elements(p_items)
  loop
    item_flavor_slug := trim(coalesce(item_payload ->> 'flavor_slug', ''));
    item_flavor_name := trim(coalesce(item_payload ->> 'flavor_name', ''));
    item_quantity := nullif(item_payload ->> 'quantity', '')::integer;

    if item_flavor_slug = '' or item_flavor_name = '' or item_quantity is null or item_quantity < 1 then
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
  end loop;

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
    'customer'
  );

  return query
  select created_order_id, p_order_code;
end;
$$;

revoke execute on function public.create_reservation_order(
  text, uuid, text, text, integer, text, text, text, text, text, text, text, text, boolean, numeric, text, text, text, text, text, boolean, boolean, jsonb
) from public, anon, authenticated;

grant execute on function public.create_reservation_order(
  text, uuid, text, text, integer, text, text, text, text, text, text, text, text, boolean, numeric, text, text, text, text, text, boolean, boolean, jsonb
) to service_role;

alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.api_rate_limits to service_role;
