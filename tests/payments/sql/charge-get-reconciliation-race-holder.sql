begin;
select set_config('bagelito.charge_get_case', :'scenario', true);
select set_config('bagelito.charge_get_signal', :'signal', true);
do $$ declare n integer:=current_setting('bagelito.charge_get_case')::integer;
  r jsonb; blocked boolean:=false; iteration integer; expiry timestamptz;
begin
  if current_database()<>'bagelito_test' or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required'; end if;
  if n=1 then
    r:=public.confirm_culqi_charge_get('00000000-0000-4000-8000-000000009011',
      '00000000-0000-4000-8000-000000009012','00000000-0000-4000-8000-000000009013',
      '00000000-0000-4000-8000-000000009014','culqi_charge_get_reviewed_net_v1',clock_timestamp(),
      '{"chargeId":"chr_test_WIu0Hn7e9r2MqEue","sourceId":"ype_test_SYNTHETICChargeGet","amountMinor":6600,"currencyCode":"PEN","capture":true,"currentAmountMinor":6600,"amountRefundedMinor":0,"dispute":false,"captureDatePresent":false}');
    if r->>'applied' is distinct from 'true' then raise exception 'First GET did not apply'; end if;
  elsif n in (2,3,4) then
    perform 1 from public.batches where id='00000000-0000-4000-8000-000000009010' for update;
    if n=2 then
      expiry:=clock_timestamp()+interval '2 seconds';
      update public.orders set payment_expires_at=expiry where id='00000000-0000-4000-8000-000000009011';
    elsif n=3 then
      update public.orders set payment_expires_at=clock_timestamp()-interval '1 minute'
        where id='00000000-0000-4000-8000-000000009011';
      perform public.expire_culqi_token_session('00000000-0000-4000-8000-000000009011','00000000-0000-4000-8000-000000009012');
      perform public.create_culqi_reservation_order('BAG-SYNTHETIC-GET-CAPACITY',gen_random_uuid(),
        '00000000-0000-4000-8000-000000009010','6-single','6 single',6,'single',
        'Synthetic','000000000','synthetic@example.invalid','Synthetic','Lince','','',false,66,
        clock_timestamp()+interval '30 minutes',true,'[{"flavor_slug":"plain","flavor_name":"Plain","quantity":6}]');
    else
      update public.orders set payment_charge_attempt_id='00000000-0000-4000-8000-000000009015',
        payment_charge_source_id='ype_test_SYNTHETICOther' where id='00000000-0000-4000-8000-000000009011';
    end if;
  else raise exception 'Unknown GET race'; end if;
  perform pg_advisory_lock(current_setting('bagelito.charge_get_signal')::bigint);
  -- Prove connection B actually blocked on connection A, rather than just
  -- relying on a timer to sequence two independent operations.
  for iteration in 1..500 loop
    perform pg_stat_clear_snapshot();
    select exists(select 1 from pg_stat_activity where application_name='bagelito_charge_get_waiter'
      and pg_backend_pid()=any(pg_blocking_pids(pid))) into blocked;
    exit when blocked;
    perform pg_sleep(.02);
  end loop;
  if not blocked then raise exception 'GET waiter never reached the held lock'; end if;
  if n=2 then
    while clock_timestamp()<expiry loop perform pg_sleep(.02); end loop;
    r:=public.expire_culqi_token_session('00000000-0000-4000-8000-000000009011','00000000-0000-4000-8000-000000009012');
    if r->>'paymentStatus' is distinct from 'pending' or r->>'reconciliationRequired' is distinct from 'true' then
      raise exception 'Expiry did not quarantine stored charge'; end if;
  end if;
end $$;
commit;
select pg_advisory_unlock(:signal::bigint);
