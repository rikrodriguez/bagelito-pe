-- Isolated PostgreSQL only. Load add-culqi-session-expiry.sql after
-- add-checkout-safety.sql before running this synthetic regression fixture.
-- All fixture data, temporary helpers, triggers and DDL are rolled back.
begin;
do $$ begin
  if current_database() not like '%test%'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
  if to_regprocedure('public.expire_culqi_token_session(uuid,uuid)') is null then
    raise exception 'Session expiry migration must be installed in the isolated fixture';
  end if;
  if has_function_privilege('anon','public.expire_culqi_token_session(uuid,uuid)','execute')
    or has_function_privilege('authenticated','public.expire_culqi_token_session(uuid,uuid)','execute')
    or not has_function_privilege('service_role','public.expire_culqi_token_session(uuid,uuid)','execute') then
    raise exception 'Session expiry RPC is not restricted to service_role';
  end if;
end $$;

create temporary table session_expiry_fixture_batch(id uuid primary key);
create temporary table session_expiry_fixture_orders(
  case_name text primary key, id uuid not null, checkout_session_id uuid not null
);
with fixture as (
  insert into public.batches(name,status) values('SYNTHETIC SESSION EXPIRY','orders_open') returning id
) insert into session_expiry_fixture_batch select id from fixture;

create function pg_temp.seed_session_expiry(p_case text,p_with_attempt boolean default true)
returns uuid language plpgsql as $$
declare fixture_order_id uuid; session_id uuid := gen_random_uuid();
begin
  insert into public.orders(batch_id,checkout_session_id,order_code,pack_slug,pack_name,
    pack_units,pack_type,customer_name,whatsapp,email,delivery_address,district,total_amount,
    payment_provider,payment_status,payment_lane,payment_amount_minor,payment_currency,
    payment_expires_at,status)
  values((select id from session_expiry_fixture_batch),session_id,'BAG-EXPIRY-'||upper(p_case),
    '6-single','6 single',6,'single','Synthetic','000000000','synthetic@example.invalid',
    'Synthetic','Lince',58,'culqi','pending','token',5800,'PEN',
    clock_timestamp()+interval '30 minutes','payment_pending_review') returning id into fixture_order_id;
  if p_with_attempt then perform public.prepare_culqi_token_session(fixture_order_id); end if;
  update public.orders set payment_expires_at=clock_timestamp()-interval '1 minute' where id=fixture_order_id;
  update public.payment_attempts set expires_at=(select payment_expires_at from public.orders where id=fixture_order_id)
    where order_id=fixture_order_id;
  insert into session_expiry_fixture_orders values(p_case,fixture_order_id,session_id);
  return fixture_order_id;
end $$;

create function pg_temp.session_expiry_snapshot(p_order_id uuid)
returns jsonb language sql as $$
  select jsonb_build_object(
    'order',(select to_jsonb(o)-'updated_at' from public.orders o where id=p_order_id),
    'attempts',(select coalesce(jsonb_agg(to_jsonb(a)-'updated_at' order by a.id),'[]'::jsonb)
      from public.payment_attempts a where a.order_id=p_order_id),
    'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.id),'[]'::jsonb)
      from public.order_status_history h where h.order_id=p_order_id)
  );
$$;

create function pg_temp.assert_session_expiry_contract(p_order_id uuid,p_result jsonb)
returns void language plpgsql as $$
declare o public.orders%rowtype; expected jsonb;
begin
  select * into o from public.orders where id=p_order_id;
  expected := jsonb_build_object('paymentStatus',o.payment_status,'orderStatus',o.status,
    'reconciliationRequired',o.payment_reconciliation_required,'expired',o.payment_status='expired');
  if p_result is distinct from expected then
    raise exception 'Session expiry result did not return exactly the current locked state';
  end if;
end $$;

