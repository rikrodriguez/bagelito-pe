-- Runs only against the isolated PostgreSQL fixture. Requires an isolated database with the repository's schema and
-- proposed migration installed. Never run against production.
-- Set bagelito.test_mode=on explicitly in a *_test* database before invocation.
begin;
do $$ begin
  if current_database() not like '%test%' or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit bagelito.test_mode=on are required';
  end if;
end $$;

insert into public.batches(id,name,status) values('00000000-0000-4000-8000-000000000002','TRANSACTION FIXTURE','orders_open');
insert into public.orders(id,batch_id,order_code,pack_slug,pack_name,pack_units,pack_type,
 customer_name,whatsapp,email,delivery_address,district,total_amount,
 payment_provider,payment_status,payment_lane,payment_amount_minor,payment_currency,
 payment_expires_at,status)
values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','BAG-TRANSACTION-FIXTURE','6-mixed','6 mixed',6,'mixed',
 'Fixture','000000000','fixture@example.invalid','Fixture','Lince',68,
 'culqi','pending','token',6800,'PEN',now()+interval '30 minutes','payment_pending_review');
select public.prepare_culqi_token_session('00000000-0000-4000-8000-000000000001');

create function public.fixture_fail_history() returns trigger language plpgsql as $$
begin
 if current_setting('bagelito.force_history_failure',true) = 'on' then raise exception 'intentional history failure'; end if;
 return new;
end $$;
create trigger fixture_history_failure before insert on public.order_status_history
for each row execute function public.fixture_fail_history();

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
  -- Force a failure AFTER order and attempt updates. All effects must roll back.
  perform set_config('bagelito.force_history_failure','on',true);
  begin
    perform public.apply_culqi_payment_event('evt_test_historyfail1','charge.creation.succeeded',
      '{"id":"chr_test_fixture123","amount":6800,"currency":"PEN"}','{}');
    raise exception 'Expected history failure' using errcode='Z0001';
  exception when sqlstate 'Z0001' then raise;
    when others then
      if sqlerrm <> 'intentional history failure' then raise; end if;
  end;
  perform set_config('bagelito.force_history_failure','off',true);
  if exists(select 1 from public.payment_webhook_events where provider_event_id='evt_test_historyfail1')
    or (select payment_status from public.orders where id='00000000-0000-4000-8000-000000000001') <> 'pending'
    or (select status from public.payment_attempts where order_id='00000000-0000-4000-8000-000000000001') <> 'pending' then
    raise exception 'Partial payment effects survived history failure';
  end if;
  -- Metadata fallback must require the exact source claimed for this order.
  update public.orders set payment_charge_id=null where id='00000000-0000-4000-8000-000000000001';
  begin
    perform public.apply_culqi_payment_event('evt_test_wrongsource1','charge.creation.succeeded',
      '{"id":"chr_test_fixture123","amount":6800,"currency":"PEN","metadata":{"bagelito_order_code":"BAG-TRANSACTION-FIXTURE"},"source":{"id":"tkn_test_wrongtoken"}}','{}');
    raise exception 'Expected wrong-source rejection' using errcode='Z0001';
  exception when sqlstate 'Z0001' then raise;
    when others then if sqlerrm <> 'Charge source does not match the claimed attempt' then raise; end if;
  end;
  select count(*) into before_count from public.order_status_history where order_id='00000000-0000-4000-8000-000000000001';
  result := public.apply_culqi_payment_event('evt_test_fixture123','charge.creation.succeeded',
    '{"id":"chr_test_fixture123","amount":6800,"currency":"PEN","metadata":{"bagelito_order_code":"BAG-TRANSACTION-FIXTURE"},"source":{"id":"tkn_test_fixture123"}}','{}');
  if result->>'status' <> 'paid' then raise exception 'Payment not confirmed'; end if;
  perform public.finish_culqi_charge('00000000-0000-4000-8000-000000000001',(first_claim->>'attempt_id')::uuid,'submitted','chr_test_fixture123','card','{}');
  if (select payment_status from public.orders where id='00000000-0000-4000-8000-000000000001') <> 'paid' then
    raise exception 'Late charge response downgraded verified payment';
  end if;
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
  perform public.apply_culqi_payment_event('evt_test_delayedfail1','charge.creation.failed',
    '{"id":"chr_test_fixture123","amount":6800,"currency":"PEN"}','{}');
  if (select payment_status from public.orders where id='00000000-0000-4000-8000-000000000001') <> 'paid' then
    raise exception 'Delayed failure undid payment';
  end if;
  update public.orders set status='cancelled',payment_status='pending',payment_expires_at=now()-interval '1 minute'
    where id='00000000-0000-4000-8000-000000000001';
  perform public.apply_culqi_payment_event('evt_test_cancelfail12','charge.creation.failed',
    '{"id":"chr_test_fixture123","amount":6800,"currency":"PEN"}','{}');
  if (select status from public.orders where id='00000000-0000-4000-8000-000000000001') <> 'cancelled' then
    raise exception 'Failed payment reopened a cancelled reservation';
  end if;
  perform public.apply_culqi_payment_event('evt_test_latepayment1','charge.creation.succeeded',
    '{"id":"chr_test_fixture123","amount":6800,"currency":"PEN"}','{}');
  if not exists(select 1 from public.orders where id='00000000-0000-4000-8000-000000000001'
    and status='cancelled' and payment_status='paid' and payment_reconciliation_required) then
    raise exception 'Late payment was not quarantined without reclaiming capacity';
  end if;
end $$;
rollback;
