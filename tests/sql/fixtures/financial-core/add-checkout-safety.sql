-- PROPOSED ONLY. Review and test on isolated PostgreSQL before applying.
-- Run after add-payment-provider.sql. Does not activate Culqi or change credentials.
begin;

create or replace function public.enforce_reservation_window()
returns trigger language plpgsql set search_path = public as $$
declare b public.batches%rowtype;
begin
 select * into b from public.batches where id=new.batch_id for update;
 if not found then raise exception 'Reservation batch not found.'; end if;
 if b.status <> 'orders_open' then raise exception 'Reservation batch is closed.'; end if;
 if b.orders_open_at is not null and clock_timestamp() < b.orders_open_at then
  raise exception 'Reservation batch has not opened yet.';
 end if;
 if b.orders_close_at is not null and clock_timestamp() >= b.orders_close_at then
  raise exception 'Reservation batch has already closed.';
 end if;
 return new;
end $$;
drop trigger if exists orders_reservation_window on public.orders;
create trigger orders_reservation_window before insert on public.orders
for each row execute function public.enforce_reservation_window();


alter table public.orders add column if not exists payment_preparation_claimed boolean not null default false;
create or replace function public.claim_culqi_order_preparation(p_order_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin return false; end $$;
revoke execute on function public.claim_culqi_order_preparation(uuid) from public, anon, authenticated;
grant execute on function public.claim_culqi_order_preparation(uuid) to service_role;



alter table public.orders
  add column if not exists payment_charge_state text not null default 'uncertain',
  add column if not exists payment_charge_attempt_id uuid,
  add column if not exists payment_charge_source_id text,
  add column if not exists payment_charge_device_id text,
  add column if not exists payment_reconciliation_required boolean not null default false,
  add column if not exists payment_reconciliation_reason text;

-- Existing provider orders remain legacy and cannot enter the token lane.
alter table public.orders add column if not exists payment_lane text not null default 'legacy';
alter table public.orders alter column payment_lane set default 'token';
alter table public.orders drop constraint if exists orders_payment_lane_check;
alter table public.orders add constraint orders_payment_lane_check check(payment_lane in ('legacy','token'));
alter table public.payment_attempts alter column provider_order_id drop not null;
create unique index if not exists payment_attempts_token_session_unique
  on public.payment_attempts(order_id) where provider='culqi' and provider_order_id is null;

create or replace function public.prepare_culqi_token_session(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.orders%rowtype; session_id uuid;
begin
 select * into o from public.orders where id=p_order_id for update;
 if not found or o.payment_provider <> 'culqi' or o.payment_lane <> 'token'
   or o.payment_order_id is not null or o.payment_reconciliation_required
   or o.payment_charge_state <> 'idle' or o.payment_status='paid'
   or o.status in ('cancelled','delivered') or o.payment_expires_at is null
   or o.payment_expires_at <= clock_timestamp()
   or exists(select 1 from public.payment_attempts where order_id=o.id and provider_order_id is not null)
 then raise exception 'Token payment session is blocked or expired'; end if;
 insert into public.payment_attempts(order_id,provider,provider_order_id,amount_minor,currency_code,expires_at,payment_method)
   values(o.id,'culqi',null,o.payment_amount_minor,'PEN',o.payment_expires_at,'token')
   on conflict (order_id) where provider='culqi' and provider_order_id is null do nothing;
 select id into session_id from public.payment_attempts where order_id=o.id and provider='culqi' and provider_order_id is null;
 return jsonb_build_object('sessionId',session_id,'amount',o.payment_amount_minor,'expiresAt',o.payment_expires_at);
end $$;
revoke all on function public.prepare_culqi_token_session(uuid) from public,anon,authenticated;
grant execute on function public.prepare_culqi_token_session(uuid) to service_role;

alter table public.orders alter column payment_charge_state set default 'idle';
update public.orders set payment_reconciliation_required = true,
  payment_reconciliation_reason = 'legacy_payment_outcome_unknown'
  where payment_provider = 'culqi' and payment_charge_state = 'uncertain';

alter table public.orders drop constraint if exists orders_culqi_charge_state_check;
alter table public.orders add constraint orders_culqi_charge_state_check
  check (payment_charge_state in ('idle','submitting','requires_3ds','submitted','uncertain'));

create unique index if not exists orders_culqi_order_unique
  on public.orders(payment_order_id) where payment_provider = 'culqi' and payment_order_id is not null;
create unique index if not exists orders_culqi_charge_unique
  on public.orders(payment_charge_id) where payment_provider = 'culqi' and payment_charge_id is not null;

-- Existing charged orders must never be eligible for an automatic fresh charge.
update public.orders set payment_charge_state = 'submitted'
where payment_provider = 'culqi' and (payment_charge_id is not null or payment_status = 'paid');

create or replace function public.claim_culqi_charge(
  p_order_id uuid, p_source_id text, p_device_id text, p_has_3ds boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype; attempt_id uuid;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.payment_provider <> 'culqi' then raise exception 'Culqi order not found'; end if;
  if o.payment_status = 'paid' then return jsonb_build_object('state','paid','claimed',false); end if;
  if o.status in ('cancelled','delivered') or o.payment_reconciliation_required
    or o.payment_expires_at is null or o.payment_expires_at <= clock_timestamp()
    or o.payment_order_id is not null or o.payment_lane <> 'token' then
    return jsonb_build_object('state','blocked','claimed',false);
  end if;
  if not exists(select 1 from public.payment_attempts where order_id=o.id and provider='culqi' and provider_order_id is null)
    or exists(select 1 from public.payment_attempts where order_id=o.id and provider='culqi' and provider_order_id is not null) then
    return jsonb_build_object('state','blocked','claimed',false);
  end if;
  if p_source_id is null or p_source_id !~ '^(tkn|ype)_(test|live)_[A-Za-z0-9_-]{8,100}$' then
    raise exception 'Invalid source';
  end if;
  if p_source_id like 'ype_%' and (coalesce(p_has_3ds,false) or o.payment_amount_minor > 200000) then
    raise exception 'Yape does not support card 3DS or payments above PEN 2000';
  end if;
  if o.payment_charge_state = 'requires_3ds' then
    if not coalesce(p_has_3ds,false)
       or o.payment_charge_source_id is distinct from p_source_id
       or o.payment_charge_device_id is distinct from p_device_id then
      return jsonb_build_object('state','requires_3ds','claimed',false);
    end if;
  elsif o.payment_charge_state <> 'idle' or coalesce(p_has_3ds,false) then
    return jsonb_build_object('state',o.payment_charge_state,'claimed',false);
  end if;
  attempt_id := gen_random_uuid();
  update public.orders set payment_charge_state = 'submitting',
    payment_charge_attempt_id = attempt_id, payment_charge_source_id = p_source_id,
    payment_charge_device_id = p_device_id where id = o.id;
  return jsonb_build_object('state','submitting','claimed',true,'attempt_id',attempt_id);
end; $$;

create or replace function public.finish_culqi_charge(
  p_order_id uuid, p_attempt_id uuid, p_state text, p_charge_id text,
  p_method text, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype;
begin
  if p_state not in ('requires_3ds','submitted','uncertain') then raise exception 'Invalid charge state'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.payment_charge_attempt_id is distinct from p_attempt_id then
    raise exception 'Stale charge attempt';
  end if;
  -- A webhook can complete before this request returns from Culqi.
  if o.payment_status = 'paid' then return jsonb_build_object('state','paid'); end if;
  if o.payment_charge_state <> 'submitting' then
    return jsonb_build_object('state',o.payment_charge_state);
  end if;
  if p_state = 'submitted' and coalesce(p_charge_id,'') = '' then raise exception 'Charge ID required'; end if;
  if o.payment_charge_id is not null and p_charge_id is not null and o.payment_charge_id <> p_charge_id then
    raise exception 'Conflicting charge identity';
  end if;
  update public.orders set payment_charge_state = p_state,
    payment_charge_id = coalesce(p_charge_id,payment_charge_id),
    payment_metadata = p_payload,
    payment_reconciliation_required = payment_reconciliation_required or p_state = 'uncertain',
    payment_reconciliation_reason = case when p_state = 'uncertain' then 'charge_result_uncertain' else payment_reconciliation_reason end
  where id = o.id;
  update public.payment_attempts set provider_charge_id = coalesce(p_charge_id,provider_charge_id),
    payment_method = p_method, provider_payload = p_payload
  where provider = 'culqi' and order_id = o.id and provider_order_id is null;
  if not found then raise exception 'Payment attempt not found'; end if;
  return jsonb_build_object('state',p_state);
end; $$;

-- Called only after an authenticated server-to-server event lookup and validation.
create or replace function public.apply_culqi_payment_event(
  p_event_id text, p_event_type text, p_resource jsonb, p_verified_payload jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e public.payment_webhook_events%rowtype;
  o public.orders%rowtype;
  resource_id text := p_resource->>'id';
  payment_state text;
  next_status text;
  reconcile_reason text;
  matched_by_charge_id boolean := false;
  is_order boolean := p_event_type = 'order.status.changed';
begin
  if p_event_type not in ('order.status.changed','charge.creation.succeeded','charge.creation.failed','charge.expired')
    or p_event_id is null or p_event_id !~ '^evt_(test|live)_[A-Za-z0-9_-]{8,40}$'
    or coalesce(resource_id,'') = '' then raise exception 'Invalid event'; end if;
  insert into public.payment_webhook_events(provider,provider_event_id,event_type,provider_order_id,payload)
    values ('culqi',p_event_id,p_event_type,resource_id,p_verified_payload)
    on conflict (provider,provider_event_id) do nothing;
  select * into e from public.payment_webhook_events
    where provider = 'culqi' and provider_event_id = p_event_id for update;
  if e.processed_at is not null then return jsonb_build_object('duplicate',true); end if;
  if is_order then
    select * into o from public.orders where payment_provider = 'culqi' and payment_order_id = resource_id;
  else
    select * into o from public.orders where payment_provider = 'culqi' and payment_charge_id = resource_id;
    matched_by_charge_id := found;
    if not found then
      select * into o from public.orders where payment_provider = 'culqi'
        and order_code = upper(trim(p_resource->'metadata'->>'bagelito_order_code'));
    end if;
  end if;
  if o.id is null then raise exception 'Payment order not found'; end if;
  -- Match reservation capacity's lock order: batch before order. Re-read after
  -- waiting, because payment identity/state may have changed in the meantime.
  perform 1 from public.batches where id=o.batch_id for update;
  select * into o from public.orders where id=o.id for update;
  if is_order then raise exception 'Alternative payment orders require manual reconciliation'; end if;
  if o.payment_lane <> 'token' or o.payment_order_id is not null then raise exception 'Legacy payment requires manual reconciliation'; end if;
  if not is_order and not matched_by_charge_id and (
    o.payment_lane <> 'token' or o.payment_order_id is not null or o.payment_charge_source_id is null
    or p_resource->'source'->>'id' is distinct from o.payment_charge_source_id
  ) then raise exception 'Charge source does not match the claimed attempt'; end if;
  if jsonb_typeof(p_resource->'amount') is distinct from 'number'
     or (p_resource->>'amount')::numeric <> coalesce(o.payment_amount_minor,round(o.total_amount * 100))
     or (p_resource->>'amount')::numeric <= 0
     or trunc((p_resource->>'amount')::numeric) <> (p_resource->>'amount')::numeric
     or coalesce(p_resource->>'currency_code',p_resource->>'currency','') <> 'PEN'
     or (p_resource ? 'currency_code' and p_resource->>'currency_code' is distinct from 'PEN')
     or (p_resource ? 'currency' and p_resource->>'currency' is distinct from 'PEN') then
    raise exception 'Payment amount or currency mismatch';
  end if;
  payment_state := case p_event_type
    when 'charge.creation.succeeded' then 'paid'
    when 'charge.creation.failed' then 'failed'
    when 'charge.expired' then 'expired'
    else case p_resource->>'state' when 'paid' then 'paid' when 'expired' then 'expired'
      when 'created' then 'pending' when 'pending' then 'pending' when 'deleted' then 'expired' else null end end;
  if payment_state is null then raise exception 'Unknown order state'; end if;
  next_status := o.status;

  if not is_order and payment_state <> 'paid'
    and p_resource->'source'->>'id' is not null
    and o.payment_charge_source_id is not null
    and p_resource->'source'->>'id' <> o.payment_charge_source_id then
    null; -- Delayed failure from an older token must not release a newer claim.
  elsif o.payment_status = 'paid' and payment_state = 'paid' and (
      (not is_order and o.payment_charge_id is distinct from resource_id)
      or (is_order and o.payment_charge_id is not null)
    ) then
    reconcile_reason := 'multiple_payment_resources_for_paid_order';
  elsif not is_order and o.payment_charge_id is not null and o.payment_charge_id <> resource_id then
    reconcile_reason := 'different_charge_for_same_order';
  elsif o.payment_status = 'paid' then
    if p_event_type = 'charge.expired' then reconcile_reason := 'paid_charge_reversed'; end if;
    -- Other delayed events never undo an existing successful payment.
  elsif is_order and payment_state <> 'paid' and o.payment_charge_state <> 'idle' then
    -- Expiry of the alternative-payment order says nothing about a card charge.
    reconcile_reason := 'alternative_order_changed_during_charge';
  elsif payment_state = 'pending' and o.payment_status <> 'pending' then
    null; -- Do not regress failed/expired states on an older pending event.
  else
    if payment_state = 'paid' then
      if o.status = 'cancelled' or o.payment_expires_at <= clock_timestamp() then
        next_status := 'cancelled';
        reconcile_reason := 'payment_after_reservation_release';
      elsif o.status not in ('payment_confirmed','in_production','ready_for_delivery','delivered') then
        next_status := 'payment_confirmed';
      end if;
    elsif payment_state = 'expired' and o.status not in ('in_production','ready_for_delivery','delivered','cancelled') then next_status := 'cancelled';
    elsif payment_state = 'failed' and o.status not in ('in_production','ready_for_delivery','delivered','cancelled') then next_status := 'needs_correction';
    end if;
    update public.orders set payment_status = payment_state, status = next_status,
      payment_charge_id = case
        when not is_order and payment_state = 'failed' and o.payment_charge_state in ('submitting','requires_3ds','uncertain')
          and p_resource->'source'->>'id' = o.payment_charge_source_id then null
        when not is_order then resource_id else payment_charge_id end,
      payment_charge_state = case
        when payment_state = 'paid' then 'submitted'
        when not is_order and payment_state = 'failed' and o.payment_charge_state in ('submitting','requires_3ds','uncertain')
          and p_resource->'source'->>'id' = o.payment_charge_source_id then 'idle'
        else payment_charge_state end,
      payment_charge_attempt_id = case
        when not is_order and payment_state = 'failed' and o.payment_charge_state in ('submitting','requires_3ds','uncertain')
          and p_resource->'source'->>'id' = o.payment_charge_source_id then null
        else payment_charge_attempt_id end,
      payment_reconciliation_required = case
        when not is_order and p_resource->'source'->>'id' = o.payment_charge_source_id
          and payment_state in ('paid','failed') and payment_reconciliation_reason = 'charge_result_uncertain' then false
        else payment_reconciliation_required end,
      payment_reconciliation_reason = case
        when not is_order and p_resource->'source'->>'id' = o.payment_charge_source_id
          and payment_state in ('paid','failed') and payment_reconciliation_reason = 'charge_result_uncertain' then null
        else payment_reconciliation_reason end,
      payment_paid_at = case when payment_state = 'paid' then coalesce(payment_paid_at,now()) else payment_paid_at end,
      payment_failure_code = case when payment_state = 'failed' then coalesce(p_resource->'outcome'->>'decline_code',p_resource->'outcome'->>'code') else null end,
      payment_failure_message = case when payment_state = 'failed' then coalesce(p_resource->'outcome'->>'user_message',p_resource->'outcome'->>'merchant_message') else null end
      where id = o.id;
    update public.payment_attempts set status = payment_state,
      provider_charge_id = case when not is_order then resource_id else provider_charge_id end,
      paid_at = case when payment_state = 'paid' then coalesce(paid_at,now()) else paid_at end,
      provider_payload = p_verified_payload
      where provider = 'culqi' and order_id = o.id and provider_order_id is null;
    if not found then raise exception 'Payment attempt not found'; end if;
    if next_status <> o.status then
      insert into public.order_status_history(order_id,old_status,new_status,changed_by)
        values(o.id,o.status,next_status,'culqi webhook');
    end if;
  end if;
  if reconcile_reason is not null then
    update public.orders set payment_reconciliation_required = true,
      payment_reconciliation_reason = reconcile_reason where id = o.id;
  end if;
  update public.payment_webhook_events set processed_at = now() where id = e.id;
  return jsonb_build_object('orderCode',o.order_code,'status',payment_state,
    'reconciliationRequired',reconcile_reason is not null);
end; $$;

-- Attach provider order and attempt together, without resetting concurrent paid state.
create or replace function public.attach_culqi_order(p_order_id uuid, p_provider_order jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 raise exception 'Alternative payment orders are disabled; use token sessions';
end $$;
revoke all on function public.attach_culqi_order(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.attach_culqi_order(uuid,jsonb) to service_role;

revoke all on function public.claim_culqi_charge(uuid,text,text,boolean) from public,anon,authenticated;
revoke all on function public.finish_culqi_charge(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.apply_culqi_payment_event(text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.claim_culqi_charge(uuid,text,text,boolean) to service_role;
grant execute on function public.finish_culqi_charge(uuid,uuid,text,text,text,jsonb) to service_role;
grant execute on function public.apply_culqi_payment_event(text,text,jsonb,jsonb) to service_role;
-- Replace reservation function so capacity uses the post-lock clock.
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

  -- Waiting on capacity must not preserve a stale transaction-start clock.
  now_ts := clock_timestamp();
  if p_payment_expires_at <= now_ts then
    raise exception 'Payment expiry elapsed while waiting for capacity.';
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


commit;