create function pg_temp.assert_session_expiry_quarantine(p_order_id uuid,p_before jsonb)
returns void language plpgsql as $$
declare result jsonb; after_snapshot jsonb; session_id uuid;
begin
  select checkout_session_id into session_id from public.orders where id=p_order_id;
  result := public.expire_culqi_token_session(p_order_id,session_id);
  perform pg_temp.assert_session_expiry_contract(p_order_id,result);
  after_snapshot := pg_temp.session_expiry_snapshot(p_order_id);
  if result->>'paymentStatus' is distinct from 'pending'
    or result->>'reconciliationRequired' is distinct from 'true'
    or result->>'expired' is distinct from 'false' then
    raise exception 'An unresolved payment was expired instead of quarantined';
  end if;
  if ((after_snapshot->'order')-array['payment_reconciliation_required','payment_reconciliation_reason'])
      is distinct from ((p_before->'order')-array['payment_reconciliation_required','payment_reconciliation_reason'])
    or after_snapshot->'attempts' is distinct from p_before->'attempts'
    or after_snapshot->'history' is distinct from p_before->'history' then
    raise exception 'Quarantine changed a status, charge claim, payment attempt or history';
  end if;
  if coalesce(after_snapshot->'order'->>'payment_reconciliation_reason','') = '' then
    raise exception 'Quarantine did not retain a review reason';
  end if;
  if p_before->'order'->>'payment_reconciliation_reason' is not null
    and after_snapshot->'order'->>'payment_reconciliation_reason'
      is distinct from p_before->'order'->>'payment_reconciliation_reason' then
    raise exception 'Quarantine replaced an existing review reason';
  end if;
  result := public.claim_culqi_charge(p_order_id,'tkn_test_expiryfresh123','device_synthetic',false);
  if result->>'claimed' is distinct from 'false' then
    raise exception 'Quarantine allowed a fresh charge claim';
  end if;
  if pg_temp.session_expiry_snapshot(p_order_id) is distinct from after_snapshot then
    raise exception 'A blocked charge claim changed quarantined state';
  end if;
end $$;

-- A missing/null/wrong ownership capability returns SQL NULL with no mutation.
do $$
declare o uuid; session_id uuid; before_snapshot jsonb; result jsonb;
begin
  o := pg_temp.seed_session_expiry('ownership');
  select checkout_session_id into session_id from public.orders where id=o;
  before_snapshot := pg_temp.session_expiry_snapshot(o);
  if public.expire_culqi_token_session(null,session_id) is not null
    or public.expire_culqi_token_session(gen_random_uuid(),session_id) is not null
    or public.expire_culqi_token_session(o,null) is not null
    or public.expire_culqi_token_session(o,gen_random_uuid()) is not null then
    raise exception 'Missing or mismatched ownership did not return SQL NULL';
  end if;
  if pg_temp.session_expiry_snapshot(o) is distinct from before_snapshot then
    raise exception 'Missing or mismatched ownership mutated a reservation';
  end if;
  update public.orders set checkout_session_id=null where id=o;
  before_snapshot := pg_temp.session_expiry_snapshot(o);
  result := public.expire_culqi_token_session(o,null);
  if result is not null or pg_temp.session_expiry_snapshot(o) is distinct from before_snapshot then
    raise exception 'Two null session IDs were treated as a valid capability';
  end if;
end $$;

-- Only pending Culqi token reservations with an elapsed expiry are candidates.
do $$
declare case_name text; o uuid; session_id uuid; before_snapshot jsonb; result jsonb;
begin
  foreach case_name in array array['paid','failed','expired','refunded','future','null-expiry',
      'legacy','manual','alternative-order'] loop
    o := pg_temp.seed_session_expiry('unchanged-'||case_name);
    case case_name
      when 'paid' then update public.orders set payment_status='paid' where id=o;
      when 'failed' then update public.orders set payment_status='failed' where id=o;
      when 'expired' then update public.orders set payment_status='expired' where id=o;
      when 'refunded' then update public.orders set payment_status='refunded' where id=o;
      when 'future' then update public.orders set payment_expires_at=clock_timestamp()+interval '1 hour' where id=o;
      when 'null-expiry' then update public.orders set payment_expires_at=null where id=o;
      when 'legacy' then update public.orders set payment_lane='legacy' where id=o;
      when 'manual' then update public.orders set payment_provider='manual' where id=o;
      when 'alternative-order' then update public.orders set payment_order_id='ord_test_sessionexpiry_'||o::text where id=o;
    end case;
    select checkout_session_id into session_id from public.orders where id=o;
    before_snapshot := pg_temp.session_expiry_snapshot(o);
    result := public.expire_culqi_token_session(o,session_id);
    perform pg_temp.assert_session_expiry_contract(o,result);
    if pg_temp.session_expiry_snapshot(o) is distinct from before_snapshot then
      raise exception 'An ineligible % reservation changed',case_name;
    end if;
  end loop;
end $$;

