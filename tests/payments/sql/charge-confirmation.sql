-- Synthetic, rolled-back PostgreSQL fixture. No provider, credentials or app DB.
begin;
do $$ declare role_name text; privilege_name text;
begin
  if current_database()<>'bagelito_test'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
  if to_regprocedure('public.confirm_culqi_charge_result(uuid,uuid,uuid,timestamptz,text,text,jsonb)') is null then
    raise exception 'Charge confirmation RPC is not installed';
  end if;
  foreach role_name in array array['anon','authenticated'] loop
    if has_function_privilege(role_name,
      'public.confirm_culqi_charge_result(uuid,uuid,uuid,timestamptz,text,text,jsonb)','EXECUTE') then
      raise exception 'Charge confirmation RPC is not service-only';
    end if;
  end loop;
  if not has_function_privilege('service_role',
    'public.confirm_culqi_charge_result(uuid,uuid,uuid,timestamptz,text,text,jsonb)','EXECUTE') then
    raise exception 'Service role cannot execute charge confirmation';
  end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege(role_name,'public.culqi_charge_confirmation_receipts',privilege_name) then
        raise exception 'Charge confirmation receipts expose direct privileges';
      end if;
    end loop;
  end loop;
  if not (select relrowsecurity from pg_class where oid='public.culqi_charge_confirmation_receipts'::regclass)
    or exists(select 1 from pg_class c join pg_roles r on r.oid=c.relowner
      where c.oid='public.culqi_charge_confirmation_receipts'::regclass
      and r.rolname in ('anon','authenticated','service_role'))
    or exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner
      where p.oid='public.confirm_culqi_charge_result(uuid,uuid,uuid,timestamptz,text,text,jsonb)'::regprocedure
      and (not p.prosecdef or r.rolname in ('anon','authenticated','service_role'))) then
    raise exception 'Charge confirmation owner/RLS contract failed';
  end if;
end $$;

create temporary table confirmation_fixture_batch(id uuid primary key);
with b as (insert into public.batches(name,status) values('SYNTHETIC CHARGE CONFIRMATION','orders_open') returning id)
insert into confirmation_fixture_batch select id from b;

create function pg_temp.seed_confirmation(p_mode text default 'test',p_amount integer default 5800,
  p_submitted boolean default true)
returns uuid language plpgsql as $$ declare order_uuid uuid; claim jsonb;
begin
  delete from public.culqi_charge_confirmation_receipts where order_id in
    (select id from public.orders where batch_id=(select id from confirmation_fixture_batch));
  delete from public.orders where batch_id=(select id from confirmation_fixture_batch);
  insert into public.orders(batch_id,checkout_session_id,order_code,pack_slug,pack_name,pack_units,pack_type,
    customer_name,whatsapp,email,delivery_address,district,total_amount,payment_provider,payment_status,
    payment_lane,payment_amount_minor,payment_currency,payment_expires_at,status)
  values((select id from confirmation_fixture_batch),gen_random_uuid(),'BAG-SYNTHETIC-CONFIRM','6-single','6 single',6,'single',
    'Synthetic','000000000','synthetic@example.invalid','Synthetic','Lince',p_amount/100.0,'culqi','pending',
    'token',p_amount,'PEN',clock_timestamp()+interval '30 minutes','payment_pending_review') returning id into order_uuid;
  perform public.prepare_culqi_token_session(order_uuid);
  claim:=public.claim_culqi_charge(order_uuid,'tkn_'||p_mode||'_SYNTHETICConfirmSource','device_synthetic',false);
  if claim->>'claimed' is distinct from 'true' then raise exception 'Synthetic confirmation claim blocked'; end if;
  if p_submitted then
    perform public.finish_culqi_charge(order_uuid,(claim->>'attempt_id')::uuid,'submitted',
      'chr_'||p_mode||'_SYNTHETICConfirmCharge','card','{}');
  end if;
  return order_uuid;
