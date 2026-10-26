-- Reset a non-pilot, non-6600 synthetic order between isolated race scenarios.
do $$ declare claim jsonb;
begin
  if current_database()<>'bagelito_test'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
  if exists(select 1 from public.orders where order_code='BAG-FUTURE-QA-8500'
    and batch_id is distinct from '00000000-0000-4000-8000-000000009910'::uuid) then
    raise exception 'Synthetic status recovery fixture collided';
  end if;
  delete from public.culqi_status_charge_receipts where order_id in
    (select id from public.orders where batch_id='00000000-0000-4000-8000-000000009910');
  delete from public.orders where batch_id='00000000-0000-4000-8000-000000009910';
  delete from public.batches where id='00000000-0000-4000-8000-000000009910';
  insert into public.batches(id,name,status,capacity_packs)
    values('00000000-0000-4000-8000-000000009910','SYNTHETIC STATUS GET RACE','orders_open',1);
  insert into public.orders(id,batch_id,checkout_session_id,order_code,pack_slug,pack_name,
    pack_units,pack_type,customer_name,whatsapp,email,delivery_address,district,total_amount,
    payment_provider,payment_status,payment_lane,payment_amount_minor,payment_currency,
    payment_expires_at,status)
  values('00000000-0000-4000-8000-000000009911','00000000-0000-4000-8000-000000009910',
    '00000000-0000-4000-8000-000000009912','BAG-FUTURE-QA-8500','6-single','6 single',6,'single',
    'Synthetic','000000000','synthetic@example.invalid','Synthetic','Lince',85,
    'culqi','pending','token',8500,'PEN',clock_timestamp()+interval '30 minutes','payment_pending_review');
  perform public.prepare_culqi_token_session('00000000-0000-4000-8000-000000009911');
  claim:=public.claim_culqi_charge('00000000-0000-4000-8000-000000009911',
    'tkn_test_SYNTHETICFutureSource','device_synthetic_future',false);
  if claim->>'claimed' is distinct from 'true' then raise exception 'Synthetic status claim blocked'; end if;
  perform public.finish_culqi_charge('00000000-0000-4000-8000-000000009911',
    (claim->>'attempt_id')::uuid,'submitted','chr_test_SYNTHETICFuture8500','card','{}');
  update public.payment_attempts set id='00000000-0000-4000-8000-000000009913'
    where order_id='00000000-0000-4000-8000-000000009911';
  update public.orders set payment_charge_attempt_id='00000000-0000-4000-8000-000000009914'
    where id='00000000-0000-4000-8000-000000009911';
  -- EXPLICIT SYNTHETIC OWNER APPROVAL IN THIS ISOLATED FIXTURE ONLY.
  -- Every assertion restores the independent QA policy to disabled.
  update public.culqi_status_charge_recovery_policy set enabled=true
    where qa_project_ref='qaahskendqdkynwtylho';
  if not found then raise exception 'Synthetic QA status policy is absent'; end if;
end $$;
