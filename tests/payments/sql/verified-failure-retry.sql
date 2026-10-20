-- Synthetic isolated PostgreSQL only. A new accepted charge must not expose the
-- previous verified failure to status recovery while that charge is unresolved.
begin;
do $$ begin
  if current_database() not like '%test%'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
end $$;

create function public.fixture_retry_fail_history() returns trigger language plpgsql as $$
begin
  if current_setting('bagelito.retry_force_history_failure',true)='on' then
    raise exception 'intentional retry history failure';
  end if;
  return new;
end $$;
create trigger fixture_retry_history_failure before insert on public.order_status_history
  for each row execute function public.fixture_retry_fail_history();

do $$
declare
  b uuid; o uuid; session_id uuid; claim jsonb; retry jsonb; prepared jsonb; reported jsonb;
  old_attempt uuid; token_attempt uuid; prior_state text; suffix text;
  before_history bigint; original_expiry timestamptz; order_before jsonb; attempt_before jsonb;
begin
  insert into public.batches(name,status) values('VERIFIED FAILURE RETRY','orders_open') returning id into b;
  foreach prior_state in array array['submitting','requires_3ds','uncertain'] loop
    suffix := replace(prior_state,'_','');
    session_id := gen_random_uuid();
    original_expiry := clock_timestamp()+interval '30 minutes';
    insert into public.orders(batch_id,checkout_session_id,order_code,pack_slug,pack_name,pack_units,pack_type,
      customer_name,whatsapp,email,delivery_address,district,total_amount,
      payment_provider,payment_status,payment_lane,payment_amount_minor,payment_currency,payment_expires_at,status)
    values(b,session_id,'BAG-VERIFIED-RETRY-'||upper(suffix),'6-single','6 single',6,'single',
      'Synthetic','000000000','synthetic@example.invalid','Synthetic','Lince',58,
      'culqi','pending','token',5800,'PEN',original_expiry,'payment_pending_review') returning id into o;
    prepared := public.prepare_culqi_token_session(o);
    token_attempt := (prepared->>'sessionId')::uuid;
    claim := public.claim_culqi_charge(o,'tkn_test_oldRetry'||suffix,'device_synthetic',false);
    old_attempt := (claim->>'attempt_id')::uuid;
    if prior_state <> 'submitting' then
      perform public.finish_culqi_charge(o,old_attempt,prior_state,null,'card','{}');
    end if;
    perform public.apply_culqi_payment_event('evt_test_retryFailure'||suffix,'charge.creation.failed',
      jsonb_build_object('id','chr_test_oldRetry'||suffix,'amount',5800,'currency','PEN',
        'metadata',jsonb_build_object('bagelito_order_code','BAG-VERIFIED-RETRY-'||upper(suffix)),
        'source',jsonb_build_object('id','tkn_test_oldRetry'||suffix),
        'outcome',jsonb_build_object('decline_code','synthetic_decline','user_message','Synthetic failure')),
      jsonb_build_object('synthetic',true,'originalFailure',suffix));
    -- This is the same preparation boundary used by POST /order. The local
    -- token session and original reservation deadline remain reusable.
    prepared := public.prepare_culqi_token_session(o);
    if (prepared->>'sessionId')::uuid is distinct from token_attempt
      or (prepared->>'expiresAt')::timestamptz is distinct from original_expiry then
      raise exception 'Retry preparation changed session or deadline';
    end if;
    -- A new claim must use a distinct source so old failure events cannot
    -- describe both attempts. Rejected reuse preserves all current evidence.
    select to_jsonb(r) into order_before from public.orders r where id=o;
    select to_jsonb(a) into attempt_before from public.payment_attempts a where id=token_attempt;
    claim := public.claim_culqi_charge(o,'tkn_test_oldRetry'||suffix,'device_synthetic',false);
    if claim->>'claimed' is distinct from 'false'
      or order_before is distinct from (select to_jsonb(r) from public.orders r where id=o)
      or attempt_before is distinct from (select to_jsonb(a) from public.payment_attempts a where id=token_attempt) then
      raise exception 'Verified failure reused a previously failed source';
    end if;
    -- History failure must roll back the new claim and both pending resets.
    perform set_config('bagelito.retry_force_history_failure','on',true);
    begin
      perform public.claim_culqi_charge(o,'tkn_test_newRetry'||suffix,'device_synthetic',false);
      raise exception 'Retry ignored history failure' using errcode='Z0001';
    exception when sqlstate 'Z0001' then raise;
      when others then if sqlerrm<>'intentional retry history failure' then raise; end if;
    end;
    perform set_config('bagelito.retry_force_history_failure','off',true);
    if order_before is distinct from (select to_jsonb(r) from public.orders r where id=o)
      or attempt_before is distinct from (select to_jsonb(a) from public.payment_attempts a where id=token_attempt) then
      raise exception 'History failure left a partial retry claim';
    end if;
    select count(*) into before_history from public.order_status_history where order_id=o;
    retry := public.claim_culqi_charge(o,'tkn_test_newRetry'||suffix,'device_synthetic',false);
    if retry->>'claimed' is distinct from 'true' or (retry->>'attempt_id')::uuid=old_attempt then
      raise exception 'Verified failure did not allow a distinct retry';
    end if;
    reported := public.expire_culqi_token_session(o,session_id);
    if reported->>'paymentStatus' is distinct from 'pending'
      or reported->>'orderStatus' is distinct from 'payment_pending_review'
      or reported->>'reconciliationRequired' is distinct from 'false' then
      raise exception 'Active retry incorrectly exposed previous failure: %',reported;
    end if;
    if not exists(select 1 from public.payment_attempts where id=token_attempt and status='pending'
      and provider_charge_id is null and paid_at is null and expires_at=original_expiry)
      or exists(select 1 from public.orders where id=o
        and (payment_charge_id is not null or payment_failure_code is not null or payment_failure_message is not null
          or payment_expires_at is distinct from original_expiry)) then
      raise exception 'Accepted retry retained a terminal financial identity';
    end if;
    if (select count(*) from public.order_status_history where order_id=o)<>before_history+1
      or not exists(select 1 from public.order_status_history where order_id=o
        and old_status='needs_correction' and new_status='payment_pending_review') then
      raise exception 'Retry state transition was not recorded once';
    end if;
    if not exists(select 1 from public.payment_webhook_events
      where provider_event_id='evt_test_retryFailure'||suffix and processed_at is not null
      and payload=jsonb_build_object('synthetic',true,'originalFailure',suffix)) then
      raise exception 'Retry discarded the verified failure audit evidence';
    end if;
    -- A stale finish cannot close the new claim. Neither a duplicate marker nor
    -- a different old-source failure may mutate its current pending state.
    select to_jsonb(r) into order_before from public.orders r where id=o;
    select to_jsonb(a) into attempt_before from public.payment_attempts a where id=token_attempt;
    begin
      perform public.finish_culqi_charge(o,old_attempt,'uncertain',null,'card','{}');
      raise exception 'Old finish accepted after retry' using errcode='Z0001';
    exception when sqlstate 'Z0001' then raise;
      when others then if sqlerrm<>'Stale charge attempt' then raise; end if;
    end;
    perform public.apply_culqi_payment_event('evt_test_retryFailure'||suffix,'charge.creation.failed',
      jsonb_build_object('id','chr_test_oldRetry'||suffix),'{}');
    begin
      perform public.apply_culqi_payment_event('evt_test_retryDelayed'||suffix,'charge.creation.failed',
        jsonb_build_object('id','chr_test_oldRetry'||suffix,'amount',5800,'currency','PEN',
          'metadata',jsonb_build_object('bagelito_order_code','BAG-VERIFIED-RETRY-'||upper(suffix)),
          'source',jsonb_build_object('id','tkn_test_oldRetry'||suffix)),'{}');
      raise exception 'Old source failure accepted after retry' using errcode='Z0001';
    exception when sqlstate 'Z0001' then raise;
      when others then if sqlerrm<>'Charge source does not match the claimed attempt' then raise; end if;
    end;
    if order_before is distinct from (select to_jsonb(r) from public.orders r where id=o)
      or attempt_before is distinct from (select to_jsonb(a) from public.payment_attempts a where id=token_attempt)
      or exists(select 1 from public.payment_webhook_events where provider_event_id='evt_test_retryDelayed'||suffix) then
      raise exception 'Old charge effects changed the active retry';
    end if;
    perform public.finish_culqi_charge(o,(retry->>'attempt_id')::uuid,'submitted','chr_test_newRetry'||suffix,'card','{}');
    reported := public.expire_culqi_token_session(o,session_id);
    if reported->>'paymentStatus' is distinct from 'pending'
      or reported->>'orderStatus' is distinct from 'payment_pending_review'
      or reported->>'reconciliationRequired' is distinct from 'false'
      or not exists(select 1 from public.payment_attempts where id=token_attempt
        and status='pending' and provider_charge_id='chr_test_newRetry'||suffix) then
      raise exception 'Submitted retry is not eligible for lost-webhook recovery: %',reported;
    end if;
    -- An unresolved submitted result remains closed to another source.
    select to_jsonb(r) into order_before from public.orders r where id=o;
    claim := public.claim_culqi_charge(o,'tkn_test_forbiddenRetry','device_synthetic',false);
    if claim->>'claimed' is distinct from 'false'
      or order_before is distinct from (select to_jsonb(r) from public.orders r where id=o) then
      raise exception 'Submitted retry was reopened';
    end if;
  end loop;