end $$;
create function pg_temp.confirmation_proof(p_mode text default 'test',p_amount integer default 5800)
returns jsonb language sql as $$
  select jsonb_build_object('chargeId','chr_'||p_mode||'_SYNTHETICConfirmCharge',
    'sourceId','tkn_'||p_mode||'_SYNTHETICConfirmSource','amountMinor',p_amount,'currencyCode','PEN',
    'capture',true,'currentAmountMinor',p_amount,'amountRefundedMinor',0,'dispute',false,'captureDatePresent',false);
$$;
create function pg_temp.call_confirmation(p_order uuid,p_proof jsonb default pg_temp.confirmation_proof(),
  p_provenance text default 'culqi_charge_post',p_mode text default 'test',
  p_time timestamptz default clock_timestamp()) returns jsonb language plpgsql as $$ declare o public.orders%rowtype;
begin
  select * into o from public.orders where id=p_order;
  return public.confirm_culqi_charge_result(o.id,o.checkout_session_id,o.payment_charge_attempt_id,
    p_time,p_provenance,p_mode,p_proof);
end $$;
create function pg_temp.confirmation_snapshot(p_order uuid) returns jsonb language sql as $$
  select jsonb_build_object('order',(select to_jsonb(o) from public.orders o where id=p_order),
    'attempts',(select jsonb_agg(to_jsonb(a) order by a.id) from public.payment_attempts a where order_id=p_order),
    'history',(select jsonb_agg(to_jsonb(h) order by h.id) from public.order_status_history h where order_id=p_order),
    'receipts',(select jsonb_agg(to_jsonb(r)) from public.culqi_charge_confirmation_receipts r where order_id=p_order),
    'eventCount',(select count(*) from public.payment_webhook_events));
$$;
create function pg_temp.assert_confirmation_rejected(p_order uuid,p_proof jsonb,
  p_provenance text default 'culqi_charge_post',p_mode text default 'test',
  p_time timestamptz default clock_timestamp()) returns void language plpgsql as $$
declare before_snapshot jsonb:=pg_temp.confirmation_snapshot(p_order);
begin
  begin
    perform pg_temp.call_confirmation(p_order,p_proof,p_provenance,p_mode,p_time);
    raise exception 'Invalid charge confirmation passed' using errcode='Z0001';
  exception when sqlstate 'Z0001' then raise;
    when others then if sqlerrm not in ('Invalid charge confirmation evidence','Charge confirmation binding mismatch') then raise; end if;
  end;
  if pg_temp.confirmation_snapshot(p_order) is distinct from before_snapshot then
    raise exception 'Rejected charge confirmation left effects';
  end if;
end $$;

-- Exact evidence and source-mode/provenance boundaries; nothing can opt itself in.
do $$ declare o uuid:=pg_temp.seed_confirmation(); field text; bad jsonb;
begin
  foreach field in array array['chargeId','sourceId','amountMinor','currencyCode','capture',
    'currentAmountMinor','amountRefundedMinor','dispute','captureDatePresent'] loop
    perform pg_temp.assert_confirmation_rejected(o,pg_temp.confirmation_proof()-field);
    perform pg_temp.assert_confirmation_rejected(o,pg_temp.confirmation_proof()||jsonb_build_object(field,null));
  end loop;
  for bad in select value from jsonb_array_elements('[null,[],true,"string",{},
    {"capture":false},{"capture":"true"},{"dispute":true},{"dispute":"false"},
    {"captureDatePresent":"false"},{"paid":true},{"approved":true},
    {"amountMinor":"5800"},{"amountMinor":5800.1},{"amountMinor":-5800},
    {"amountMinor":1e100},{"amountMinor":0},{"currentAmountMinor":5799},
    {"amountRefundedMinor":1},{"amountRefundedMinor":"0"},{"currencyCode":"USD"},
    {"chargeId":"chr_live_SYNTHETICConfirmCharge"},{"sourceId":"tkn_live_SYNTHETICConfirmSource"},
    {"chargeId":"chr_test_short"},{"sourceId":"ord_test_SYNTHETICConfirmSource"}]'::jsonb) loop
    perform pg_temp.assert_confirmation_rejected(o,case when bad<>'{}'::jsonb and jsonb_typeof(bad)='object'
      then pg_temp.confirmation_proof()||bad else bad end);
  end loop;
  perform pg_temp.assert_confirmation_rejected(o,pg_temp.confirmation_proof(),'webhook');
  perform pg_temp.assert_confirmation_rejected(o,pg_temp.confirmation_proof(),'culqi_charge_get_reviewed_net_v1');
  perform pg_temp.assert_confirmation_rejected(o,pg_temp.confirmation_proof(),null);
  perform pg_temp.assert_confirmation_rejected(o,pg_temp.confirmation_proof(),'culqi_charge_post','live');
  perform pg_temp.assert_confirmation_rejected(o,pg_temp.confirmation_proof(),'culqi_charge_post','sandbox');
  perform pg_temp.assert_confirmation_rejected(o,pg_temp.confirmation_proof(),'culqi_charge_post',null);
  perform pg_temp.assert_confirmation_rejected(o,pg_temp.confirmation_proof(),'culqi_charge_post','test',null);
  perform pg_temp.assert_confirmation_rejected(o,pg_temp.confirmation_proof(),'culqi_charge_post','test','infinity');
  perform pg_temp.assert_confirmation_rejected(o,pg_temp.confirmation_proof(),'culqi_charge_post','test',clock_timestamp()+interval '1 minute');
  perform pg_temp.assert_confirmation_rejected(o,pg_temp.confirmation_proof(),'culqi_charge_post','test',clock_timestamp()-interval '31 seconds');
