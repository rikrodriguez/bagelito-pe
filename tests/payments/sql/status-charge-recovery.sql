-- Synthetic owner approval is limited to this rolled-back isolated fixture.
begin;
do $$ declare role_name text; table_name text; privilege_name text;
begin
  if current_database()<>'bagelito_test'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
  if exists(select 1 from public.culqi_status_charge_recovery_policy where enabled) then
    raise exception 'Default status charge GET policy is not disabled';
  end if;
  foreach role_name in array array['anon','authenticated'] loop
    if has_function_privilege(role_name,
      'public.confirm_culqi_status_charge_get(uuid,uuid,uuid,uuid,text,timestamptz,jsonb)','EXECUTE') then
      raise exception 'Status charge GET RPC is not service-only';
    end if;
  end loop;
  if not has_function_privilege('service_role',
    'public.confirm_culqi_status_charge_get(uuid,uuid,uuid,uuid,text,timestamptz,jsonb)','EXECUTE') then
    raise exception 'Service role cannot execute status charge GET RPC';
  end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    foreach table_name in array array['culqi_status_charge_recovery_policy','culqi_status_charge_receipts'] loop
      foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
        if has_table_privilege(role_name,'public.'||table_name,privilege_name) then
          raise exception 'Status charge GET tables expose a direct privilege';
        end if;
      end loop;
      if not (select relrowsecurity from pg_class where oid=('public.'||table_name)::regclass) then
        raise exception 'Status charge GET table RLS is disabled';
      end if;
    end loop;
  end loop;
end $$;

create temporary table status_recovery_fixture_batch(id uuid primary key);
with b as (insert into public.batches(name,status) values('SYNTHETIC GET CONFIRMATION','orders_open') returning id)
insert into status_recovery_fixture_batch select id from b;
create function pg_temp.seed_status_recovery() returns uuid language plpgsql as $$
declare order_uuid uuid; claim jsonb;
begin
  if exists(select 1 from public.orders where order_code='BAG-FUTURE-QA-8500'
    and batch_id<>(select id from status_recovery_fixture_batch)) then
    raise exception 'Pinned synthetic fixture collided';
  end if;
  delete from public.culqi_status_charge_receipts where order_id in
    (select id from public.orders where batch_id=(select id from status_recovery_fixture_batch));
  delete from public.orders where batch_id=(select id from status_recovery_fixture_batch);
  insert into public.orders(batch_id,checkout_session_id,order_code,pack_slug,pack_name,pack_units,pack_type,
    customer_name,whatsapp,email,delivery_address,district,total_amount,payment_provider,payment_status,
    payment_lane,payment_amount_minor,payment_currency,payment_expires_at,status)
  values((select id from status_recovery_fixture_batch),gen_random_uuid(),'BAG-FUTURE-QA-8500','6-single','6 single',6,'single',
    'Synthetic','000000000','synthetic@example.invalid','Synthetic','Lince',85,'culqi','pending','token',8500,
    'PEN',clock_timestamp()+interval '30 minutes','payment_pending_review') returning id into order_uuid;
  perform public.prepare_culqi_token_session(order_uuid);
  claim:=public.claim_culqi_charge(order_uuid,'tkn_test_SYNTHETICFutureSource','device_synthetic',false);
  if claim->>'claimed' is distinct from 'true' then raise exception 'Synthetic claim blocked'; end if;
  perform public.finish_culqi_charge(order_uuid,(claim->>'attempt_id')::uuid,'submitted',
    'chr_test_SYNTHETICFuture8500','card','{}');
  return order_uuid;
end $$;
create function pg_temp.status_recovery_proof() returns jsonb language sql as $$
  select jsonb_build_object('chargeId','chr_test_SYNTHETICFuture8500','sourceId','tkn_test_SYNTHETICFutureSource',
    'amountMinor',8500,'currencyCode','PEN','capture',true,'currentAmountMinor',8500,
    'amountRefundedMinor',0,'dispute',false,'captureDatePresent',false);
$$;
create function pg_temp.call_status_recovery(p_order uuid,p_proof jsonb default pg_temp.status_recovery_proof(),
  p_marker text default 'culqi_charge_get_reviewed_net_v1',p_time timestamptz default clock_timestamp())
