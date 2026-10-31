-- Forward-only manual reservation operations. This does not replace the existing
-- reservation transaction, enable payments, or change Culqi contracts.
begin;

create table if not exists public.manual_reservation_operations (
  operation_id uuid primary key,
  owner_hash text not null check (owner_hash ~ '^[0-9a-f]{64}$'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  proof_sha256 text not null check (proof_sha256 ~ '^[0-9a-f]{64}$'),
  proof_type text not null check (proof_type in ('image/jpeg', 'image/png', 'image/webp')),
  proof_size integer not null check (proof_size between 1 and 5242880),
  order_payload jsonb not null check (jsonb_typeof(order_payload) = 'object'),
  batch_id uuid not null references public.batches(id),
  order_code text not null unique,
  proof_path text not null unique,
  order_id uuid unique references public.orders(id),
  state text generated always as
    (case when order_id is null then 'awaiting_proof'::text else 'completed'::text end) stored,
  created_at timestamptz not null default clock_timestamp(),
  constraint manual_reservation_operation_v4 check
    (operation_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  constraint manual_reservation_proof_path_bound check
    (proof_path = 'manual/' || operation_id::text || '/' || proof_sha256 ||
      case proof_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' else '.webp' end)
);

alter table public.manual_reservation_operations enable row level security;
revoke all on table public.manual_reservation_operations from public, anon, authenticated, service_role;

create or replace function public.prepare_manual_reservation_v1(
  p_operation_id uuid,
  p_owner_hash text,
  p_request_hash text,
  p_proof_sha256 text,
  p_proof_type text,
  p_proof_size integer,
  p_order_payload jsonb
)
returns table (
  operation_id uuid,
  state text,
  order_code text,
  proof_path text,
  amount numeric,
  pack_slug text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  operation public.manual_reservation_operations%rowtype;
  chosen_batch_id uuid;
  chosen_batch public.batches%rowtype;
  reserved_packs bigint;
  reserved_bagels numeric;
  now_ts timestamptz;
  chosen_order_code text;
  chosen_proof_path text;
  field_name text;
  item jsonb;
  units numeric;
  item_units numeric;
  item_total numeric := 0;
  quote numeric;
  normalized_payload jsonb;
  normalized_items jsonb := '[]'::jsonb;
  allocation_attempt integer;
begin
  if p_operation_id is null
    or p_operation_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'Invalid manual reservation operation metadata.';
  end if;

  -- Share this namespace with finalize so a retry waits for an in-flight prepare.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bagelito-manual-v1:' || p_operation_id::text, 0));

  select o.* into operation
  from public.manual_reservation_operations as o
  where o.operation_id = p_operation_id
  for update;

  if found then
    if operation.owner_hash is distinct from p_owner_hash
      or operation.request_hash is distinct from p_request_hash
      or operation.proof_sha256 is distinct from p_proof_sha256
      or operation.proof_type is distinct from p_proof_type
      or operation.proof_size is distinct from p_proof_size then
      raise exception using errcode = 'P4090', message = 'Manual reservation operation conflict.';
    end if;

    -- Recover a committed order before considering current quote or intake.
    -- An unfinished operation must not become an indefinite price guarantee.
    if operation.order_id is null
      and (operation.order_payload - array['batch_id', 'order_code', 'payment_screenshot_path'])
        is distinct from p_order_payload then
      raise exception using errcode = 'P4091', message = 'Manual reservation quote changed.';
    end if;
    return query select operation.operation_id, operation.state, operation.order_code,
      operation.proof_path, (operation.order_payload ->> 'total_amount')::numeric,
      operation.order_payload ->> 'pack_slug', true;
    return;
  end if;

  if p_owner_hash is null or p_owner_hash !~ '^[0-9a-f]{64}$'
    or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
    or p_proof_sha256 is null or p_proof_sha256 !~ '^[0-9a-f]{64}$'
    or p_proof_type is null or p_proof_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_proof_size is null or p_proof_size not between 1 and 5242880 then
    raise exception using errcode = '22023', message = 'Invalid manual reservation operation metadata.';
  end if;
  if p_order_payload is null or jsonb_typeof(p_order_payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Invalid manual reservation payload.';
  end if;
  foreach field_name in array array[
    'pack_slug', 'pack_name', 'pack_type', 'customer_name', 'whatsapp', 'email',
    'delivery_address', 'district', 'payment_method', 'payment_transaction_number',
    'payment_holder_name', 'payment_phone_number', 'terms_version'
  ] loop
    if jsonb_typeof(p_order_payload -> field_name) is distinct from 'string'
      or btrim(p_order_payload ->> field_name) = '' then
      raise exception using errcode = '22023', message = 'Invalid manual reservation required fields.';
    end if;
  end loop;
  foreach field_name in array array['address_reference', 'delivery_notes'] loop
    if p_order_payload ? field_name
      and jsonb_typeof(p_order_payload -> field_name) not in ('string', 'null') then
      raise exception using errcode = '22023', message = 'Invalid manual reservation optional fields.';
    end if;
  end loop;
  if p_order_payload ->> 'payment_method' not in ('Yape', 'Plin')
    or p_order_payload ->> 'pack_type' not in ('single', 'mixed')
    or p_order_payload -> 'terms_accepted' is distinct from 'true'::jsonb
    or p_order_payload -> 'exact_amount_confirmed' is distinct from 'true'::jsonb
    or (p_order_payload ? 'marketing_opt_in'
      and jsonb_typeof(p_order_payload -> 'marketing_opt_in') is distinct from 'boolean') then
    raise exception using errcode = '22023', message = 'Affirmative consent and valid manual payment fields are required.';
  end if;
  if jsonb_typeof(p_order_payload -> 'pack_units') is distinct from 'number'
    or jsonb_typeof(p_order_payload -> 'total_amount') is distinct from 'number' then
    raise exception using errcode = '22023', message = 'Invalid manual reservation financial fields.';
  end if;
  units := (p_order_payload ->> 'pack_units')::numeric;
  quote := (p_order_payload ->> 'total_amount')::numeric;
  if units < 1 or units > 2147483647 or trunc(units) <> units
    or quote <= 0 or round(quote, 2) <> quote then
    raise exception using errcode = '22023', message = 'Invalid manual reservation financial fields.';
  end if;
  if jsonb_typeof(p_order_payload -> 'items') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Invalid manual reservation items.';
  end if;
  if jsonb_array_length(p_order_payload -> 'items') = 0
    or (p_order_payload ->> 'pack_type' = 'single'
      and jsonb_array_length(p_order_payload -> 'items') <> 1) then
    raise exception using errcode = '22023', message = 'Invalid manual reservation items.';
  end if;
  normalized_payload := jsonb_set(p_order_payload, '{pack_units}', to_jsonb(units::integer));
  for item in select value from jsonb_array_elements(p_order_payload -> 'items') loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item -> 'flavor_slug') is distinct from 'string'
      or coalesce(btrim(item ->> 'flavor_slug'), '') = ''
      or jsonb_typeof(item -> 'flavor_name') is distinct from 'string'
      or coalesce(btrim(item ->> 'flavor_name'), '') = ''
      or jsonb_typeof(item -> 'quantity') is distinct from 'number' then
      raise exception using errcode = '22023', message = 'Invalid manual reservation item fields.';
    end if;
    item_units := (item ->> 'quantity')::numeric;
    if item_units < 1 or item_units > 2147483647 or trunc(item_units) <> item_units then
      raise exception using errcode = '22023', message = 'Invalid manual reservation item quantity.';
    end if;
    item_total := item_total + item_units;
    normalized_items := normalized_items || jsonb_build_array(
      item || jsonb_build_object('quantity', item_units::integer));
  end loop;
  if item_total <> units then
    raise exception using errcode = '22023', message = 'Manual reservation items must match pack units.';
  end if;

  normalized_payload := jsonb_set(normalized_payload, '{items}', normalized_items);

  select b.* into chosen_batch from public.batches as b
  order by b.created_at desc, b.id desc limit 1;
  if not found then
    raise exception using errcode = '55000', message = 'No reservation batch is configured.';
  end if;
  chosen_batch_id := chosen_batch.id;
  now_ts := clock_timestamp();
  -- This precheck avoids preparing/uploading a new operation already known to
  -- be unavailable. It reserves no stock; finalize rechecks under the original
  -- batch lock in the existing transaction.
  if chosen_batch.status <> 'orders_open' then
    raise exception 'This Bagelito batch is currently closed. Join the waitlist for the next opening.';
  end if;
  if chosen_batch.orders_open_at is not null and now_ts < chosen_batch.orders_open_at then
    raise exception 'Reservation batch has not opened yet.';
  end if;
  if chosen_batch.orders_close_at is not null and now_ts >= chosen_batch.orders_close_at then
    raise exception 'This Bagelito batch has already closed. Join the waitlist for the next batch.';
  end if;
  select count(*), coalesce(sum(o.pack_units), 0)
  into reserved_packs, reserved_bagels from public.orders as o
  where o.batch_id = chosen_batch_id and o.status <> 'cancelled';
  if chosen_batch.capacity_packs is not null and reserved_packs + 1 > chosen_batch.capacity_packs then
    raise exception 'This Bagelito batch is full. Join the waitlist.';
  end if;
  if chosen_batch.capacity_bagels is not null and reserved_bagels + units > chosen_batch.capacity_bagels then
    raise exception 'This Bagelito batch is full for the pack size selected. Join the waitlist.';
  end if;
  -- Historical imports can leave the sequence behind existing codes. Bind a
  -- free code now rather than a permanently unfinalizable operation. Each
  -- bounded attempt may consume a sequence value; no counter is reset.
  for allocation_attempt in 1..32 loop
    chosen_order_code := public.next_order_code();
    if coalesce(btrim(chosen_order_code), '') = '' then
      raise exception using errcode = '55000', message = 'Could not allocate a reservation order code.';
    end if;
    if not exists(select 1 from public.orders as o where o.order_code = chosen_order_code)
      and not exists(select 1 from public.manual_reservation_operations as o
        where o.order_code = chosen_order_code) then
      exit;
    end if;
    chosen_order_code := null;
  end loop;
  if chosen_order_code is null then
    raise exception using errcode = '55000', message = 'Could not allocate a reservation order code.';
  end if;
  chosen_proof_path := 'manual/' || p_operation_id::text || '/' || p_proof_sha256 ||
    case p_proof_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' else '.webp' end;

  insert into public.manual_reservation_operations as o (
    operation_id, owner_hash, request_hash, proof_sha256, proof_type, proof_size,
    order_payload, batch_id, order_code, proof_path
  ) values (
    p_operation_id, p_owner_hash, p_request_hash, p_proof_sha256, p_proof_type, p_proof_size,
    normalized_payload || jsonb_build_object('batch_id', chosen_batch_id,
      'order_code', chosen_order_code, 'payment_screenshot_path', chosen_proof_path),
    chosen_batch_id, chosen_order_code, chosen_proof_path
  ) returning o.* into operation;

  return query select operation.operation_id, operation.state, operation.order_code,
    operation.proof_path, quote, operation.order_payload ->> 'pack_slug', false;
end;
$$;

create or replace function public.finalize_manual_reservation_v1(
  p_operation_id uuid,
  p_owner_hash text,
  p_request_hash text
)
returns table (
  operation_id uuid,
  state text,
  order_code text,
  proof_path text,
  amount numeric,
  pack_slug text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  operation public.manual_reservation_operations%rowtype;
  payload jsonb;
  created_order_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bagelito-manual-v1:' || p_operation_id::text, 0));
  select o.* into operation
  from public.manual_reservation_operations as o
  where o.operation_id = p_operation_id
  for update;

  if not found or operation.owner_hash is distinct from p_owner_hash
    or operation.request_hash is distinct from p_request_hash then
    raise exception using errcode = 'P4090', message = 'Manual reservation operation conflict.';
  end if;
  if operation.order_id is not null then
    return query select operation.operation_id, operation.state, operation.order_code,
      operation.proof_path, (operation.order_payload ->> 'total_amount')::numeric,
      operation.order_payload ->> 'pack_slug', true;
    return;
  end if;

  payload := operation.order_payload;
  select r.order_id into created_order_id
  from public.create_reservation_order(
    p_order_code => operation.order_code,
    p_batch_id => operation.batch_id,
    p_pack_slug => payload ->> 'pack_slug',
    p_pack_name => payload ->> 'pack_name',
    p_pack_units => (payload ->> 'pack_units')::integer,
    p_pack_type => payload ->> 'pack_type',
    p_customer_name => payload ->> 'customer_name',
    p_whatsapp => payload ->> 'whatsapp',
    p_email => payload ->> 'email',
    p_delivery_address => payload ->> 'delivery_address',
    p_district => payload ->> 'district',
    p_address_reference => payload ->> 'address_reference',
    p_delivery_notes => payload ->> 'delivery_notes',
    p_marketing_opt_in => coalesce((payload ->> 'marketing_opt_in')::boolean, false),
    p_total_amount => (payload ->> 'total_amount')::numeric,
    p_payment_method => payload ->> 'payment_method',
    p_payment_transaction_number => payload ->> 'payment_transaction_number',
    p_payment_holder_name => payload ->> 'payment_holder_name',
    p_payment_phone_number => payload ->> 'payment_phone_number',
    p_payment_screenshot_path => operation.proof_path,
    p_terms_accepted => (payload ->> 'terms_accepted')::boolean,
    p_exact_amount_confirmed => (payload ->> 'exact_amount_confirmed')::boolean,
    p_items => payload -> 'items'
  ) as r;
  if created_order_id is null then
    raise exception using errcode = '55000', message = 'Reservation transaction returned no order.';
  end if;

  update public.manual_reservation_operations as o
  set order_id = created_order_id
  where o.operation_id = p_operation_id
  returning o.* into operation;

  return query select operation.operation_id, operation.state, operation.order_code,
    operation.proof_path, (payload ->> 'total_amount')::numeric, payload ->> 'pack_slug', false;
end;
$$;

revoke all on function public.prepare_manual_reservation_v1(uuid,text,text,text,text,integer,jsonb)
  from public, anon, authenticated;
revoke all on function public.finalize_manual_reservation_v1(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.prepare_manual_reservation_v1(uuid,text,text,text,text,integer,jsonb)
  to service_role;
grant execute on function public.finalize_manual_reservation_v1(uuid,text,text)
  to service_role;

comment on table public.manual_reservation_operations is
  'Private immutable manual reservation identity and quote. Pending operations consume no stock; completed operations retain their order reference.';
commit;