-- In-flight states, residual identities and conflicting attempt records retain
-- every claim/status/attempt field and add only the review flag/reason.
do $$
declare case_name text; o uuid; before_snapshot jsonb;
begin
  foreach case_name in array array['submitting','requires_3ds','submitted','uncertain',
      'claim-id','source-only','device-only','charge-id','preparation-claim','existing-review',
      'existing-review-without-reason','existing-reason','attempt-order-id','extra-attempt',
      'attempt-charge-id','attempt-paid-at',
      'attempt-paid','attempt-failed','attempt-refunded','payment_confirmed',
      'in_production','ready_for_delivery','delivered'] loop
    o := pg_temp.seed_session_expiry('quarantine-'||case_name);
    case case_name
      when 'submitting','requires_3ds','submitted','uncertain' then
        update public.orders set payment_charge_state=case_name,
          payment_charge_attempt_id=gen_random_uuid(),payment_charge_source_id='tkn_test_sessionexpiry123',
          payment_charge_device_id='device_synthetic' where id=o;
      when 'claim-id' then update public.orders set payment_charge_attempt_id=gen_random_uuid() where id=o;
      when 'source-only' then update public.orders set payment_charge_source_id='tkn_test_sessionexpiry123' where id=o;
      when 'device-only' then update public.orders set payment_charge_device_id='device_synthetic' where id=o;
      when 'charge-id' then update public.orders set payment_charge_id='chr_test_sessionexpiry_'||o::text where id=o;
      when 'preparation-claim' then update public.orders set payment_preparation_claimed=true where id=o;
      when 'existing-review' then update public.orders set payment_reconciliation_required=true,
        payment_reconciliation_reason='existing_synthetic_review' where id=o;
      when 'existing-review-without-reason' then update public.orders set payment_reconciliation_required=true where id=o;
      when 'existing-reason' then update public.orders set payment_reconciliation_reason='existing_synthetic_review' where id=o;
      when 'attempt-order-id' then update public.payment_attempts set provider_order_id='ord_test_attempt_'||o::text where order_id=o;
      when 'extra-attempt' then insert into public.payment_attempts(order_id,provider,provider_order_id,amount_minor,currency_code)
        values(o,'culqi','ord_test_extra_'||o::text,5800,'PEN');
      when 'attempt-charge-id' then update public.payment_attempts set provider_charge_id='chr_test_attempt_'||o::text where order_id=o;
      when 'attempt-paid-at' then update public.payment_attempts set paid_at=clock_timestamp() where order_id=o;
      when 'attempt-paid' then update public.payment_attempts set status='paid' where order_id=o;
      when 'attempt-failed' then update public.payment_attempts set status='failed' where order_id=o;
      when 'attempt-refunded' then update public.payment_attempts set status='refunded' where order_id=o;
      when 'payment_confirmed','in_production','ready_for_delivery','delivered' then
        update public.orders set status=case_name where id=o;
    end case;
    before_snapshot := pg_temp.session_expiry_snapshot(o);
    perform pg_temp.assert_session_expiry_quarantine(o,before_snapshot);
  end loop;
end $$;

-- Malformed state fails closed even if an older schema omitted the check.
alter table public.orders drop constraint orders_culqi_charge_state_check;
do $$ declare o uuid;
begin
  o := pg_temp.seed_session_expiry('unknown-state');
  update public.orders set payment_charge_state='unknown_synthetic_state' where id=o;
  perform pg_temp.assert_session_expiry_quarantine(o,pg_temp.session_expiry_snapshot(o));
  update public.orders set payment_charge_state='idle' where id=o;
end $$;
alter table public.orders add constraint orders_culqi_charge_state_check
  check(payment_charge_state in ('idle','submitting','requires_3ds','submitted','uncertain'));

-- Idle safe holds expire together with their pending attempt and one history
-- entry. An already expired attempt and a missing attempt are also safe.
do $$
declare case_name text; o uuid; session_id uuid; result jsonb; before_snapshot jsonb;
  after_snapshot jsonb; prior_order_status text; before_history bigint; expected_history bigint;