returns jsonb language plpgsql as $$ declare o public.orders%rowtype; a uuid;
begin
  select * into o from public.orders where id=p_order;
  select id into a from public.payment_attempts where order_id=p_order and provider_order_id is null;
  return public.confirm_culqi_status_charge_get(o.id,o.checkout_session_id,a,o.payment_charge_attempt_id,p_marker,p_time,p_proof);
end $$;
create function pg_temp.status_recovery_snapshot(p_order uuid) returns jsonb language sql as $$
  select jsonb_build_object('order',(select to_jsonb(o) from public.orders o where id=p_order),
    'attempts',(select jsonb_agg(to_jsonb(a) order by a.id) from public.payment_attempts a where order_id=p_order),
    'history',(select jsonb_agg(to_jsonb(h) order by h.id) from public.order_status_history h where order_id=p_order),
    'receipts',(select jsonb_agg(to_jsonb(r)) from public.culqi_status_charge_receipts r where order_id=p_order),
    'eventCount',(select count(*) from public.payment_webhook_events));
$$;
create function pg_temp.assert_status_recovery_rejected(p_order uuid,p_proof jsonb,
  p_marker text default 'culqi_charge_get_reviewed_net_v1',p_time timestamptz default clock_timestamp())
returns void language plpgsql as $$ declare before_snapshot jsonb:=pg_temp.status_recovery_snapshot(p_order);
begin
  begin
    perform pg_temp.call_status_recovery(p_order,p_proof,p_marker,p_time);
    raise exception 'Invalid GET evidence/binding passed' using errcode='Z0001';
  exception when sqlstate 'Z0001' then raise;
    when others then if sqlerrm not in ('Invalid status charge GET evidence','Status charge GET binding mismatch') then raise; end if;
  end;
  if pg_temp.status_recovery_snapshot(p_order) is distinct from before_snapshot then
    raise exception 'Rejected GET evidence left effects';
  end if;
end $$;

-- Disabled by default; a caller-supplied approval property is invalid evidence.
do $$ declare o uuid:=pg_temp.seed_status_recovery(); before_snapshot jsonb; r jsonb;
begin
  before_snapshot:=pg_temp.status_recovery_snapshot(o);
  r:=pg_temp.call_status_recovery(o);
  if r is distinct from '{"applied":false,"duplicate":false,"alreadyPaid":false,"requiresReview":true,"paymentState":"unknown","orderState":"unknown"}'::jsonb
    or pg_temp.status_recovery_snapshot(o) is distinct from before_snapshot then raise exception 'Default policy made effects'; end if;
  perform pg_temp.assert_status_recovery_rejected(o,pg_temp.status_recovery_proof()||'{"approved":true}');
end $$;
-- EXPLICIT SYNTHETIC CONTRACT APPROVAL: local rollback only, never runtime configuration.
update public.culqi_status_charge_recovery_policy set enabled=true where qa_project_ref='qaahskendqdkynwtylho';

do $$ declare o uuid:=pg_temp.seed_status_recovery(); field text; bad jsonb; before_snapshot jsonb; r jsonb;
begin
  foreach field in array array['chargeId','sourceId','amountMinor','currencyCode','capture','currentAmountMinor',
    'amountRefundedMinor','dispute','captureDatePresent'] loop
    perform pg_temp.assert_status_recovery_rejected(o,pg_temp.status_recovery_proof()-field);
    perform pg_temp.assert_status_recovery_rejected(o,pg_temp.status_recovery_proof()||jsonb_build_object(field,null));
  end loop;
  perform pg_temp.assert_status_recovery_rejected(o,'{}');
  for bad in select value from jsonb_array_elements('[null,[],true,"string",
    {"capture":false},{"capture":"true"},{"dispute":true},{"dispute":"false"},
    {"captureDatePresent":"false"},{"amountMinor":"8500"},{"amountMinor":8500.1},
    {"amountMinor":0,"currentAmountMinor":0},{"amountMinor":-8500},{"amountMinor":1e100},{"currentAmountMinor":6500},
    {"amountRefundedMinor":1},{"currencyCode":"USD"},{"chargeId":"chr_live_SYNTHETIC"},
    {"sourceId":"tkn_live_SYNTHETICSource"}]'::jsonb) loop
    perform pg_temp.assert_status_recovery_rejected(o,case when jsonb_typeof(bad)='object'
      then pg_temp.status_recovery_proof()||bad else bad end);
  end loop;
  perform pg_temp.assert_status_recovery_rejected(o,pg_temp.status_recovery_proof(),'unknown');
  perform pg_temp.assert_status_recovery_rejected(o,pg_temp.status_recovery_proof(),null);
  perform pg_temp.assert_status_recovery_rejected(o,pg_temp.status_recovery_proof(),'culqi_charge_get_reviewed_net_v1',null);
  perform pg_temp.assert_status_recovery_rejected(o,pg_temp.status_recovery_proof(),'culqi_charge_get_reviewed_net_v1','infinity');
  perform pg_temp.assert_status_recovery_rejected(o,pg_temp.status_recovery_proof(),'culqi_charge_get_reviewed_net_v1',clock_timestamp()+interval '1 minute');
  perform pg_temp.assert_status_recovery_rejected(o,pg_temp.status_recovery_proof(),'culqi_charge_get_reviewed_net_v1',clock_timestamp()-interval '31 seconds');
