begin;
select set_config('bagelito.status_charge_case', :'scenario', true);
select set_config('bagelito.status_charge_signal', :'signal', true);
do $$
declare n integer:=current_setting('bagelito.status_charge_case')::integer;
  result jsonb; blocked boolean:=false; iteration integer; expiry timestamptz;
begin
  if current_database()<>'bagelito_test'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
  if n=1 then
    result:=public.confirm_culqi_status_charge_get('00000000-0000-4000-8000-000000009911',
      '00000000-0000-4000-8000-000000009912','00000000-0000-4000-8000-000000009913',
      '00000000-0000-4000-8000-000000009914','culqi_charge_get_reviewed_net_v1',clock_timestamp(),
      '{"chargeId":"chr_test_SYNTHETICFuture8500","sourceId":"tkn_test_SYNTHETICFutureSource","amountMinor":8500,"currencyCode":"PEN","capture":true,"currentAmountMinor":8500,"amountRefundedMinor":0,"dispute":false,"captureDatePresent":false}');
    if result->>'applied' is distinct from 'true' then raise exception 'First status GET did not apply'; end if;
  elsif n in (2,3,4,5,6) then
    -- Preserve the real batch -> order -> attempt order in fixture mutations too.
    perform 1 from public.batches where id='00000000-0000-4000-8000-000000009910' for update;
    if n=2 then
      expiry:=clock_timestamp()+interval '2 seconds';
      update public.orders set payment_expires_at=expiry
        where id='00000000-0000-4000-8000-000000009911';
    elsif n=3 then
      update public.orders set payment_expires_at=clock_timestamp()-interval '1 minute'
        where id='00000000-0000-4000-8000-000000009911';
      perform public.expire_culqi_token_session('00000000-0000-4000-8000-000000009911',
        '00000000-0000-4000-8000-000000009912');
      perform public.create_culqi_reservation_order('BAG-FUTURE-QA-REPLACEMENT-8500',gen_random_uuid(),
        '00000000-0000-4000-8000-000000009910','6-single','6 single',6,'single',
        'Synthetic','000000000','synthetic@example.invalid','Synthetic','Lince','','',false,85,
        clock_timestamp()+interval '30 minutes',true,
        '[{"flavor_slug":"plain","flavor_name":"Plain","quantity":6}]');
    elsif n=4 then
      update public.orders set payment_charge_attempt_id='00000000-0000-4000-8000-000000009915',
        payment_charge_source_id='tkn_test_SYNTHETICFutureOther'
        where id='00000000-0000-4000-8000-000000009911';
    elsif n=5 then
      perform 1 from public.orders where id='00000000-0000-4000-8000-000000009911' for update;
      -- Extending the order's deadline cannot restore the original token hold.
      -- This change is uncommitted when the competing status lookup starts.
      update public.payment_attempts set expires_at=clock_timestamp()-interval '1 minute'
        where id='00000000-0000-4000-8000-000000009913';
    else
      -- The waiter still sees the committed, unflagged snapshot before it
      -- blocks. Only the RPC's post-lock reread can observe this new refund.
      update public.orders set payment_reconciliation_required=true,
        payment_reconciliation_reason='known_pending_refund'
        where id='00000000-0000-4000-8000-000000009911';
    end if;
  else raise exception 'Unknown status recovery race'; end if;

  perform pg_advisory_lock(current_setting('bagelito.status_charge_signal')::bigint);
  -- Prove the waiter really reached the held lock; a timer alone would allow
  -- two sequential operations to pass this as a supposed concurrency test.
  for iteration in 1..500 loop
    perform pg_stat_clear_snapshot();
    select exists(select 1 from pg_stat_activity where application_name='bagelito_status_charge_waiter'
      and pg_backend_pid()=any(pg_blocking_pids(pid))) into blocked;
    exit when blocked;
    perform pg_sleep(.02);
  end loop;
  if not blocked then raise exception 'Status GET waiter never reached the held lock'; end if;
  if n=2 then
    while clock_timestamp()<expiry loop perform pg_sleep(.02); end loop;
    result:=public.expire_culqi_token_session('00000000-0000-4000-8000-000000009911',
      '00000000-0000-4000-8000-000000009912');
    if result->>'paymentStatus' is distinct from 'pending'
      or result->>'reconciliationRequired' is distinct from 'true' then
      raise exception 'Expiry did not quarantine the persisted charge';
    end if;
  end if;
end $$;
commit;
select pg_advisory_unlock(:signal::bigint);
