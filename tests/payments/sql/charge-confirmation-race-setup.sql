-- Persistent only inside the owned, networkless bagelito_test cluster.
do $$ declare claim jsonb;
begin
  if current_database()<>'bagelito_test' or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
  if exists(select 1 from public.orders where order_code in
    ('BAG-SYNTHETIC-RESULT-RACE','BAG-SYNTHETIC-RESULT-REPLACEMENT')
    and batch_id<>'00000000-0000-4000-8000-000000009110'::uuid) then
    raise exception 'Synthetic confirmation race collided';
  end if;
  delete from public.culqi_charge_confirmation_receipts where order_id in
    (select id from public.orders where batch_id='00000000-0000-4000-8000-000000009110');
  delete from public.payment_webhook_events where provider='culqi'
    and provider_event_id='evt_test_SYNTHETICResultRace';
  delete from public.orders where batch_id='00000000-0000-4000-8000-000000009110';
  delete from public.batches where id='00000000-0000-4000-8000-000000009110';
  insert into public.batches(id,name,status,capacity_packs,capacity_bagels)
    values('00000000-0000-4000-8000-000000009110','SYNTHETIC RESULT RACE','orders_open',1,6);
  insert into public.orders(id,batch_id,checkout_session_id,order_code,pack_slug,pack_name,pack_units,pack_type,
    customer_name,whatsapp,email,delivery_address,district,total_amount,payment_provider,payment_status,
    payment_lane,payment_amount_minor,payment_currency,payment_expires_at,status)
  values('00000000-0000-4000-8000-000000009111','00000000-0000-4000-8000-000000009110',
    '00000000-0000-4000-8000-000000009112','BAG-SYNTHETIC-RESULT-RACE','6-single','6 single',6,'single',
    'Synthetic','000000000','synthetic@example.invalid','Synthetic','Lince',58,'culqi','pending','token',5800,
    'PEN',clock_timestamp()+interval '30 minutes','payment_pending_review');
  perform public.prepare_culqi_token_session('00000000-0000-4000-8000-000000009111');
  claim:=public.claim_culqi_charge('00000000-0000-4000-8000-000000009111',
    'tkn_test_SYNTHETICResultRace','device_synthetic',false);
  if claim->>'claimed' is distinct from 'true' then raise exception 'Synthetic race claim blocked'; end if;
  perform public.finish_culqi_charge('00000000-0000-4000-8000-000000009111',
    (claim->>'attempt_id')::uuid,'submitted','chr_test_SYNTHETICResultRace','card','{}');
  update public.payment_attempts set id='00000000-0000-4000-8000-000000009113'
    where order_id='00000000-0000-4000-8000-000000009111';
  update public.orders set payment_charge_attempt_id='00000000-0000-4000-8000-000000009114'
    where id='00000000-0000-4000-8000-000000009111';
end $$;
