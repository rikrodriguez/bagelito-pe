begin;
select set_config('bagelito.status_charge_case', :'scenario', true);
do $$
declare n integer:=current_setting('bagelito.status_charge_case')::integer; result jsonb;
begin
  if current_database()<>'bagelito_test'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
  if n=6 and not exists(select 1 from public.orders
    where id='00000000-0000-4000-8000-000000009911'
      and payment_status='pending' and not payment_reconciliation_required
      and payment_reconciliation_reason is null) then
    raise exception 'Refund race did not start from an unflagged client snapshot';
  end if;
  begin
    result:=public.confirm_culqi_status_charge_get('00000000-0000-4000-8000-000000009911',
      '00000000-0000-4000-8000-000000009912','00000000-0000-4000-8000-000000009913',
      '00000000-0000-4000-8000-000000009914','culqi_charge_get_reviewed_net_v1',clock_timestamp(),
      '{"chargeId":"chr_test_SYNTHETICFuture8500","sourceId":"tkn_test_SYNTHETICFutureSource","amountMinor":8500,"currencyCode":"PEN","capture":true,"currentAmountMinor":8500,"amountRefundedMinor":0,"dispute":false,"captureDatePresent":true}');
    if n=4 then raise exception 'Stale status GET snapshot passed' using errcode='Z0001'; end if;
  exception when sqlstate 'Z0001' then raise;
    when others then
      if n<>4 or sqlerrm<>'Status charge GET binding mismatch' then raise; end if;
      return;
  end;
  if n=1 then
    if result->>'applied' is distinct from 'false' or result->>'duplicate' is distinct from 'true'
      or result->>'alreadyPaid' is distinct from 'true' or result->>'paymentState' is distinct from 'paid' then
      raise exception 'Second status GET was not an already-paid duplicate';
    end if;
  elsif n=6 then
    if result is distinct from '{"applied":false,"duplicate":false,"alreadyPaid":false,"requiresReview":true,"paymentState":"pending","orderState":"payment_pending_review"}'::jsonb then
      raise exception 'Status GET did not honor the refund persisted after the client snapshot';
    end if;
  elsif n in (2,3,5) then
    if result->>'applied' is distinct from 'true' or result->>'orderState' is distinct from 'cancelled'
      or result->>'requiresReview' is distinct from 'true' or result->>'paymentState' is distinct from 'paid' then
      raise exception 'Status GET reclaimed released capacity';
    end if;
    if n=2 and transaction_timestamp()>=(select payment_expires_at from public.orders
      where id='00000000-0000-4000-8000-000000009911') then
      raise exception 'Status GET wall-clock fixture did not start before the deadline';
    end if;
    if n=5 and ((select payment_expires_at from public.orders
        where id='00000000-0000-4000-8000-000000009911')<=clock_timestamp()
      or (select expires_at from public.payment_attempts
        where id='00000000-0000-4000-8000-000000009913')>transaction_timestamp()) then
      raise exception 'Original attempt deadline fixture did not isolate the expired token hold';
    end if;
  else raise exception 'Unknown status recovery race'; end if;
end $$;
commit;
