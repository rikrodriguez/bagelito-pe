-- Connection B waits behind the holder's actual batch/order lock, then applies
-- the competing operation without synthesizing any charge or network request.
begin;
select set_config('bagelito.expiry_race_case', :'scenario', true);
do $$
declare n integer := current_setting('bagelito.expiry_race_case')::integer;
  b uuid; o uuid; s uuid; result jsonb;
begin
  if current_database() <> 'bagelito_test'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
  b := format('00000000-0000-4000-8000-%s',lpad((8100+n*10)::text,12,'0'))::uuid;
  o := format('00000000-0000-4000-8000-%s',lpad((8101+n*10)::text,12,'0'))::uuid;
  s := format('00000000-0000-4000-8000-%s',lpad((8102+n*10)::text,12,'0'))::uuid;
  if n in (1,3,4,5) then
    result := public.expire_culqi_token_session(o,s);
    if n = 1 then
      if result->>'paymentStatus' is distinct from 'pending'
        or result->>'expired' is distinct from 'false'
        or result->>'reconciliationRequired' is distinct from 'true' then raise exception 'Expiry lost claim evidence'; end if;
    elsif n = 3 then
      if result->>'paymentStatus' is distinct from 'paid'
        or result->>'expired' is distinct from 'false'
        or result->>'reconciliationRequired' is distinct from 'false' then raise exception 'Expiry regressed verified payment'; end if;
    elsif result->>'expired' is distinct from 'true' then raise exception 'Waited expiry failed';
    end if;
    if n = 5 and transaction_timestamp() >= (select payment_expires_at from public.orders where id=o) then
      raise exception 'Clock fixture started after expiry and did not test a stale transaction clock';
    end if;
  elsif n = 2 then
    result := public.claim_culqi_charge(o,'tkn_test_expiry_after','device_fixture',false);
    if result->>'claimed' is distinct from 'false' then raise exception 'Claim reopened expired session'; end if;
  elsif n = 6 then
    perform public.create_culqi_reservation_order('BAG-EXPIRY-RACE-CAPACITY-NEW',gen_random_uuid(),
      b,'6-single','6 single',6,'single','Synthetic','000000000','synthetic@example.invalid',
      'Synthetic','Lince','','',false,66,clock_timestamp()+interval '30 minutes',true,
      '[{"flavor_slug":"plain","flavor_name":"Plain","quantity":6}]'::jsonb);
  else raise exception 'Unknown expiry race';
  end if;
end $$;
commit;
