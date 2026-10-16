-- Isolated PostgreSQL only. This regression covers a verified failure webhook
-- racing ahead of the HTTP charge response, followed by a stale finish call.
begin;
do $$ begin
  if current_database() not like '%test%'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
end $$;

do $$
declare
  b uuid; o uuid; claimed jsonb; row_before public.orders%rowtype;
  old_attempt uuid; prior_state text; suffix text;
begin
  insert into public.batches(name,status) values('EARLY FAILURE RACE','orders_open') returning id into b;
  foreach prior_state in array array['submitting','uncertain','requires_3ds'] loop
    suffix := replace(prior_state,'_','');
    insert into public.orders(batch_id,order_code,pack_slug,pack_name,pack_units,pack_type,
      customer_name,whatsapp,email,delivery_address,district,total_amount,
      payment_provider,payment_status,payment_lane,payment_amount_minor,payment_currency,
      payment_expires_at,status)
    values(b,'BAG-EARLY-'||upper(suffix),'6-single','6 single',6,'single',
      'Synthetic','000000000','synthetic@example.invalid','Synthetic','Lince',58,
      'culqi','pending','token',5800,'PEN',clock_timestamp()+interval '30 minutes','payment_pending_review')
    returning id into o;
    perform public.prepare_culqi_token_session(o);
    claimed := public.claim_culqi_charge(o,'tkn_test_early'||suffix,'device_synthetic',false);
    if claimed->>'claimed' is distinct from 'true' then raise exception 'Initial claim rejected'; end if;
    old_attempt := (claimed->>'attempt_id')::uuid;
    if prior_state <> 'submitting' then
      perform public.finish_culqi_charge(o,old_attempt,prior_state,null,'card','{}');
    end if;
    perform public.apply_culqi_payment_event('evt_test_early'||suffix,'charge.creation.failed',
      jsonb_build_object('id','chr_test_early'||suffix,'amount',5800,'currency','PEN',
        'metadata',jsonb_build_object('bagelito_order_code','BAG-EARLY-'||upper(suffix)),
        'source',jsonb_build_object('id','tkn_test_early'||suffix)),'{}');
    select * into row_before from public.orders where id=o;
    if row_before.payment_status <> 'failed'
      or row_before.payment_charge_state <> 'idle'
      or row_before.payment_reconciliation_required
      or row_before.payment_charge_attempt_id is not null
      or row_before.payment_charge_id is not null then
      raise exception 'Verified failure did not safely release the % attempt',prior_state;
    end if;

    -- The old request's timeout/error persistence must not override verified failure.
    begin
      perform public.finish_culqi_charge(o,old_attempt,'uncertain',null,'card','{}');
      raise exception 'Stale finish unexpectedly accepted' using errcode='Z0001';
    exception when sqlstate 'Z0001' then raise;
      when others then
        if sqlerrm <> 'Stale charge attempt' then raise; end if;
    end;
    if exists(select 1 from public.orders where id=o and
      (payment_charge_state <> 'idle' or payment_reconciliation_required)) then
      raise exception 'Stale finish overrode a verified failure';
    end if;
    claimed := public.claim_culqi_charge(o,'tkn_test_retry'||suffix,'device_synthetic',false);
    if claimed->>'claimed' is distinct from 'true'
      or (claimed->>'attempt_id')::uuid = old_attempt then
      raise exception 'Verified failure cannot start a distinct new attempt';
    end if;
  end loop;
end $$;
rollback;