end $$;

-- Binding mismatches cannot change a real stored identity or create a receipt.
do $$ declare case_name text; o uuid;
begin
  foreach case_name in array array['checkout-null','source','claim-null','charge','amount','total','manual','legacy',
    'alternative','attempt-charge','attempt-amount','extra-attempt','charge-state'] loop
    o:=pg_temp.seed_status_recovery();
    case case_name
      when 'checkout-null' then update public.orders set checkout_session_id=null where id=o;
      when 'source' then update public.orders set payment_charge_source_id='tkn_test_SYNTHETICOther' where id=o;
      when 'claim-null' then update public.orders set payment_charge_attempt_id=null where id=o;
      when 'charge' then update public.orders set payment_charge_id='chr_test_SYNTHETICOther' where id=o;
      when 'amount' then update public.orders set payment_amount_minor=6500 where id=o;
      when 'total' then update public.orders set total_amount=84.99 where id=o;
      when 'manual' then update public.orders set payment_provider='manual' where id=o;
      when 'legacy' then update public.orders set payment_lane='legacy' where id=o;
      when 'alternative' then update public.orders set payment_order_id='ord_test_SYNTHETICOther' where id=o;
      when 'attempt-charge' then update public.payment_attempts set provider_charge_id='chr_test_SYNTHETICOther' where order_id=o;
      when 'attempt-amount' then update public.payment_attempts set amount_minor=6500 where order_id=o;
      when 'extra-attempt' then insert into public.payment_attempts(order_id,provider,provider_order_id,amount_minor)
        values(o,'culqi','ord_test_SYNTHETICOther',8500);
      when 'charge-state' then update public.orders set payment_charge_state='requires_3ds' where id=o;
    end case;
    perform pg_temp.assert_status_recovery_rejected(o,pg_temp.status_recovery_proof());
  end loop;
end $$;
do $$ declare o uuid:=pg_temp.seed_status_recovery(); row_o public.orders%rowtype; attempt_uuid uuid; n integer;
begin
  select * into row_o from public.orders where id=o;
  select id into attempt_uuid from public.payment_attempts where order_id=o;
  for n in 1..4 loop
    begin
      perform public.confirm_culqi_status_charge_get(o,
        case when n=1 then gen_random_uuid() else row_o.checkout_session_id end,
        case when n=2 then gen_random_uuid() when n=4 then row_o.payment_charge_attempt_id else attempt_uuid end,
        case when n=3 then gen_random_uuid() when n=4 then attempt_uuid else row_o.payment_charge_attempt_id end,
        'culqi_charge_get_reviewed_net_v1',clock_timestamp(),pg_temp.status_recovery_proof());
      raise exception 'Stale or swapped capability passed' using errcode='Z0001';
    exception when sqlstate 'Z0001' then raise;
      when others then if sqlerrm<>'Status charge GET binding mismatch' then raise; end if;
    end;
  end loop;
end $$;