end $$;

-- Both authentic server observation origins and both source modes work without a QA policy.
do $$ declare test_mode text; test_provenance text; o uuid; r jsonb; before_snapshot jsonb; test_amount integer;
begin
  foreach test_mode in array array['test','live'] loop
    foreach test_provenance in array array['culqi_charge_post','culqi_charge_get'] loop
      foreach test_amount in array array[5800,8500,2147483647] loop
        o:=pg_temp.seed_confirmation(test_mode,test_amount);
        r:=pg_temp.call_confirmation(o,pg_temp.confirmation_proof(test_mode,test_amount),test_provenance,test_mode);
        if r is distinct from '{"applied":true,"duplicate":false,"alreadyPaid":false,"requiresReview":false,"paymentState":"paid","orderState":"payment_confirmed"}'::jsonb
          or not exists(select 1 from public.payment_attempts where order_id=o and status='paid' and paid_at is not null)
          or (select count(*) from public.order_status_history where order_id=o and new_status='payment_confirmed')<>1
          or not exists(select 1 from public.culqi_charge_confirmation_receipts where order_id=o
            and provenance=test_provenance and mode=test_mode and contract_marker='culqi_charge_result_net_v1'
            and amount_minor=test_amount and applied_confirmation and isfinite(confirmed_at)) then
          raise exception 'Fresh charge confirmation failed';
        end if;
        before_snapshot:=pg_temp.confirmation_snapshot(o);
        r:=pg_temp.call_confirmation(o,pg_temp.confirmation_proof(test_mode,test_amount),
          case when test_provenance='culqi_charge_post' then 'culqi_charge_get' else 'culqi_charge_post' end,test_mode);
        if r->>'duplicate' is distinct from 'true' or r->>'applied' is distinct from 'false'
          or pg_temp.confirmation_snapshot(o) is distinct from before_snapshot then
          raise exception 'Cross-test_provenance retry changed original receipt or transition';
        end if;
      end loop;
    end loop;
  end loop;
end $$;

