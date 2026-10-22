-- A trusted review can arrive while the provider call is still in flight.
begin;
do $$ declare reason text; batch_uuid uuid; order_uuid uuid; claim jsonb;
begin
  if current_database()<>'bagelito_test' or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
  insert into public.batches(name,status) values('SYNTHETIC STICKY FINISH','orders_open') returning id into batch_uuid;
  foreach reason in array array['known_pending_refund','synthetic_manual_review','charge_observation_adverse'] loop
    delete from public.orders where batch_id=batch_uuid;
    insert into public.orders(batch_id,checkout_session_id,order_code,pack_slug,pack_name,pack_units,pack_type,
      customer_name,whatsapp,email,delivery_address,district,total_amount,payment_provider,payment_status,
      payment_lane,payment_amount_minor,payment_currency,payment_expires_at,status)
    values(batch_uuid,gen_random_uuid(),'BAG-SYNTHETIC-STICKY-FINISH','6-single','6 single',6,'single',
      'Synthetic','000000000','synthetic@example.invalid','Synthetic','Lince',58,'culqi','pending','token',5800,
      'PEN',clock_timestamp()+interval '30 minutes','payment_pending_review') returning id into order_uuid;
    perform public.prepare_culqi_token_session(order_uuid);
    claim:=public.claim_culqi_charge(order_uuid,'tkn_test_SYNTHETICStickySource','device_synthetic',false);
    update public.orders set payment_reconciliation_required=true,payment_reconciliation_reason=reason where id=order_uuid;
    perform public.finish_culqi_charge(order_uuid,(claim->>'attempt_id')::uuid,'uncertain',
      'chr_test_SYNTHETICStickyCharge','card','{"stage":"reconciliation_required"}');
    if not exists(select 1 from public.orders where id=order_uuid and payment_reconciliation_required
      and payment_reconciliation_reason=reason and payment_charge_state='uncertain') then
      raise exception 'Generic timeout overwrote durable financial review';
    end if;
  end loop;
end $$;
rollback;
\echo 'PASS: generic finish preserves review arriving during submitting provider I/O'