end $$;

do $$
declare
  b uuid; o uuid; s uuid; claim jsonb; variant text; suffix text; original jsonb; original_attempt jsonb;
begin
  insert into public.batches(name,status) values('VERIFIED RETRY GUARDS','orders_open') returning id into b;
  foreach variant in array array['uncertain','review','paid','expired','missing_marker','paid_attempt','wrong_status'] loop
    suffix := replace(variant,'_','');
    s:=gen_random_uuid();
    insert into public.orders(batch_id,checkout_session_id,order_code,pack_slug,pack_name,pack_units,pack_type,
      customer_name,whatsapp,email,delivery_address,district,total_amount,
      payment_provider,payment_status,payment_lane,payment_amount_minor,payment_currency,payment_expires_at,status)
    values(b,s,'BAG-RETRY-GUARD-'||upper(suffix),'6-single','6 single',6,'single',
      'Synthetic','000000000','synthetic@example.invalid','Synthetic','Lince',58,
      'culqi','pending','token',5800,'PEN',clock_timestamp()+interval '30 minutes','payment_pending_review') returning id into o;
    perform public.prepare_culqi_token_session(o);
    perform public.claim_culqi_charge(o,'tkn_test_guardOld'||suffix,'device_synthetic',false);
    perform public.apply_culqi_payment_event('evt_test_guardFailure'||suffix,'charge.creation.failed',
      jsonb_build_object('id','chr_test_guardOld'||suffix,'amount',5800,'currency','PEN',
        'metadata',jsonb_build_object('bagelito_order_code','BAG-RETRY-GUARD-'||upper(suffix)),
        'source',jsonb_build_object('id','tkn_test_guardOld'||suffix)),'{}');
    case variant
      when 'uncertain' then update public.orders set payment_charge_state='uncertain' where id=o;
      when 'review' then update public.orders set payment_reconciliation_required=true,
        payment_reconciliation_reason='charge_result_uncertain' where id=o;
      when 'paid' then update public.orders set payment_status='paid',payment_paid_at=clock_timestamp() where id=o;
      when 'expired' then update public.orders set payment_expires_at=clock_timestamp()-interval '1 second' where id=o;
      when 'missing_marker' then delete from public.payment_webhook_events where provider_event_id='evt_test_guardFailure'||suffix;
      when 'paid_attempt' then update public.payment_attempts set status='paid',paid_at=clock_timestamp() where order_id=o;
      when 'wrong_status' then update public.orders set status='in_production' where id=o;
    end case;
    select to_jsonb(r) into original from public.orders r where id=o;
    select to_jsonb(a) into original_attempt from public.payment_attempts a where order_id=o;
    claim:=public.claim_culqi_charge(o,'tkn_test_guardNew'||suffix,'device_synthetic',false);
    if claim->>'claimed' is distinct from 'false'
      or original is distinct from (select to_jsonb(r) from public.orders r where id=o)
      or original_attempt is distinct from (select to_jsonb(a) from public.payment_attempts a where order_id=o) then
      raise exception 'Retry changed a blocked % case',variant;
    end if;
  end loop;
end $$;
rollback;