do $$ declare case_name text; o uuid;
begin
  foreach case_name in array array['source','claim-null','charge','amount','total','total-nan','manual',
    'legacy','alternative','attempt-charge','attempt-amount','extra-attempt','no-attempt','charge-state','currency','order-code'] loop
    o:=pg_temp.seed_confirmation();
    case case_name
      when 'source' then update public.orders set payment_charge_source_id='tkn_test_SYNTHETICOtherSource' where id=o;
      when 'claim-null' then update public.orders set payment_charge_attempt_id=null where id=o;
      when 'charge' then update public.orders set payment_charge_id='chr_test_SYNTHETICOtherCharge' where id=o;
      when 'amount' then update public.orders set payment_amount_minor=5700 where id=o;
      when 'total' then update public.orders set total_amount=57 where id=o;
      when 'total-nan' then update public.orders set total_amount='NaN' where id=o;
      when 'manual' then update public.orders set payment_provider='manual' where id=o;
      when 'legacy' then update public.orders set payment_lane='legacy' where id=o;
      when 'alternative' then update public.orders set payment_order_id='ord_test_SYNTHETICOtherOrder' where id=o;
      when 'attempt-charge' then update public.payment_attempts set provider_charge_id='chr_test_SYNTHETICOtherCharge' where order_id=o;
      when 'attempt-amount' then update public.payment_attempts set amount_minor=5700 where order_id=o;
      when 'extra-attempt' then insert into public.payment_attempts(order_id,provider,provider_order_id,amount_minor)
        values(o,'culqi','ord_test_SYNTHETICOtherOrder',5800);
      when 'no-attempt' then delete from public.payment_attempts where order_id=o;
      when 'charge-state' then update public.orders set payment_charge_state='submitting' where id=o;
      when 'currency' then update public.orders set payment_currency='USD' where id=o;
      when 'order-code' then update public.orders set order_code='invalid' where id=o;
    end case;
    perform pg_temp.assert_confirmation_rejected(o,pg_temp.confirmation_proof());
  end loop;
end $$;
do $$ declare o uuid:=pg_temp.seed_confirmation(); row_o public.orders%rowtype; n integer;
begin
  select * into row_o from public.orders where id=o;
  for n in 1..3 loop
    begin
      perform public.confirm_culqi_charge_result(
        case when n=1 then gen_random_uuid() else o end,
        case when n=2 then gen_random_uuid() else row_o.checkout_session_id end,
        case when n=3 then gen_random_uuid() else row_o.payment_charge_attempt_id end,
        clock_timestamp(),'culqi_charge_post','test',pg_temp.confirmation_proof());
      raise exception 'Wrong order/session/claim capability passed' using errcode='Z0001';
    exception when sqlstate 'Z0001' then raise;
      when others then if sqlerrm<>'Charge confirmation binding mismatch' then raise; end if;
    end;
  end loop;
end $$;

-- Refunded/unsupported states never acquire a confirmation receipt or new effects.
do $$ declare case_name text; o uuid; r jsonb; before_snapshot jsonb;
begin
  foreach case_name in array array['failed','expired','refunded','in_production','delivered','needs-manual',
    'known_pending_refund','known_completed_refund','known_refund_unknown','null-expiry','infinite-expiry',
    'null-attempt-expiry','infinite-attempt-expiry','paid-at','attempt-paid','attempt-failed','attempt-refunded','attempt-paid-at'] loop
    o:=pg_temp.seed_confirmation();
    case case_name
      when 'failed','expired','refunded' then update public.orders set payment_status=case_name where id=o;
      when 'in_production','delivered' then update public.orders set status=case_name where id=o;
      when 'needs-manual' then update public.orders set status='needs_correction',payment_reconciliation_required=true,
        payment_reconciliation_reason='synthetic_manual_review' where id=o;
      when 'known_pending_refund','known_completed_refund','known_refund_unknown' then update public.orders
        set payment_reconciliation_required=true,payment_reconciliation_reason=case_name where id=o;
      when 'null-expiry' then update public.orders set payment_expires_at=null where id=o;
      when 'infinite-expiry' then update public.orders set payment_expires_at='infinity' where id=o;
      when 'null-attempt-expiry' then update public.payment_attempts set expires_at=null where order_id=o;
      when 'infinite-attempt-expiry' then update public.payment_attempts set expires_at='infinity' where order_id=o;
      when 'paid-at' then update public.orders set payment_paid_at=clock_timestamp() where id=o;
      when 'attempt-paid','attempt-failed','attempt-refunded' then update public.payment_attempts set status=substring(case_name from 9) where order_id=o;
      when 'attempt-paid-at' then update public.payment_attempts set paid_at=clock_timestamp() where order_id=o;
    end case;
    before_snapshot:=pg_temp.confirmation_snapshot(o);r:=pg_temp.call_confirmation(o);
    if r->>'applied' is distinct from 'false' or r->>'requiresReview' is distinct from 'true'
      or pg_temp.confirmation_snapshot(o) is distinct from before_snapshot then
      raise exception 'Unsafe or unsupported state changed: %',case_name;
    end if;
  end loop;