do $$ declare case_name text; o uuid; before_snapshot jsonb; r jsonb;
begin
  foreach case_name in array array['failed','expired','refunded','in_production','delivered','needs-manual',
    'null-expiry','infinite-expiry','null-attempt-expiry','infinite-attempt-expiry','paid-at','attempt-paid','attempt-failed','attempt-refunded','attempt-paid-at'] loop
    o:=pg_temp.seed_status_recovery();
    case case_name
      when 'failed','expired','refunded' then update public.orders set payment_status=case_name where id=o;
      when 'in_production','delivered' then update public.orders set status=case_name where id=o;
      when 'needs-manual' then update public.orders set status='needs_correction',payment_reconciliation_required=true,
        payment_reconciliation_reason='synthetic_manual_review' where id=o;
      when 'null-expiry' then update public.orders set payment_expires_at=null where id=o;
      when 'infinite-expiry' then update public.orders set payment_expires_at='infinity' where id=o;
      when 'null-attempt-expiry' then update public.payment_attempts set expires_at=null where order_id=o;
      when 'infinite-attempt-expiry' then update public.payment_attempts set expires_at='infinity' where order_id=o;
      when 'paid-at' then update public.orders set payment_paid_at=clock_timestamp() where id=o;
      when 'attempt-paid','attempt-failed','attempt-refunded' then update public.payment_attempts
        set status=substring(case_name from 9) where order_id=o;
      when 'attempt-paid-at' then update public.payment_attempts set paid_at=clock_timestamp() where order_id=o;
    end case;
    before_snapshot:=pg_temp.status_recovery_snapshot(o);
    r:=pg_temp.call_status_recovery(o);
    if r->>'applied' is distinct from 'false' or r->>'duplicate' is distinct from 'false'
      or r->>'requiresReview' is distinct from 'true'
      or pg_temp.status_recovery_snapshot(o) is distinct from before_snapshot then raise exception 'Unsupported state changed'; end if;
  end loop;
end $$;

-- These reasons are the server's bound known-refund observations. A caller's
-- earlier GET cannot override one that committed before the financial lock.
do $$ declare reason text; review_flag boolean; fulfillment_state text;
  o uuid; before_snapshot jsonb; r jsonb;
begin
  foreach reason in array array['known_pending_refund','known_completed_refund','known_refund_unknown'] loop
    foreach review_flag in array array[true,false] loop
      foreach fulfillment_state in array array['payment_pending_review','cancelled'] loop
        o:=pg_temp.seed_status_recovery();
        update public.orders set payment_reconciliation_reason=reason,
          payment_reconciliation_required=review_flag,status=fulfillment_state where id=o;
        before_snapshot:=pg_temp.status_recovery_snapshot(o); r:=pg_temp.call_status_recovery(o);
        if r is distinct from jsonb_build_object('applied',false,'duplicate',false,'alreadyPaid',false,
            'requiresReview',true,'paymentState','pending','orderState',fulfillment_state)
          or pg_temp.status_recovery_snapshot(o) is distinct from before_snapshot then
          raise exception 'Known refund observation was overwritten by status confirmation';
        end if;
      end loop;
    end loop;
  end loop;
end $$;
alter table public.payment_attempts alter column status drop not null;
do $$ declare o uuid:=pg_temp.seed_status_recovery(); before_snapshot jsonb; r jsonb;
begin
  update public.payment_attempts set status=null where order_id=o;
  before_snapshot:=pg_temp.status_recovery_snapshot(o); r:=pg_temp.call_status_recovery(o);
  if r->>'applied' is distinct from 'false' or pg_temp.status_recovery_snapshot(o) is distinct from before_snapshot then
    raise exception 'Null attempt status passed'; end if;
  update public.payment_attempts set status='pending' where order_id=o;
end $$;
alter table public.payment_attempts alter column status set not null;

