do $$
declare n integer; o uuid; b uuid; result jsonb; active_count integer;
begin
  if current_database() <> 'bagelito_test'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
  if not exists(select 1 from public.orders where order_code='BAG-EXPIRY-RACE-1'
    and payment_status='pending' and status='payment_pending_review'
    and payment_charge_state='submitting' and payment_charge_attempt_id is not null
    and payment_charge_source_id='tkn_test_expiry_race1' and payment_charge_device_id='device_fixture'
    and payment_reconciliation_required) then raise exception 'Claim-first expiry corrupted in-flight evidence'; end if;
  for n in 2..5 loop
    o := format('00000000-0000-4000-8000-%s',lpad((8101+n*10)::text,12,'0'))::uuid;
    if n = 3 then
      if not exists(select 1 from public.orders where id=o and payment_status='paid'
        and status='payment_confirmed' and not payment_reconciliation_required) then
        raise exception 'Paid-first expiry changed successful fulfillment';
      end if;
    else
      if not exists(select 1 from public.orders where id=o and payment_status='expired' and status='cancelled') then
        raise exception 'Safe expiry race did not cancel';
      end if;
      if (select count(*) from public.order_status_history where order_id=o and changed_by='payment expiry') <> 1 then
        raise exception 'Concurrent expiry wrote duplicate or missing history';
      end if;
    end if;
  end loop;
  b := '00000000-0000-4000-8000-000000008130';
  begin
    perform public.create_culqi_reservation_order('BAG-EXPIRY-RACE-PAID-EXTRA',gen_random_uuid(),
      b,'6-single','6 single',6,'single','Synthetic','000000000','synthetic@example.invalid',
      'Synthetic','Lince','','',false,66,clock_timestamp()+interval '30 minutes',true,
      '[{"flavor_slug":"plain","flavor_name":"Plain","quantity":6}]'::jsonb);
    raise exception 'Paid-first expiry released occupied capacity' using errcode='Z0001';
  exception when sqlstate 'Z0001' then raise;
    when others then if sqlerrm <> 'This Bagelito batch is full. Join the waitlist.' then raise; end if;
  end;
  o := '00000000-0000-4000-8000-000000008161';
  b := '00000000-0000-4000-8000-000000008160';
  if not exists(select 1 from public.orders where id=o and payment_status='pending'
    and status='payment_pending_review' and payment_charge_state='submitted'
    and payment_reconciliation_required)
    or not exists(select 1 from public.orders where order_code='BAG-EXPIRY-RACE-CAPACITY-NEW') then
    raise exception 'Expired charge quarantine changed the existing capacity-release rule';
  end if;
  result := public.claim_culqi_charge(o,'tkn_test_expiry_retry','device_fixture',false);
  if result->>'claimed' is distinct from 'false' then raise exception 'Quarantine permitted another charge'; end if;
  -- A synthetic verified late event must not take back the slot occupied by
  -- the new reservation. This tests the existing webhook reducer unchanged.
  perform public.apply_culqi_payment_event('evt_test_expiry_race6','charge.creation.succeeded',
    '{"id":"chr_test_expiry_race6","amount":6600,"currency":"PEN","source":{"id":"tkn_test_expiry_race6"}}','{}');
  if not exists(select 1 from public.orders where id=o and payment_status='paid'
    and status='cancelled' and payment_reconciliation_required
    and payment_reconciliation_reason='payment_after_reservation_release') then
    raise exception 'Late payment reclaimed capacity or escaped review';
  end if;
  select count(*) into active_count from public.orders where batch_id=b and status<>'cancelled'
    and not (payment_provider='culqi' and payment_status in ('pending','failed')
      and payment_expires_at<=clock_timestamp());
  if active_count <> 1 then raise exception 'Expiry/late-payment race oversold capacity'; end if;
end $$;
