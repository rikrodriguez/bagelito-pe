-- NOT RUN. Requires an isolated database with the repository's schema and
-- proposed migration installed. Never run against production.
-- Set bagelito.test_mode=on explicitly in a *_test* database before invocation.
begin;
do $$ begin
  if current_database() not like '%test%' or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit bagelito.test_mode=on are required';
  end if;
end $$;

insert into public.orders(id,order_code,pack_slug,pack_name,pack_units,pack_type,
 customer_name,whatsapp,email,delivery_address,district,total_amount,
 payment_provider,payment_status,payment_order_id,payment_amount_minor,payment_currency,
 payment_expires_at,status)
values('00000000-0000-4000-8000-000000000001','BAG-TRANSACTION-FIXTURE','6-mixed','6 mixed',6,'mixed',
 'Fixture','000000000','fixture@example.invalid','Fixture','Lince',68,
 'culqi','pending','ord_test_fixture123',6800,'PEN',now()+interval '30 minutes','payment_pending_review');
insert into public.payment_attempts(order_id,provider,provider_order_id,amount_minor,currency_code)
values('00000000-0000-4000-8000-000000000001','culqi','ord_test_fixture123',6800,'PEN');

do $$
declare first_claim jsonb; second_claim jsonb; result jsonb; before_count bigint; actual_status text;
begin
  first_claim := public.claim_culqi_charge('00000000-0000-4000-8000-000000000001','tkn_test_fixture123','device123',false);
  second_claim := public.claim_culqi_charge('00000000-0000-4000-8000-000000000001','tkn_test_other12345','device123',false);
  if first_claim->>'claimed' <> 'true' or second_claim->>'claimed' <> 'false' then raise exception 'Claim serialization failed'; end if;
  perform public.finish_culqi_charge('00000000-0000-4000-8000-000000000001',(first_claim->>'attempt_id')::uuid,'submitted','chr_test_fixture123','card','{}');

  -- A failure inside the function must roll back its event insertion too.
  begin
    perform public.apply_culqi_payment_event('evt_test_badamount12','charge.creation.succeeded',
      '{"id":"chr_test_fixture123","amount":1,"currency":"PEN"}','{}');
    raise exception 'Expected mismatch rejection' using errcode='Z0001';
  exception when sqlstate 'Z0001' then raise;
    when others then null;
  end;
  if exists(select 1 from public.payment_webhook_events where provider_event_id='evt_test_badamount12') then
    raise exception 'Failed transaction left an event marker';
  end if;
  select count(*) into before_count from public.order_status_history where order_id='00000000-0000-4000-8000-000000000001';
  result := public.apply_culqi_payment_event('evt_test_fixture123','charge.creation.succeeded',
    '{"id":"chr_test_fixture123","amount":6800,"currency":"PEN"}','{}');
  if result->>'status' <> 'paid' then raise exception 'Payment not confirmed'; end if;
  result := public.apply_culqi_payment_event('evt_test_fixture123','charge.creation.succeeded',
    '{"id":"chr_test_fixture123","amount":6800,"currency":"PEN"}','{}');
  if result->>'duplicate' <> 'true' then raise exception 'Duplicate not detected'; end if;
  if (select count(*) from public.order_status_history where order_id='00000000-0000-4000-8000-000000000001') <> before_count+1 then
    raise exception 'Duplicate history';
  end if;
  update public.orders set status='delivered' where id='00000000-0000-4000-8000-000000000001';
  perform public.apply_culqi_payment_event('evt_test_fixture456','charge.creation.succeeded',
    '{"id":"chr_test_fixture123","amount":6800,"currency":"PEN"}','{}');
  select status into actual_status from public.orders where id='00000000-0000-4000-8000-000000000001';
  if actual_status <> 'delivered' then raise exception 'Fulfillment regressed'; end if;
end $$;
rollback;
