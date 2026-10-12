-- PROPOSED ONLY. Review and test on isolated PostgreSQL before applying.
-- Run after add-payment-provider.sql. Does not activate Culqi or change credentials.
begin;

alter table public.orders
  add column if not exists payment_charge_state text not null default 'idle',
  add column if not exists payment_charge_attempt_id uuid,
  add column if not exists payment_charge_source_id text,
  add column if not exists payment_charge_device_id text,
  add column if not exists payment_reconciliation_required boolean not null default false,
  add column if not exists payment_reconciliation_reason text;

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
    or o.payment_expires_at is null or o.payment_expires_at <= now()
    or o.payment_order_id is null then
    return jsonb_build_object('state','blocked','claimed',false);
  end if;
  if p_source_id is null or p_source_id !~ '^(tkn|ype)_(test|live)_[A-Za-z0-9_-]{8,100}$' then
    raise exception 'Invalid source';
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
  where provider = 'culqi' and provider_order_id = o.payment_order_id;
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
    select * into o from public.orders where payment_provider = 'culqi' and payment_order_id = resource_id for update;
  else
    select * into o from public.orders where payment_provider = 'culqi' and payment_charge_id = resource_id for update;
    if not found then
      select * into o from public.orders where payment_provider = 'culqi'
        and order_code = upper(trim(p_resource->'metadata'->>'bagelito_order_code')) for update;
    end if;
  end if;
  if o.id is null then raise exception 'Payment order not found'; end if;
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
      if o.status = 'cancelled' or o.payment_expires_at <= now() then
        next_status := 'needs_correction';
        reconcile_reason := 'payment_after_reservation_release';
      elsif o.status not in ('payment_confirmed','in_production','ready_for_delivery','delivered') then
        next_status := 'payment_confirmed';
      end if;
    elsif payment_state = 'expired' then next_status := 'cancelled';
    elsif payment_state = 'failed' then next_status := 'needs_correction';
    end if;
    update public.orders set payment_status = payment_state, status = next_status,
      payment_charge_id = case
        when not is_order and payment_state = 'failed' and o.payment_charge_state = 'uncertain'
          and p_resource->'source'->>'id' = o.payment_charge_source_id then null
        when not is_order then resource_id else payment_charge_id end,
      payment_charge_state = case
        when payment_state = 'paid' then 'submitted'
        when not is_order and payment_state = 'failed' and o.payment_charge_state = 'uncertain'
          and p_resource->'source'->>'id' = o.payment_charge_source_id then 'idle'
        else payment_charge_state end,
      payment_charge_attempt_id = case
        when not is_order and payment_state = 'failed' and o.payment_charge_state = 'uncertain'
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
      where provider = 'culqi' and provider_order_id = o.payment_order_id;
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
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype; provider_id text := p_provider_order->>'id';
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.payment_provider <> 'culqi' then raise exception 'Culqi reservation not found'; end if;
  if o.payment_status = 'paid' then return jsonb_build_object('paid',true); end if;
  if o.status = 'cancelled' or o.payment_expires_at <= now() then raise exception 'Reservation expired'; end if;
  if coalesce(provider_id,'') = '' or p_provider_order->>'currency_code' is distinct from 'PEN'
    or jsonb_typeof(p_provider_order->'amount') is distinct from 'number'
    or (p_provider_order->>'amount')::numeric <> o.payment_amount_minor then
    raise exception 'Provider order identity or total mismatch';
  end if;
  if o.payment_order_id is not null and o.payment_order_id <> provider_id then
    raise exception 'A different provider order is already attached';
  end if;
  insert into public.payment_attempts(order_id,provider,provider_order_id,amount_minor,currency_code,expires_at,payment_method,provider_payload)
    values(o.id,'culqi',provider_id,o.payment_amount_minor,'PEN',o.payment_expires_at,'Culqi',p_provider_order)
    on conflict (provider,provider_order_id) do nothing;
  update public.orders set payment_order_id = provider_id, payment_metadata = p_provider_order
    where id = o.id;
  return jsonb_build_object('attached',true,'orderId',provider_id);
end; $$;
revoke all on function public.attach_culqi_order(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.attach_culqi_order(uuid,jsonb) to service_role;

revoke all on function public.claim_culqi_charge(uuid,text,text,boolean) from public,anon,authenticated;
revoke all on function public.finish_culqi_charge(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.apply_culqi_payment_event(text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.claim_culqi_charge(uuid,text,text,boolean) to service_role;
grant execute on function public.finish_culqi_charge(uuid,uuid,text,text,text,jsonb) to service_role;
grant execute on function public.apply_culqi_payment_event(text,text,jsonb,jsonb) to service_role;
commit;
