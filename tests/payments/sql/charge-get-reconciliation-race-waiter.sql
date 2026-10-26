begin;
select set_config('bagelito.charge_get_case', :'scenario', true);
do $$ declare n integer:=current_setting('bagelito.charge_get_case')::integer; r jsonb;
begin
  if current_database()<>'bagelito_test' or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required'; end if;
  begin
    r:=public.confirm_culqi_charge_get('00000000-0000-4000-8000-000000009011',
      '00000000-0000-4000-8000-000000009012','00000000-0000-4000-8000-000000009013',
      '00000000-0000-4000-8000-000000009014','culqi_charge_get_reviewed_net_v1',clock_timestamp(),
      '{"chargeId":"chr_test_WIu0Hn7e9r2MqEue","sourceId":"ype_test_SYNTHETICChargeGet","amountMinor":6600,"currencyCode":"PEN","capture":true,"currentAmountMinor":6600,"amountRefundedMinor":0,"dispute":false,"captureDatePresent":true}');
    if n=4 then raise exception 'Stale GET snapshot passed' using errcode='Z0001'; end if;
  exception when sqlstate 'Z0001' then raise;
    when others then
      if n<>4 or sqlerrm<>'Charge GET binding mismatch' then raise; end if;
      return;
  end;
  if n=1 then
    if r->>'applied' is distinct from 'false' or r->>'duplicate' is distinct from 'true' then
      raise exception 'Second GET was not duplicate'; end if;
  elsif n in (2,3) then
    if r->>'applied' is distinct from 'true' or r->>'orderState' is distinct from 'cancelled'
      or r->>'requiresReview' is distinct from 'true' then raise exception 'Late GET reclaimed expired capacity'; end if;
    if n=2 and transaction_timestamp()>=(select payment_expires_at from public.orders
      where id='00000000-0000-4000-8000-000000009011') then
      raise exception 'GET wall-clock fixture did not start before deadline'; end if;
  else raise exception 'Unknown GET race'; end if;
end $$;
commit;
