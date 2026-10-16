-- One pinned synthetic pilot is reset between isolated concurrency scenarios.
do $$ declare claim jsonb;
begin
  if current_database()<>'bagelito_test' or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required'; end if;
  if exists(select 1 from public.orders where order_code='BAG-000001'
    and batch_id<>'00000000-0000-4000-8000-000000009010'::uuid) then
    raise exception 'Pinned synthetic fixture collided'; end if;
  delete from public.culqi_charge_get_receipts where order_id in
    (select id from public.orders where batch_id='00000000-0000-4000-8000-000000009010');
  delete from public.orders where batch_id='00000000-0000-4000-8000-000000009010';
  delete from public.batches where id='00000000-0000-4000-8000-000000009010';
  insert into public.batches(id,name,status,capacity_packs)
    values('00000000-0000-4000-8000-000000009010','SYNTHETIC GET RACE','orders_open',1);
  insert into public.orders(id,batch_id,checkout_session_id,order_code,pack_slug,pack_name,pack_units,pack_type,
    customer_name,whatsapp,email,delivery_address,district,total_amount,payment_provider,payment_status,
    payment_lane,payment_amount_minor,payment_currency,payment_expires_at,status)
  values('00000000-0000-4000-8000-000000009011','00000000-0000-4000-8000-000000009010',
    '00000000-0000-4000-8000-000000009012','BAG-000001','6-single','6 single',6,'single',
    'Synthetic','000000000','synthetic@example.invalid','Synthetic','Lince',66,'culqi','pending','token',
    6600,'PEN',clock_timestamp()+interval '30 minutes','payment_pending_review');
  perform public.prepare_culqi_token_session('00000000-0000-4000-8000-000000009011');
  claim:=public.claim_culqi_charge('00000000-0000-4000-8000-000000009011','ype_test_SYNTHETICChargeGet','',false);
  if claim->>'claimed' is distinct from 'true' then raise exception 'Race synthetic claim blocked'; end if;
  perform public.finish_culqi_charge('00000000-0000-4000-8000-000000009011',(claim->>'attempt_id')::uuid,
    'submitted','chr_test_WIu0Hn7e9r2MqEue','yape','{}');
  update public.payment_attempts set id='00000000-0000-4000-8000-000000009013'
    where order_id='00000000-0000-4000-8000-000000009011';
  update public.orders set payment_charge_attempt_id='00000000-0000-4000-8000-000000009014'
    where id='00000000-0000-4000-8000-000000009011';
  -- EXPLICIT SYNTHETIC OWNER APPROVAL; reset disabled by each assertion.
  update public.culqi_charge_get_confirmation_policy set enabled=true where order_code='BAG-000001';
end $$;