end $$;

do $$ declare case_name text; o uuid; r jsonb; expected_reason text;
begin
  foreach case_name in array array['uncertain','needs-uncertain','manual-review','late','cancelled',
    'attempt-expired','released-reason','cancelled-history'] loop
    o:=pg_temp.seed_confirmation();expected_reason:=null;
    if case_name in ('uncertain','needs-uncertain') then
      update public.orders set payment_charge_state='uncertain',payment_reconciliation_required=true,
        payment_reconciliation_reason='charge_result_uncertain',
        status=case when case_name='needs-uncertain' then 'needs_correction' else status end where id=o;
    elsif case_name='manual-review' then
      expected_reason:='synthetic_manual_review';
      update public.orders set payment_reconciliation_required=true,payment_reconciliation_reason=expected_reason where id=o;
    elsif case_name in ('late','cancelled') then
      update public.orders set payment_expires_at=clock_timestamp()-interval '1 second',
        status=case when case_name='cancelled' then 'cancelled' else status end where id=o;
    elsif case_name='attempt-expired' then
      update public.payment_attempts set expires_at=clock_timestamp()-interval '1 second' where order_id=o;
    elsif case_name='released-reason' then
      update public.orders set payment_reconciliation_required=true,
        payment_reconciliation_reason='payment_expired_with_charge_unresolved' where id=o;
    else
      insert into public.order_status_history(order_id,old_status,new_status,changed_by)
        values(o,'payment_pending_review','cancelled','synthetic original release');
    end if;
    if case_name in ('late','cancelled','attempt-expired','released-reason','cancelled-history') then
      expected_reason:='payment_after_reservation_release';
    end if;
    r:=pg_temp.call_confirmation(o);
    if r->>'applied' is distinct from 'true' or r->>'paymentState' is distinct from 'paid'
      or (select payment_reconciliation_reason from public.orders where id=o) is distinct from expected_reason
      or (expected_reason='payment_after_reservation_release' and
        (r->>'orderState' is distinct from 'cancelled' or r->>'requiresReview' is distinct from 'true')) then
      raise exception 'Confirmation lost original deadline/release/review protection: %',case_name;
    end if;
  end loop;
end $$;

-- Genuine synthetic webhook provenance stays separate in either completion order.
do $$ declare o uuid; before_snapshot jsonb; r jsonb; direction integer;
begin
  for direction in 1..2 loop
    o:=pg_temp.seed_confirmation();
    if direction=1 then perform pg_temp.call_confirmation(o); end if;
    perform public.apply_culqi_payment_event('evt_test_SYNTHETICConfirmWebhook'||direction,
      'charge.creation.succeeded','{"id":"chr_test_SYNTHETICConfirmCharge","amount":5800,"currency":"PEN"}','{}');
    if direction=2 then update public.orders set status='delivered' where id=o; end if;
    before_snapshot:=pg_temp.confirmation_snapshot(o);r:=pg_temp.call_confirmation(o);
    if (pg_temp.confirmation_snapshot(o)-'receipts') is distinct from (before_snapshot-'receipts')
      or (select count(*) from public.order_status_history where order_id=o and new_status='payment_confirmed')<>1
      or r->>'applied' is distinct from 'false' or r->>'alreadyPaid' is distinct from 'true' then
      raise exception 'Webhook/confirmation repeated a transition or changed fulfillment';
    end if;
  end loop;
end $$;
do $$ declare o uuid:=pg_temp.seed_confirmation(); before_snapshot jsonb; r jsonb;
begin
  perform pg_temp.call_confirmation(o);
  update public.orders set payment_status='refunded',status='cancelled' where id=o;
  update public.payment_attempts set status='refunded' where order_id=o;
  before_snapshot:=pg_temp.confirmation_snapshot(o);r:=pg_temp.call_confirmation(o);
  if r->>'duplicate' is distinct from 'true' or r->>'requiresReview' is distinct from 'true'
    or pg_temp.confirmation_snapshot(o) is distinct from before_snapshot then
    raise exception 'Receipt replay undid a later refund';
  end if;
