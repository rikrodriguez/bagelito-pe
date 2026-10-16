-- Isolated PostgreSQL only. Run this, then immediately launch capacity-race-webhook.sql
-- in one psql connection and capacity-race-reserve.sql in another. Wait for both,
-- then run capacity-race-assert.sql. The reserve connection waits for hold expiry.
do $$ begin
  if current_database() not like '%test%'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
end $$;
insert into public.batches(id,name,status,capacity_packs)
  values('00000000-0000-4000-8000-000000007001','PAYMENT/CAPACITY RACE','orders_open',1);
insert into public.orders(id,batch_id,order_code,pack_slug,pack_name,pack_units,pack_type,
  customer_name,whatsapp,email,delivery_address,district,total_amount,
  payment_provider,payment_status,payment_lane,payment_amount_minor,payment_currency,
  payment_expires_at,status)
values('00000000-0000-4000-8000-000000007002','00000000-0000-4000-8000-000000007001',
  'BAG-CAPACITY-OLD','6-single','6 single',6,'single','Synthetic','000000000',
  'synthetic@example.invalid','Synthetic','Lince',58,'culqi','pending',
  'token',5800,'PEN',clock_timestamp()+interval '3 seconds','payment_pending_review');
select public.prepare_culqi_token_session('00000000-0000-4000-8000-000000007002');
select public.claim_culqi_charge('00000000-0000-4000-8000-000000007002','tkn_test_capacityrace','device_synthetic',false);
