-- Transaction time intentionally predates expiry, just as when an RPC waits for
-- a row lock. Authorize using the wall clock after the lock, not frozen now().
begin;
do $$ begin
  if current_database() not like '%test%'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
end $$;
do $$
declare b uuid; charge_order uuid; prepare_order uuid; claimed jsonb;
begin
  insert into public.batches(name,status) values('EXPIRY CLOCK FIXTURE','orders_open') returning id into b;
  insert into public.orders(batch_id,order_code,pack_slug,pack_name,pack_units,pack_type,
    customer_name,whatsapp,email,delivery_address,district,total_amount,
    payment_provider,payment_status,payment_lane,payment_amount_minor,payment_currency,
    payment_expires_at,status)
  values(b,'BAG-EXPIRY-CHARGE','6-single','6 single',6,'single',
    'Synthetic','000000000','synthetic@example.invalid','Synthetic','Lince',58,
    'culqi','pending','token',5800,'PEN',clock_timestamp()+interval '1 second','payment_pending_review')
  returning id into charge_order;
  perform public.prepare_culqi_token_session(charge_order);
  insert into public.orders(batch_id,order_code,pack_slug,pack_name,pack_units,pack_type,
    customer_name,whatsapp,email,delivery_address,district,total_amount,
    payment_provider,payment_status,payment_lane,payment_amount_minor,payment_currency,payment_expires_at,status)
  values(b,'BAG-EXPIRY-PREPARE','6-single','6 single',6,'single',
    'Synthetic','000000000','synthetic@example.invalid','Synthetic','Lince',58,
    'culqi','pending','token',5800,'PEN',clock_timestamp()+interval '1 second','payment_pending_review')
  returning id into prepare_order;
  perform pg_sleep(2);
  claimed := public.claim_culqi_charge(charge_order,'tkn_test_expiryclock','device_synthetic',false);
  if claimed->>'claimed' is distinct from 'false' then
    raise exception 'Charge claim used frozen transaction time after expiry';
  end if;
  begin
    perform public.prepare_culqi_token_session(prepare_order);
    raise exception 'Token session prepared after actual expiry' using errcode='Z0001';
  exception when sqlstate 'Z0001' then raise;
    when others then
      if position('expir' in lower(sqlerrm)) = 0 and position('cannot' in lower(sqlerrm)) = 0
        and position('not' in lower(sqlerrm)) = 0 then raise; end if;
  end;
end $$;
rollback;