end $$;

-- A known refund reason is authoritative even if a legacy/inconsistent flag
-- says false, including already-paid and immutable receipt duplicate paths.
do $$ declare reason text; with_receipt boolean; o uuid; before_snapshot jsonb; r jsonb;
begin
  foreach reason in array array['known_pending_refund','known_completed_refund','known_refund_unknown','charge_observation_adverse'] loop
    foreach with_receipt in array array[false,true] loop
      o:=pg_temp.seed_confirmation();
      if with_receipt then perform pg_temp.call_confirmation(o);
      else
        update public.orders set payment_status='paid',status='payment_confirmed',
          payment_paid_at=clock_timestamp() where id=o;
        update public.payment_attempts set status='paid',paid_at=clock_timestamp() where order_id=o;
      end if;
      update public.orders set payment_reconciliation_required=false,payment_reconciliation_reason=reason where id=o;
      before_snapshot:=pg_temp.confirmation_snapshot(o);r:=pg_temp.call_confirmation(o);
      if r->>'requiresReview' is distinct from 'true' or r->>'alreadyPaid' is distinct from 'true'
        or r->>'applied' is distinct from 'false'
        or (r->>'duplicate')::boolean is distinct from with_receipt
        or pg_temp.confirmation_snapshot(o) is distinct from before_snapshot then
        raise exception 'Known refund was reported as safe paid';
      end if;
    end loop;
  end loop;
end $$;

-- Only these three adverse observations acquire durable quarantine. A generic
-- timeout remains recoverable by separately verified capture evidence.
do $$ declare issue text; fulfillment text; previous_reason text; o uuid;
  row_o public.orders%rowtype; r jsonb; expected_reason text; before_snapshot jsonb;
begin
  foreach issue in array array['refund_observed','dispute_observed','current_amount_mismatch'] loop
    foreach fulfillment in array array['payment_pending_review','cancelled','paid'] loop
      foreach previous_reason in array array[null::text,'charge_result_uncertain','synthetic_manual_review','known_pending_refund'] loop
        o:=pg_temp.seed_confirmation('test',5800,false);
        if fulfillment='paid' then
          perform public.apply_culqi_payment_event('evt_test_SYNTHETICAdverse'||left(replace(gen_random_uuid()::text,'-',''),12),
            'charge.creation.succeeded',
            '{"id":"chr_test_SYNTHETICConfirmCharge","amount":5800,"currency":"PEN","source":{"id":"tkn_test_SYNTHETICConfirmSource"},"metadata":{"bagelito_order_code":"BAG-SYNTHETIC-CONFIRM"}}','{}');
        elsif fulfillment='cancelled' then update public.orders set status='cancelled' where id=o;
        end if;
        if previous_reason is not null then update public.orders set payment_reconciliation_required=true,
          payment_reconciliation_reason=previous_reason where id=o; end if;
        select * into row_o from public.orders where id=o;
        perform public.finish_culqi_charge(o,row_o.payment_charge_attempt_id,'uncertain',
          'chr_test_SYNTHETICConfirmCharge','card',
          jsonb_build_object('stage','reconciliation_required','reason',issue,'raw','must_not_persist'));
        expected_reason:=case when previous_reason is null or previous_reason='charge_result_uncertain'
          then 'charge_observation_adverse' else previous_reason end;
        select * into row_o from public.orders where id=o;
        if row_o.payment_reconciliation_required is distinct from true
          or row_o.payment_reconciliation_reason is distinct from expected_reason
          or row_o.payment_charge_id is distinct from 'chr_test_SYNTHETICConfirmCharge'
          or row_o.payment_metadata is distinct from jsonb_build_object('stage','reconciliation_required','reason',issue)
          or (fulfillment='payment_pending_review' and row_o.status is distinct from 'needs_correction')
          or (fulfillment='cancelled' and row_o.status is distinct from 'cancelled')
          or (fulfillment='paid' and (row_o.payment_status is distinct from 'paid' or row_o.status is distinct from 'payment_confirmed')) then
          raise exception 'Adverse charge observation was not durable';
        end if;
        before_snapshot:=pg_temp.confirmation_snapshot(o);
        perform public.finish_culqi_charge(o,row_o.payment_charge_attempt_id,'uncertain',
          'chr_test_SYNTHETICConfirmCharge','card','{"stage":"reconciliation_required"}');
        if pg_temp.confirmation_snapshot(o) is distinct from before_snapshot then
          raise exception 'Generic finish overwrote adverse observation';
        end if;
        r:=pg_temp.call_confirmation(o);
        if r->>'applied' is distinct from 'false' or r->>'requiresReview' is distinct from 'true' then
          raise exception 'Adverse charge observation was automatically confirmed';
        end if;
      end loop;
    end loop;
  end loop;
