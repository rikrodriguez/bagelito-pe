-- Forward migration AFTER add-checkout-safety.sql and add-culqi-session-expiry.sql.
-- Restores pending state atomically when an already permitted fresh charge is
-- claimed after a verified failure. Does not backfill rows, enable payments,
-- renew reservations, contact a provider, or confirm a charge.
begin;

do $$ begin
  if to_regprocedure('public.expire_culqi_token_session(uuid,uuid)') is null
    or to_regprocedure('public.claim_culqi_charge(uuid,text,text,boolean)') is null then
    raise exception using errcode='55000',message='Retry pending state requires both core migrations';
  end if;
end $$;

create or replace function public.claim_culqi_charge(
  p_order_id uuid, p_source_id text, p_device_id text, p_has_3ds boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
  a public.payment_attempts%rowtype;
  attempt_id uuid;
  retry_after_failure boolean := false;
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
  -- Only a coherent, verified failure may start another financial attempt.
  -- The reused local token-session row describes the current attempt, while
  -- the processed webhook retains the complete prior failure audit payload.
  if o.payment_charge_state='idle' and o.payment_status='failed' then
    select * into a from public.payment_attempts
      where order_id=o.id and provider='culqi' and provider_order_id is null for update;
    if not found or a.status is distinct from 'failed' or a.provider_charge_id is null
      or a.paid_at is not null or o.payment_paid_at is not null
      or o.status is distinct from 'needs_correction'
      or o.payment_charge_id is not null or o.payment_charge_attempt_id is not null
      or o.payment_charge_source_id is null or p_source_id=o.payment_charge_source_id
      or o.payment_reconciliation_reason is not null
      or not exists(select 1 from public.payment_webhook_events
        where provider='culqi' and event_type='charge.creation.failed'
          and provider_order_id=a.provider_charge_id and processed_at is not null) then
      return jsonb_build_object('state','blocked','claimed',false);
    end if;
    retry_after_failure := true;
  end if;
  attempt_id := gen_random_uuid();
  if retry_after_failure then
    update public.orders set payment_status='pending',status='payment_pending_review',
      payment_failure_code=null,payment_failure_message=null where id=o.id;
    update public.payment_attempts set status='pending',provider_charge_id=null,
      failure_code=null,failure_message=null,provider_payload=null where id=a.id;
    insert into public.order_status_history(order_id,old_status,new_status,changed_by)
      values(o.id,o.status,'payment_pending_review','culqi charge retry');
  end if;
  update public.orders set payment_charge_state = 'submitting',
    payment_charge_attempt_id = attempt_id, payment_charge_source_id = p_source_id,
    payment_charge_device_id = p_device_id where id = o.id;
  return jsonb_build_object('state','submitting','claimed',true,'attempt_id',attempt_id);
end; $$;

revoke all on function public.claim_culqi_charge(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.claim_culqi_charge(uuid,text,text,boolean) to service_role;

commit;