-- First confirmation, duplicate, manual review and finite server timestamps.
do $$ declare case_name text; o uuid; r jsonb; before_snapshot jsonb; expected_reason text;
begin
  foreach case_name in array array['normal','same-uuid-value','uncertain','needs-uncertain','manual-review','late','cancelled','original-deadline','expired-reason-future','reopened-after-cancellation'] loop
    o:=pg_temp.seed_status_recovery(); expected_reason:=null;
    if case_name='same-uuid-value' then
      update public.orders set payment_charge_attempt_id=(select id from public.payment_attempts where order_id=o) where id=o;
    elsif case_name in ('uncertain','needs-uncertain') then
      update public.orders set payment_charge_state='uncertain',payment_reconciliation_required=true,
        payment_reconciliation_reason='charge_result_uncertain',
        status=case when case_name='needs-uncertain' then 'needs_correction' else status end where id=o;
    elsif case_name='manual-review' then
      expected_reason:='synthetic_manual_review';
      update public.orders set payment_reconciliation_required=true,payment_reconciliation_reason=expected_reason where id=o;
    elsif case_name='original-deadline' then
      expected_reason:='payment_after_reservation_release';
      update public.payment_attempts set expires_at=clock_timestamp()-interval '1 second' where order_id=o;
    elsif case_name='expired-reason-future' then
      expected_reason:='payment_after_reservation_release';
      update public.orders set payment_reconciliation_required=true,
        payment_reconciliation_reason='payment_expired_with_charge_unresolved' where id=o;
    elsif case_name='reopened-after-cancellation' then
      expected_reason:='payment_after_reservation_release';
      insert into public.order_status_history(order_id,old_status,new_status,changed_by)
        values(o,'payment_pending_review','cancelled','synthetic reservation release');
      insert into public.order_status_history(order_id,old_status,new_status,changed_by)
        values(o,'cancelled','payment_pending_review','synthetic unsupported reopening');
    elsif case_name in ('late','cancelled') then
      expected_reason:='payment_after_reservation_release';
      update public.orders set payment_expires_at=clock_timestamp()-interval '1 second',
        status=case when case_name='cancelled' then 'cancelled' else status end where id=o;
    end if;
    r:=pg_temp.call_status_recovery(o);
    if r->>'applied' is distinct from 'true' or r->>'duplicate' is distinct from 'false'
      or r->>'alreadyPaid' is distinct from 'false' or r->>'paymentState' is distinct from 'paid'
      or (select payment_reconciliation_reason from public.orders where id=o) is distinct from expected_reason
      or not exists(select 1 from public.payment_attempts where order_id=o and status='paid')
      or not exists(select 1 from public.culqi_status_charge_receipts where order_id=o and applied_confirmation
        and provenance='culqi_charge_get' and isfinite(confirmed_at) and observed_at<=confirmed_at
        and confirmed_at= (select payment_paid_at from public.orders where id=o)) then raise exception 'First GET confirmation invalid'; end if;
    if case_name in ('late','cancelled','original-deadline','expired-reason-future','reopened-after-cancellation') and (r->>'orderState' is distinct from 'cancelled'
      or r->>'requiresReview' is distinct from 'true') then raise exception 'Late confirmation reclaimed capacity'; end if;
    before_snapshot:=pg_temp.status_recovery_snapshot(o); r:=pg_temp.call_status_recovery(o);
    if r->>'applied' is distinct from 'false' or r->>'duplicate' is distinct from 'true'
      or pg_temp.status_recovery_snapshot(o) is distinct from before_snapshot then raise exception 'Receipt retry changed state'; end if;
  end loop;
end $$;

-- Future QA amounts come from the locked order/attempt, not an administrative pin.
do $$ declare amount integer; o uuid; proof jsonb; r jsonb;
begin
  foreach amount in array array[1,5800,8500,12345,2147483647] loop
    o:=pg_temp.seed_status_recovery();
    update public.orders set total_amount=amount::numeric/100,payment_amount_minor=amount where id=o;
    update public.payment_attempts set amount_minor=amount where order_id=o;
    proof:=pg_temp.status_recovery_proof()||jsonb_build_object('amountMinor',amount,'currentAmountMinor',amount);
    r:=pg_temp.call_status_recovery(o,proof);
    if r->>'applied' is distinct from 'true' or r->>'paymentState' is distinct from 'paid'
      or not exists(select 1 from public.culqi_status_charge_receipts where order_id=o
        and amount_minor=amount and current_amount_minor=amount) then
      raise exception 'Generic future QA amount was not bound to the locked order';
    end if;
  end loop;
end $$;