end $$;

do $$ declare o uuid:=pg_temp.seed_confirmation('test',5800,false); row_o public.orders%rowtype; r jsonb;
begin
  select * into row_o from public.orders where id=o;
  perform public.finish_culqi_charge(o,row_o.payment_charge_attempt_id,'uncertain',
    'chr_test_SYNTHETICConfirmCharge','card','{"reason":"refund_observed"}');
  perform public.apply_culqi_payment_event('evt_test_SYNTHETICAdverseFirst','charge.creation.succeeded',
    '{"id":"chr_test_SYNTHETICConfirmCharge","amount":5800,"currency":"PEN"}','{}');
  r:=pg_temp.call_confirmation(o);
  if r->>'paymentState' is distinct from 'paid' or r->>'requiresReview' is distinct from 'true'
    or (select payment_reconciliation_reason from public.orders where id=o) is distinct from 'charge_observation_adverse' then
    raise exception 'Webhook after adverse observation lost durable quarantine';
  end if;
end $$;

create function pg_temp.reject_confirmation_history() returns trigger language plpgsql as $$
begin if current_setting('bagelito.fail_confirmation_history',true)='on' then
  raise exception 'synthetic confirmation history failure'; end if; return new; end $$;
create trigger synthetic_confirmation_history_failure before insert on public.order_status_history
for each row execute function pg_temp.reject_confirmation_history();
do $$ declare o uuid:=pg_temp.seed_confirmation(); before_snapshot jsonb;
begin
  before_snapshot:=pg_temp.confirmation_snapshot(o);
  perform set_config('bagelito.fail_confirmation_history','on',true);
  begin
    perform pg_temp.call_confirmation(o);
    raise exception 'History failure did not abort confirmation' using errcode='Z0001';
  exception when sqlstate 'Z0001' then raise;
    when others then if sqlerrm<>'synthetic confirmation history failure' then raise; end if;
  end;
  perform set_config('bagelito.fail_confirmation_history','off',true);
  if pg_temp.confirmation_snapshot(o) is distinct from before_snapshot then
    raise exception 'History failure left partial confirmation effects';
  end if;
end $$;

-- Execute as the application role, proving definer access rather than only ACL metadata.
do $$ declare o uuid:=pg_temp.seed_confirmation(); row_o public.orders%rowtype; r jsonb;
begin
  select * into row_o from public.orders where id=o;
  execute 'set local role service_role';
  r:=public.confirm_culqi_charge_result(o,row_o.checkout_session_id,row_o.payment_charge_attempt_id,
    clock_timestamp(),'culqi_charge_post','test',
    '{"chargeId":"chr_test_SYNTHETICConfirmCharge","sourceId":"tkn_test_SYNTHETICConfirmSource","amountMinor":5800,"currencyCode":"PEN","capture":true,"currentAmountMinor":5800,"amountRefundedMinor":0,"dispute":false,"captureDatePresent":false}');
  execute 'reset role';
  if r->>'paymentState' is distinct from 'paid' then raise exception 'Service definer path failed'; end if;
end $$;
rollback;
\echo 'PASS: charge confirmation exact evidence, provenance/mode, dynamic amounts, ACL/RLS, immutable receipts, refund/expiry/fulfillment protection, webhook idempotence and atomic history'
