begin;
select set_config('bagelito.confirmation_case', :'scenario', true);
do $$ declare n integer:=current_setting('bagelito.confirmation_case')::integer; r jsonb;
begin
  if current_database()<>'bagelito_test' or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
  if n=3 then
    perform public.apply_culqi_payment_event('evt_test_SYNTHETICResultRace','charge.creation.succeeded',
      '{"id":"chr_test_SYNTHETICResultRace","amount":5800,"currency":"PEN"}','{}');
  elsif n in (6,7) then
    begin
      perform public.confirm_culqi_charge_result('00000000-0000-4000-8000-000000009111',
        '00000000-0000-4000-8000-000000009112','00000000-0000-4000-8000-000000009114',
        clock_timestamp()-case when n=7 then interval '29 seconds' else interval '0 seconds' end,
        'culqi_charge_get','test',
        '{"chargeId":"chr_test_SYNTHETICResultRace","sourceId":"tkn_test_SYNTHETICResultRace","amountMinor":5800,"currencyCode":"PEN","capture":true,"currentAmountMinor":5800,"amountRefundedMinor":0,"dispute":false,"captureDatePresent":false}');
      raise exception 'Stale confirmation was accepted' using errcode='Z0001';
    exception when sqlstate 'Z0001' then raise;
      when others then if sqlerrm is distinct from
        (case when n=6 then 'Charge confirmation binding mismatch' else 'Invalid charge confirmation evidence' end) then raise; end if;
    end;
  else
    r:=public.confirm_culqi_charge_result('00000000-0000-4000-8000-000000009111',
      '00000000-0000-4000-8000-000000009112','00000000-0000-4000-8000-000000009114',
      clock_timestamp(),'culqi_charge_get','test',
      '{"chargeId":"chr_test_SYNTHETICResultRace","sourceId":"tkn_test_SYNTHETICResultRace","amountMinor":5800,"currencyCode":"PEN","capture":true,"currentAmountMinor":5800,"amountRefundedMinor":0,"dispute":false,"captureDatePresent":false}');
    if n=1 and (r->>'duplicate' is distinct from 'true' or r->>'applied' is distinct from 'false') then
      raise exception 'Concurrent duplicate applied twice';
    elsif n=2 and (r->>'alreadyPaid' is distinct from 'true' or r->>'applied' is distinct from 'false') then
      raise exception 'Webhook-first confirmation repeated financial transition';
    elsif n=4 and (r->>'paymentState' is distinct from 'paid' or r->>'orderState' is distinct from 'cancelled'
      or r->>'requiresReview' is distinct from 'true') then
      raise exception 'Late confirmation reclaimed released capacity';
    elsif n=5 and (r->>'applied' is distinct from 'false' or r->>'requiresReview' is distinct from 'true') then
      raise exception 'Concurrent refund was ignored';
    end if;
  end if;
end $$;
commit;