begin
  foreach case_name in array array['safe','needs-correction','already-cancelled','expired-attempt','no-attempt'] loop
    o := pg_temp.seed_session_expiry(case_name,case_name<>'no-attempt');
    if case_name='needs-correction' then update public.orders set status='needs_correction' where id=o; end if;
    if case_name='already-cancelled' then update public.orders set status='cancelled' where id=o; end if;
    if case_name='expired-attempt' then update public.payment_attempts set status='expired' where order_id=o; end if;
    select checkout_session_id,status into session_id,prior_order_status from public.orders where id=o;
    before_snapshot := pg_temp.session_expiry_snapshot(o);
    select count(*) into before_history from public.order_status_history where order_id=o;
    result := public.expire_culqi_token_session(o,session_id);
    perform pg_temp.assert_session_expiry_contract(o,result);
    after_snapshot := pg_temp.session_expiry_snapshot(o);
    if result is distinct from jsonb_build_object('paymentStatus','expired','orderStatus','cancelled',
        'reconciliationRequired',false,'expired',true) then
      raise exception 'Safe % hold did not expire/cancel',case_name;
    end if;
    if ((after_snapshot->'order')-array['payment_status','status'])
        is distinct from ((before_snapshot->'order')-array['payment_status','status']) then
      raise exception 'Safe expiry changed an unrelated order field';
    end if;
    if exists(select 1 from public.payment_attempts where order_id=o and status<>'expired')
      or (select coalesce(jsonb_agg(to_jsonb(a)-array['updated_at','status'] order by a.id),'[]'::jsonb)
          from public.payment_attempts a where order_id=o)
        is distinct from (select coalesce(jsonb_agg(value-'status'),'[]'::jsonb)
          from jsonb_array_elements(before_snapshot->'attempts')) then
      raise exception 'Safe expiry did not change only the attempt status';
    end if;
    expected_history := before_history+case when prior_order_status='cancelled' then 0 else 1 end;
    if (select count(*) from public.order_status_history where order_id=o) <> expected_history
      or (prior_order_status<>'cancelled' and not exists(select 1 from public.order_status_history
        where order_id=o and old_status=prior_order_status and new_status='cancelled')) then
      raise exception 'Expiry history does not match the locked old status';
    end if;
    result := public.expire_culqi_token_session(o,session_id);
    perform pg_temp.assert_session_expiry_contract(o,result);
    if pg_temp.session_expiry_snapshot(o) is distinct from after_snapshot then
      raise exception 'Repeated expiry was not idempotent';
    end if;
    result := public.claim_culqi_charge(o,'tkn_test_expiryfresh123','device_synthetic',false);
    if result->>'claimed' is distinct from 'false' then raise exception 'Expired hold allowed a new charge'; end if;
  end loop;
end $$;

create function pg_temp.reject_session_expiry_history() returns trigger language plpgsql as $$
begin
  if current_setting('bagelito.force_session_expiry_history_failure',true)='on' then
    raise exception 'intentional session expiry history failure';
  end if;
  return new;
end $$;
create trigger session_expiry_history_failure before insert on public.order_status_history
for each row execute function pg_temp.reject_session_expiry_history();

-- A history failure rolls back both the order and its attempt, with no marker.
do $$
declare o uuid; session_id uuid; before_snapshot jsonb;
begin
  o := pg_temp.seed_session_expiry('history-rollback');
  select checkout_session_id into session_id from public.orders where id=o;
  before_snapshot := pg_temp.session_expiry_snapshot(o);
  perform set_config('bagelito.force_session_expiry_history_failure','on',true);
  begin
    perform public.expire_culqi_token_session(o,session_id);
    raise exception 'History failure did not abort expiry' using errcode='Z0001';
  exception when sqlstate 'Z0001' then raise;
    when others then
      if sqlerrm<>'intentional session expiry history failure' then raise; end if;
  end;
  perform set_config('bagelito.force_session_expiry_history_failure','off',true);
  if pg_temp.session_expiry_snapshot(o) is distinct from before_snapshot then
    raise exception 'Partial expiry effects survived a history failure';
  end if;
end $$;

-- A synthetic claim and finish before expiry provide the authentic local charge
-- identity. Expiry quarantines it; a verified late event cancels without
-- reclaiming capacity. No provider is invoked and no real charge is created.
do $$
declare o uuid; session_id uuid; result jsonb; claimed jsonb;
begin
  o := pg_temp.seed_session_expiry('late-paid');
  select checkout_session_id into session_id from public.orders where id=o;
  update public.orders set payment_expires_at=clock_timestamp()+interval '30 minutes' where id=o;
  claimed := public.claim_culqi_charge(o,'tkn_test_sessionexpirylate','device_synthetic',false);
  if claimed->>'claimed' is distinct from 'true' then raise exception 'Synthetic pre-expiry claim was blocked'; end if;
  perform public.finish_culqi_charge(o,(claimed->>'attempt_id')::uuid,'submitted',
    'chr_test_sessionexpirylate','card','{}');
  update public.orders set payment_expires_at=clock_timestamp()-interval '1 minute' where id=o;
  perform pg_temp.assert_session_expiry_quarantine(o,pg_temp.session_expiry_snapshot(o));
  perform public.apply_culqi_payment_event('evt_test_sessionexpirylate','charge.creation.succeeded',
    '{"id":"chr_test_sessionexpirylate","amount":5800,"currency":"PEN"}','{}');
  if not exists(select 1 from public.orders where id=o and payment_status='paid' and status='cancelled'
    and payment_reconciliation_required and payment_reconciliation_reason='payment_after_reservation_release') then
    raise exception 'Late verified payment reclaimed an expired reservation';
  end if;
  result := public.expire_culqi_token_session(o,session_id);
  perform pg_temp.assert_session_expiry_contract(o,result);
  if result->>'paymentStatus' is distinct from 'paid' or result->>'expired' is distinct from 'false'
    or result->>'reconciliationRequired' is distinct from 'true' then
    raise exception 'Expiry obscured the current late-payment state';
  end if;