-- GET confirmation followed by an authentic synthetic webhook is idempotent;
-- GET does not fabricate that event or replace its independent provenance.
do $$ declare o uuid:=pg_temp.seed_status_recovery(); before_snapshot jsonb;
begin
  perform pg_temp.call_status_recovery(o); before_snapshot:=pg_temp.status_recovery_snapshot(o);
  perform public.apply_culqi_payment_event('evt_test_SYNTHETICGetThenWebhook','charge.creation.succeeded',
    '{"id":"chr_test_SYNTHETICFuture8500","amount":8500,"currency":"PEN"}','{}');
  if (pg_temp.status_recovery_snapshot(o)-'eventCount') is distinct from (before_snapshot-'eventCount')
    or not exists(select 1 from public.payment_webhook_events where provider_event_id='evt_test_SYNTHETICGetThenWebhook'
      and processed_at is not null) then raise exception 'Webhook regressed GET confirmation'; end if;
end $$;

-- A saved receipt never restores paid after a later financial reversal.
do $$ declare o uuid:=pg_temp.seed_status_recovery(); before_snapshot jsonb; r jsonb;
begin
  perform pg_temp.call_status_recovery(o);
  update public.orders set payment_status='refunded',status='cancelled' where id=o;
  update public.payment_attempts set status='refunded' where order_id=o;
  before_snapshot:=pg_temp.status_recovery_snapshot(o); r:=pg_temp.call_status_recovery(o);
  if r->>'applied' is distinct from 'false' or r->>'duplicate' is distinct from 'true'
    or r->>'alreadyPaid' is distinct from 'false' or r->>'requiresReview' is distinct from 'true'
    or r->>'paymentState' is distinct from 'refunded'
    or pg_temp.status_recovery_snapshot(o) is distinct from before_snapshot then
    raise exception 'A receipt replay restored payment after refund';
  end if;
end $$;

-- A previously paid order retains fulfillment and financial provenance.
do $$ declare o uuid:=pg_temp.seed_status_recovery(); before_snapshot jsonb; r jsonb;
begin
  perform public.apply_culqi_payment_event('evt_test_SYNTHETICGetAlreadyPaid','charge.creation.succeeded',
    '{"id":"chr_test_SYNTHETICFuture8500","amount":8500,"currency":"PEN"}','{}');
  update public.orders set status='delivered',payment_expires_at=clock_timestamp()-interval '1 hour' where id=o;
  before_snapshot:=pg_temp.status_recovery_snapshot(o); r:=pg_temp.call_status_recovery(o);
  if r->>'applied' is distinct from 'false' or r->>'duplicate' is distinct from 'false'
    or r->>'alreadyPaid' is distinct from 'true' or r->>'orderState' is distinct from 'delivered'
    or (pg_temp.status_recovery_snapshot(o)-'receipts') is distinct from (before_snapshot-'receipts')
    or not exists(select 1 from public.culqi_status_charge_receipts where order_id=o and not applied_confirmation) then
    raise exception 'Already-paid GET claimed primary confirmation or changed fulfillment'; end if;
end $$;

create function pg_temp.reject_status_recovery_history() returns trigger language plpgsql as $$
begin if current_setting('bagelito.fail_status_recovery_history',true)='on' then
  raise exception 'synthetic status charge GET history failure'; end if; return new; end $$;
create trigger synthetic_status_recovery_history_failure before insert on public.order_status_history
for each row execute function pg_temp.reject_status_recovery_history();
do $$ declare o uuid:=pg_temp.seed_status_recovery(); before_snapshot jsonb;
begin
  before_snapshot:=pg_temp.status_recovery_snapshot(o);
  perform set_config('bagelito.fail_status_recovery_history','on',true);
  begin
    perform pg_temp.call_status_recovery(o);
    raise exception 'History failure did not abort GET confirmation' using errcode='Z0001';
  exception when sqlstate 'Z0001' then raise;
    when others then if sqlerrm<>'synthetic status charge GET history failure' then raise; end if;
  end;
  perform set_config('bagelito.fail_status_recovery_history','off',true);
  if pg_temp.status_recovery_snapshot(o) is distinct from before_snapshot then raise exception 'GET rollback left effects'; end if;
end $$;
rollback;
