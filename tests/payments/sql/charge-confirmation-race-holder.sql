begin;
select set_config('bagelito.confirmation_case', :'scenario', true);
select set_config('bagelito.confirmation_signal', :'signal', true);
do $$ declare n integer:=current_setting('bagelito.confirmation_case')::integer;
  r jsonb; blocked boolean:=false; iteration integer; deadline timestamptz;
begin
  if current_database()<>'bagelito_test' or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
  if n in (1,3) then
    r:=public.confirm_culqi_charge_result('00000000-0000-4000-8000-000000009111',
      '00000000-0000-4000-8000-000000009112','00000000-0000-4000-8000-000000009114',
      clock_timestamp(),'culqi_charge_post','test',
      '{"chargeId":"chr_test_SYNTHETICResultRace","sourceId":"tkn_test_SYNTHETICResultRace","amountMinor":5800,"currencyCode":"PEN","capture":true,"currentAmountMinor":5800,"amountRefundedMinor":0,"dispute":false,"captureDatePresent":false}');
    if r->>'applied' is distinct from 'true' then raise exception 'First confirmation did not apply'; end if;
  elsif n=2 then
    perform public.apply_culqi_payment_event('evt_test_SYNTHETICResultRace','charge.creation.succeeded',
      '{"id":"chr_test_SYNTHETICResultRace","amount":5800,"currency":"PEN"}','{}');
  elsif n in (4,5,6,7) then
    perform 1 from public.batches where id='00000000-0000-4000-8000-000000009110' for update;
    if n=4 then
      deadline:=clock_timestamp()+interval '2 seconds';
      update public.orders set payment_expires_at=deadline
        where id='00000000-0000-4000-8000-000000009111';
    elsif n=5 then
      update public.orders set payment_reconciliation_required=false,payment_reconciliation_reason='known_completed_refund'
        where id='00000000-0000-4000-8000-000000009111';
    elsif n=6 then
      update public.orders set payment_charge_attempt_id='00000000-0000-4000-8000-000000009115'
        where id='00000000-0000-4000-8000-000000009111';
    end if;
  else raise exception 'Unknown confirmation race'; end if;
  perform pg_advisory_lock(current_setting('bagelito.confirmation_signal')::bigint);
  -- Prove the second connection reached our held financial lock.
  for iteration in 1..500 loop
    perform pg_stat_clear_snapshot();
    select exists(select 1 from pg_stat_activity where application_name='bagelito_confirmation_waiter'
      and pg_backend_pid()=any(pg_blocking_pids(pid))) into blocked;
    exit when blocked;
    perform pg_sleep(.02);
  end loop;
  if not blocked then raise exception 'Confirmation waiter never reached the held lock'; end if;
  if n=4 then
    while clock_timestamp()<deadline loop perform pg_sleep(.02); end loop;
    r:=public.expire_culqi_token_session('00000000-0000-4000-8000-000000009111',
      '00000000-0000-4000-8000-000000009112');
    if r->>'reconciliationRequired' is distinct from 'true' then
      raise exception 'Unresolved expiry did not preserve charge evidence';
    end if;
    perform public.create_culqi_reservation_order('BAG-SYNTHETIC-RESULT-REPLACEMENT',gen_random_uuid(),
      '00000000-0000-4000-8000-000000009110','6-single','6 single',6,'single',
      'Synthetic','000000000','synthetic@example.invalid','Synthetic','Lince','','',false,58,
      clock_timestamp()+interval '30 minutes',true,'[{"flavor_slug":"plain","flavor_name":"Plain","quantity":6}]');
  elsif n=7 then
    -- Observation starts 29 seconds old; wait two real seconds after blocking
    -- so the freshness decision must use post-lock wall time, not now().
    perform pg_sleep(2);
  end if;
end $$;
commit;
select pg_advisory_unlock(:signal::bigint);