end $$;

-- An HTTP charge response may arrive after expiry has quarantined its committed
-- claim. Finishing that same claim can store the charge identity, but must not
-- clear review, cancel the pending order, or permit another payment attempt.
do $$
declare o uuid; claimed jsonb; result jsonb; attempt_id uuid; review_reason text;
  prior_order_status text; snapshot_after_finish jsonb;
begin
  o := pg_temp.seed_session_expiry('late-finish');
  update public.orders set payment_expires_at=clock_timestamp()+interval '30 minutes' where id=o;
  claimed := public.claim_culqi_charge(o,'tkn_test_sessionexpirylatefinish','device_synthetic',false);
  if claimed->>'claimed' is distinct from 'true' then raise exception 'Synthetic late-finish claim was blocked'; end if;
  attempt_id := (claimed->>'attempt_id')::uuid;
  update public.orders set payment_expires_at=clock_timestamp()-interval '1 minute' where id=o;
  perform pg_temp.assert_session_expiry_quarantine(o,pg_temp.session_expiry_snapshot(o));
  select payment_reconciliation_reason,status into review_reason,prior_order_status from public.orders where id=o;
  result := public.finish_culqi_charge(o,attempt_id,'submitted','chr_test_sessionexpirylatefinish','card','{}');
  if result->>'state' is distinct from 'submitted'
    or not exists(select 1 from public.orders where id=o and payment_status='pending'
      and status=prior_order_status and payment_charge_state='submitted'
      and payment_charge_attempt_id=attempt_id and payment_charge_id='chr_test_sessionexpirylatefinish'
      and payment_charge_source_id='tkn_test_sessionexpirylatefinish'
      and payment_charge_device_id='device_synthetic' and payment_reconciliation_required
      and payment_reconciliation_reason=review_reason)
    or not exists(select 1 from public.payment_attempts where order_id=o and status='pending'
      and provider_charge_id='chr_test_sessionexpirylatefinish') then
    raise exception 'Late charge finish lost review, ownership or pending state';
  end if;
  snapshot_after_finish := pg_temp.session_expiry_snapshot(o);
  result := public.claim_culqi_charge(o,'tkn_test_expiryfresh123','device_synthetic',false);
  if result->>'claimed' is distinct from 'false'
    or pg_temp.session_expiry_snapshot(o) is distinct from snapshot_after_finish then
    raise exception 'Late finish reopened the quarantined claim';
  end if;
  perform pg_temp.assert_session_expiry_quarantine(o,snapshot_after_finish);
  if pg_temp.session_expiry_snapshot(o) is distinct from snapshot_after_finish then
    raise exception 'Repeated expiry changed a late submitted charge or review reason';
  end if;
end $$;

-- A safely expired idle session never acquired a claimed source. An event using
-- only its order code must still fail the existing metadata/source binding.
do $$
declare o uuid; session_id uuid; before_snapshot jsonb; order_code text;
begin
  o := pg_temp.seed_session_expiry('unclaimed-late-event');
  select checkout_session_id,orders.order_code into session_id,order_code from public.orders where id=o;
  perform public.expire_culqi_token_session(o,session_id);
  before_snapshot := pg_temp.session_expiry_snapshot(o);
  begin
    perform public.apply_culqi_payment_event('evt_test_unclaimedexpirylate','charge.creation.succeeded',
      jsonb_build_object('id','chr_test_unclaimedexpirylate','amount',5800,'currency','PEN',
        'metadata',jsonb_build_object('bagelito_order_code',order_code),
        'source',jsonb_build_object('id','tkn_test_unclaimedexpirylate')),'{}');
    raise exception 'Unclaimed late source was accepted' using errcode='Z0001';
  exception when sqlstate 'Z0001' then raise;
    when others then
      if sqlerrm<>'Charge source does not match the claimed attempt' then raise; end if;
  end;
  if pg_temp.session_expiry_snapshot(o) is distinct from before_snapshot
    or exists(select 1 from public.payment_webhook_events where provider_event_id='evt_test_unclaimedexpirylate') then
    raise exception 'Rejected unclaimed late event left payment effects';
  end if;
end $$;

rollback;
