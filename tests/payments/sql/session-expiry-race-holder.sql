-- Connection A obtains the relevant lock before exposing a test-only advisory
-- signal. Connection B starts only after the controller observes that signal.
begin;
select set_config('bagelito.expiry_race_case', :'scenario', true);
select set_config('bagelito.expiry_race_signal', :'signal', true);
do $$
declare n integer := current_setting('bagelito.expiry_race_case')::integer;
  b uuid; o uuid; s uuid; result jsonb;
begin
  if current_database() <> 'bagelito_test'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
  if n not between 1 and 6 then raise exception 'Unknown expiry race'; end if;
  b := format('00000000-0000-4000-8000-%s',lpad((8100+n*10)::text,12,'0'))::uuid;
  o := format('00000000-0000-4000-8000-%s',lpad((8101+n*10)::text,12,'0'))::uuid;
  s := format('00000000-0000-4000-8000-%s',lpad((8102+n*10)::text,12,'0'))::uuid;

  if n = 1 then
    -- Claim owns the order before its deadline; expiry must re-read submitting.
    update public.orders set payment_expires_at=clock_timestamp()+interval '1 second' where id=o;
    result := public.claim_culqi_charge(o,'tkn_test_expiry_race1','device_fixture',false);
    if result->>'claimed' is distinct from 'true' then raise exception 'First claim rejected'; end if;
  elsif n in (2,4,6) then
    -- Expiry wins against a later claim, duplicate expiry or capacity scan.
    update public.orders set payment_expires_at=clock_timestamp()-interval '1 second' where id=o;
    result := public.expire_culqi_token_session(o,s);
    if n = 6 then
      if result->>'paymentStatus' is distinct from 'pending'
        or result->>'reconciliationRequired' is distinct from 'true' then
        raise exception 'Charge-bearing expiry did not quarantine';
      end if;
    elsif result->>'expired' is distinct from 'true' then raise exception 'Safe expiry did not win';
    end if;
  elsif n = 3 then
    -- Verified payment starts before expiry and owns batch -> order until commit.
    perform 1 from public.batches where id=b for update;
    update public.orders set payment_expires_at=clock_timestamp()+interval '1 second' where id=o;
    perform public.apply_culqi_payment_event('evt_test_expiry_race3','charge.creation.succeeded',
      '{"id":"chr_test_expiry_race3","amount":6600,"currency":"PEN","source":{"id":"tkn_test_expiry_race3"}}','{}');
  elsif n = 5 then
    -- The waiter's transaction clock precedes expiry; wall time after both
    -- locks must be used even when no charge was initiated.
    perform 1 from public.batches where id=b for update;
    update public.orders set payment_expires_at=clock_timestamp()+interval '1 second' where id=o;
  end if;
  perform pg_advisory_lock(current_setting('bagelito.expiry_race_signal')::bigint);
  perform pg_sleep(2);
end $$;
commit;
select pg_advisory_unlock(:signal::bigint);
