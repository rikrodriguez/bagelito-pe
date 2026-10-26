-- Isolated fixture: foundations + checkout-safety + session-expiry only suffice.
-- Executes the REAL prepared operation via \ir, using real core RPCs afterward.
-- Historical main-DML rollback incompatibility was separately rehearsed; this
-- verifies the compatible retained application/RPC contract, not native HTTP,
-- SDK authentication, provider delivery or real deployment configuration.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database() is distinct from 'bagelito_test'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Exact isolated database and explicit test mode are required';
  end if;
end $$;

create temporary table intake_fixture(
  case_name text primary key,batch_id uuid not null,order_id uuid not null,
  checkout_id uuid not null,source_id text not null,charge_id text not null
);
create function pg_temp.intake_seed(p_case text,p_batch uuid default null) returns void language plpgsql as $$
declare b uuid; o uuid; cap uuid := gen_random_uuid();
begin
  b := p_batch;
  if b is null then
    insert into public.batches(name,status,capacity_packs,capacity_bagels,orders_close_at)
      values('SYNTHETIC INTAKE ROLLBACK','orders_open',20,120,
        clock_timestamp()+interval '1 hour') returning id into b;
  end if;
  select r.order_id into o from public.create_culqi_reservation_order(
    'BAG-INTAKE-'||upper(p_case),cap,b,'6-single','Synthetic six',6,'single',
    'Synthetic','000000000','synthetic@example.invalid','Synthetic','Lince',null,null,
    false,58,clock_timestamp()+interval '30 minutes',true,
    '[{"flavor_slug":"synthetic","flavor_name":"Synthetic","quantity":6}]'::jsonb) r;
  perform public.prepare_culqi_token_session(o);
  insert into intake_fixture values(p_case,b,o,cap,
    'tkn_test_intake_'||p_case,'chr_test_intake_'||p_case);
end $$;
create function pg_temp.intake_financial(p_case text) returns jsonb language sql as $$
  select jsonb_build_object(
    'batch',(select to_jsonb(b) from public.batches b where b.id=f.batch_id),
    'order',(select to_jsonb(o) from public.orders o where o.id=f.order_id),
    'attempts',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb)
      from public.payment_attempts a where a.order_id=f.order_id),
    'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.id),'[]'::jsonb)
      from public.order_status_history h where h.order_id=f.order_id),
    'capacity',(select jsonb_build_object('packs',count(*),'bagels',coalesce(sum(o.pack_units),0))
      from public.orders o where o.batch_id=f.batch_id and o.status <> 'cancelled' and not (
        o.payment_provider='culqi' and o.payment_status in ('pending','failed')
        and o.payment_expires_at is not null and o.payment_expires_at <= clock_timestamp())))
  from intake_fixture f where f.case_name=p_case;
$$;
create function pg_temp.intake_events(p_case text) returns jsonb language sql as $$
  select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb)
  from public.payment_webhook_events e where e.provider='culqi'
    and e.provider_order_id=(select charge_id from intake_fixture where case_name=p_case);
$$;
create function pg_temp.intake_parameters(p_case text) returns void language plpgsql as $$
begin
  perform set_config('bagelito.intake_close_batch_id',
    (select batch_id::text from intake_fixture where case_name=p_case),true);
  perform set_config('bagelito.intake_close_expected_status','orders_open',true);
  perform set_config('bagelito.intake_close_expected_action','close_one_batch_intake_only',true);
end $$;
create temporary table intake_before(case_name text primary key,financial jsonb,events jsonb);
do $$
declare result jsonb;
begin
  perform pg_temp.intake_seed('target');
  perform pg_temp.intake_seed('other');
  perform pg_temp.intake_seed('inflight',(select batch_id from intake_fixture where case_name='target'));
  result := public.claim_culqi_charge(
    (select order_id from intake_fixture where case_name='inflight'),
    (select source_id from intake_fixture where case_name='inflight'),'device_synthetic',false);
  if result->>'claimed' is distinct from 'true' then
    raise exception 'Pre-closure inflight fixture did not claim';
  end if;
  perform pg_temp.intake_parameters('target');
  insert into intake_before select case_name,pg_temp.intake_financial(case_name),
    pg_temp.intake_events(case_name) from intake_fixture;
end $$;

-- psql captures the failing operation SQLSTATE BEFORE ROLLBACK overwrites it.
-- Each failure is expected explicitly; ON_ERROR_STOP is restored immediately.
savepoint missing_config;
select set_config('bagelito.intake_close_batch_id','',true) is not null as fixture_parameter_set \gset
\set ON_ERROR_STOP off
\ir ../../../supabase/operations/close-culqi-intake.sql
\set operation_state :SQLSTATE
\set ON_ERROR_STOP on
rollback to savepoint missing_config;
release savepoint missing_config;
select set_config('bagelito.fixture_operation_state',:'operation_state',true) is not null as fixture_state_set \gset
do $$ begin
  if current_setting('bagelito.fixture_operation_state') is distinct from '22023' then
    raise exception 'Missing batch parameter did not fail closed';
  end if;
end $$;

savepoint bad_uuid;
select set_config('bagelito.intake_close_batch_id','not-a-uuid',true) is not null as fixture_parameter_set \gset
\set ON_ERROR_STOP off
\ir ../../../supabase/operations/close-culqi-intake.sql
\set operation_state :SQLSTATE
\set ON_ERROR_STOP on
rollback to savepoint bad_uuid;
release savepoint bad_uuid;
select set_config('bagelito.fixture_operation_state',:'operation_state',true) is not null as fixture_state_set \gset
do $$ begin
  if current_setting('bagelito.fixture_operation_state') is distinct from '22023' then
    raise exception 'Malformed batch parameter did not fail closed';
  end if;
end $$;

savepoint bad_intention;
select set_config('bagelito.intake_close_expected_action','',true) is not null as fixture_parameter_set \gset
\set ON_ERROR_STOP off
\ir ../../../supabase/operations/close-culqi-intake.sql
\set operation_state :SQLSTATE
\set ON_ERROR_STOP on
rollback to savepoint bad_intention;
release savepoint bad_intention;
select set_config('bagelito.fixture_operation_state',:'operation_state',true) is not null as fixture_state_set \gset
do $$ begin
  if current_setting('bagelito.fixture_operation_state') is distinct from '22023' then
    raise exception 'Missing action parameter did not fail closed';
  end if;
end $$;

savepoint missing_expected_status;
select set_config('bagelito.intake_close_expected_status','',true) is not null as fixture_parameter_set \gset
\set ON_ERROR_STOP off
\ir ../../../supabase/operations/close-culqi-intake.sql
\set operation_state :SQLSTATE
\set ON_ERROR_STOP on
rollback to savepoint missing_expected_status;
release savepoint missing_expected_status;
select set_config('bagelito.fixture_operation_state',:'operation_state',true) is not null as fixture_state_set \gset
do $$ begin
  if current_setting('bagelito.fixture_operation_state') is distinct from '22023' then
    raise exception 'Missing expected status did not fail closed';
  end if;
end $$;

savepoint absent_batch;
select set_config('bagelito.intake_close_batch_id',gen_random_uuid()::text,true) is not null as fixture_parameter_set \gset
\set ON_ERROR_STOP off
\ir ../../../supabase/operations/close-culqi-intake.sql
\set operation_state :SQLSTATE
\set ON_ERROR_STOP on
rollback to savepoint absent_batch;
release savepoint absent_batch;
select set_config('bagelito.fixture_operation_state',:'operation_state',true) is not null as fixture_state_set \gset
do $$ begin
  if current_setting('bagelito.fixture_operation_state') is distinct from 'P0002' then
    raise exception 'Absent configured batch did not fail closed';
  end if;
end $$;

savepoint unexpected_status;
update public.batches set status='closed' where id=(select batch_id from intake_fixture where case_name='target');
\set ON_ERROR_STOP off
\ir ../../../supabase/operations/close-culqi-intake.sql
\set operation_state :SQLSTATE
\set ON_ERROR_STOP on
rollback to savepoint unexpected_status;
release savepoint unexpected_status;
select set_config('bagelito.fixture_operation_state',:'operation_state',true) is not null as fixture_state_set \gset
do $$ begin
  if current_setting('bagelito.fixture_operation_state') is distinct from '55000' then
    raise exception 'Unexpected current batch status did not fail closed';
  end if;
end $$;

-- Surgical mutation of the real expiry body models an incompatible migration;
-- it is neither installed persistently nor substituted for the positive test.
savepoint incompatible_expiry;
do $$
declare original text; altered text;
begin
  original := pg_get_functiondef('public.expire_culqi_token_session(uuid,uuid)'::regprocedure);
  altered := regexp_replace(original,'charge_unresolved :=.*?;',
    'charge_unresolved := false;','s');
  if altered is not distinct from original then
    raise exception 'Expiry mutation fixture did not change the function';
  end if;
  execute altered;
end $$;
\set ON_ERROR_STOP off
\ir ../../../supabase/operations/close-culqi-intake.sql
\set operation_state :SQLSTATE
\set ON_ERROR_STOP on
rollback to savepoint incompatible_expiry;
release savepoint incompatible_expiry;
select set_config('bagelito.fixture_operation_state',:'operation_state',true) is not null as fixture_state_set \gset
do $$ begin
  if current_setting('bagelito.fixture_operation_state') is distinct from '55000' then
    raise exception 'Incompatible expiry definition did not fail closed';
  end if;
end $$;

savepoint disabled_trigger;
alter table public.orders disable trigger orders_reservation_window;
\set ON_ERROR_STOP off
\ir ../../../supabase/operations/close-culqi-intake.sql
\set operation_state :SQLSTATE
\set ON_ERROR_STOP on
rollback to savepoint disabled_trigger;
release savepoint disabled_trigger;
select set_config('bagelito.fixture_operation_state',:'operation_state',true) is not null as fixture_state_set \gset
do $$ begin
  if current_setting('bagelito.fixture_operation_state') is distinct from '55000' then
    raise exception 'Disabled reservation trigger did not fail closed';
  end if;
  if exists(select 1 from intake_before b where pg_temp.intake_financial(b.case_name)
      is distinct from b.financial or pg_temp.intake_events(b.case_name) is distinct from b.events) then
    raise exception 'Preflight negative cases changed a batch, payment or marker';
  end if;
  raise notice 'PASS intake preflight: missing/malformed/action/expected-status/absent/status/expiry/trigger fail closed';
end $$;

-- Real operation: no copied DO and no all-batch scope.
\ir ../../../supabase/operations/close-culqi-intake.sql
do $$
declare f intake_fixture%rowtype; before_state jsonb; result jsonb; resource jsonb;
  blocked boolean; events_before jsonb; after_close jsonb;
begin
  select * into strict f from intake_fixture where case_name='target';
  after_close := pg_temp.intake_financial('target');
  before_state := (select financial from intake_before where case_name='target');
  if after_close->'batch'->>'status' is distinct from 'closed'
    or ((after_close->'batch')-'status') is distinct from ((before_state->'batch')-'status')
    or (after_close-'batch') is distinct from (before_state-'batch')
    or pg_temp.intake_financial('other') is distinct from
      (select financial from intake_before where case_name='other')
    or ((pg_temp.intake_financial('inflight')->'batch')-'status') is distinct from
      (((select financial from intake_before where case_name='inflight')->'batch')-'status')
    or (pg_temp.intake_financial('inflight')-'batch') is distinct from
      ((select financial from intake_before where case_name='inflight')-'batch') then
    raise exception 'Intake operation changed more than the selected batch status';
  end if;
  blocked := false;
  begin
    perform public.create_culqi_reservation_order('BAG-INTAKE-NEW-BLOCKED',gen_random_uuid(),f.batch_id,
      '6-single','Synthetic six',6,'single','Synthetic','000000000','synthetic@example.invalid',
      'Synthetic','Lince',null,null,false,58,clock_timestamp()+interval '30 minutes',true,
      '[{"flavor_slug":"synthetic","flavor_name":"Synthetic","quantity":6}]'::jsonb);
  exception when others then
    if sqlerrm is distinct from
      'This Bagelito batch is currently closed. Join the waitlist for the next opening.' then
      raise exception 'Closed new reservation failed for an unexpected reason';
    end if;
    blocked := true;
  end;
  if not blocked or pg_temp.intake_financial('target') is distinct from after_close then
    raise exception 'Closed batch admitted or partially wrote a new reservation';
  end if;
  result := public.claim_culqi_charge(f.order_id,f.source_id,'device_synthetic',false);
  if result->>'claimed' is distinct from 'true' then
    raise exception 'Intake closure blocked an existing valid token claim';
  end if;
  result := public.finish_culqi_charge(f.order_id,(result->>'attempt_id')::uuid,
    'submitted',f.charge_id,'card','{}'::jsonb);
  if result->>'state' is distinct from 'submitted' then
    raise exception 'Intake closure blocked an existing charge result';
  end if;
  -- Status RPC reads a non-expired submitted order without changing it.
  before_state := pg_temp.intake_financial('target');
  result := public.expire_culqi_token_session(f.order_id,f.checkout_id);
  if result->>'paymentStatus' is distinct from 'pending'
    or result->>'reconciliationRequired' is distinct from 'false'
    or pg_temp.intake_financial('target') is distinct from before_state then
    raise exception 'Closed intake changed a valid submitted status read';
  end if;
  resource := jsonb_build_object('id',f.charge_id,'amount',5800,'currency_code','PEN',
    'source',jsonb_build_object('id',f.source_id),
    'metadata',jsonb_build_object('bagelito_order_code',
      (select order_code from public.orders where id=f.order_id)));
  result := public.apply_culqi_payment_event('evt_test_intake_first01',
    'charge.creation.succeeded',resource,'{}'::jsonb);
  if result->>'status' is distinct from 'paid'
    or not exists(select 1 from public.orders o join public.payment_attempts a on a.order_id=o.id
      where o.id=f.order_id and o.payment_status='paid' and o.status='payment_confirmed'
        and not o.payment_reconciliation_required and o.payment_charge_id=f.charge_id
        and a.status='paid' and a.provider_charge_id=f.charge_id
        and a.paid_at is not null and a.paid_at=o.payment_paid_at)
    or pg_temp.intake_financial('target')->'capacity' is distinct from '{"packs":2,"bagels":12}'::jsonb then
    raise exception 'Closed intake did not settle the existing charge atomically';
  end if;
  before_state := pg_temp.intake_financial('target');
  events_before := pg_temp.intake_events('target');
  result := public.apply_culqi_payment_event('evt_test_intake_first01',
    'charge.creation.succeeded',resource,'{}'::jsonb);
  if result is distinct from '{"duplicate":true}'::jsonb
    or pg_temp.intake_financial('target') is distinct from before_state
    or pg_temp.intake_events('target') is distinct from events_before then
    raise exception 'Processed event replay changed money, history or marker dates';
  end if;
  result := public.apply_culqi_payment_event('evt_test_intake_second02',
    'charge.creation.succeeded',resource,'{}'::jsonb);
  if result->>'status' is distinct from 'paid'
    or pg_temp.intake_financial('target') is distinct from before_state
    or jsonb_array_length(pg_temp.intake_events('target')) <> jsonb_array_length(events_before)+1 then
    raise exception 'Distinct same-charge event changed financial state';
  end if;
  result := public.claim_culqi_charge(f.order_id,'tkn_test_intake_second_claim','device_synthetic',false);
  if result->>'claimed' is distinct from 'false' or result->>'state' is distinct from 'paid'
    or pg_temp.intake_financial('target') is distinct from before_state
    or pg_temp.intake_financial('other') is distinct from
      (select financial from intake_before where case_name='other') then
    raise exception 'Paid replay allowed a fresh claim or affected another batch';
  end if;
  raise notice 'PASS compatible intake: only selected status closed; existing claim/finish/status/event remain usable';
  raise notice 'PASS intake idempotency: same event markers and same-charge finances preserved';
end $$;

-- A request already submitting before closure can finish uncertain afterward.
-- A synthetic elapsed deadline then quarantines, and a late success records
-- payment without reopening/re-reserving fulfillment. No provider request occurs.
do $$
declare f intake_fixture%rowtype; result jsonb; resource jsonb;
  before_state jsonb; events_before jsonb; claim_id uuid;
begin
  select * into strict f from intake_fixture where case_name='inflight';
  select payment_charge_attempt_id into claim_id from public.orders where id=f.order_id;
  result := public.finish_culqi_charge(f.order_id,claim_id,'uncertain',null,'card','{}'::jsonb);
  if result->>'state' is distinct from 'uncertain' then
    raise exception 'Intake closure blocked the inflight uncertain result';
  end if;
  update public.orders set payment_expires_at=clock_timestamp()-interval '1 minute'
    where id=f.order_id;
  update public.payment_attempts set expires_at=clock_timestamp()-interval '1 minute'
    where order_id=f.order_id;
  before_state := pg_temp.intake_financial('inflight');
  result := public.expire_culqi_token_session(f.order_id,f.checkout_id);
  if result->>'paymentStatus' is distinct from 'pending'
    or result->>'reconciliationRequired' is distinct from 'true'
    or result->>'expired' is distinct from 'false'
    or pg_temp.intake_financial('inflight') is distinct from before_state then
    raise exception 'Corrected expiry did not preserve the inflight uncertain claim';
  end if;
  resource := jsonb_build_object('id',f.charge_id,'amount',5800,'currency_code','PEN',
    'source',jsonb_build_object('id',f.source_id),
    'metadata',jsonb_build_object('bagelito_order_code',
      (select order_code from public.orders where id=f.order_id)));
  result := public.apply_culqi_payment_event('evt_test_intake_late_first',
    'charge.creation.succeeded',resource,'{}'::jsonb);
  if result->>'status' is distinct from 'paid'
    or not exists(select 1 from public.orders o join public.payment_attempts a on a.order_id=o.id
      where o.id=f.order_id and o.payment_status='paid' and o.status='cancelled'
        and o.payment_reconciliation_required
        and o.payment_reconciliation_reason='payment_after_reservation_release'
        and o.payment_charge_attempt_id=claim_id and o.payment_charge_source_id=f.source_id
        and o.payment_charge_id=f.charge_id and a.status='paid' and a.provider_charge_id=f.charge_id
        and a.paid_at is not null and a.paid_at=o.payment_paid_at)
    or pg_temp.intake_financial('inflight')->'capacity' is distinct from '{"packs":1,"bagels":6}'::jsonb then
    raise exception 'Late inflight payment was not paid/cancelled/review without capacity';
  end if;
  before_state := pg_temp.intake_financial('inflight');
  events_before := pg_temp.intake_events('inflight');
  result := public.apply_culqi_payment_event('evt_test_intake_late_first',
    'charge.creation.succeeded',resource,'{}'::jsonb);
  if result is distinct from '{"duplicate":true}'::jsonb
    or pg_temp.intake_financial('inflight') is distinct from before_state
    or pg_temp.intake_events('inflight') is distinct from events_before then
    raise exception 'Processed late-event replay changed financial state or marker';
  end if;
  result := public.apply_culqi_payment_event('evt_test_intake_late_second',
    'charge.creation.succeeded',resource,'{}'::jsonb);
  if result->>'status' is distinct from 'paid'
    or pg_temp.intake_financial('inflight') is distinct from before_state
    or jsonb_array_length(pg_temp.intake_events('inflight')) <> jsonb_array_length(events_before)+1
    or pg_temp.intake_financial('other') is distinct from
      (select financial from intake_before where case_name='other') then
    raise exception 'Same-charge late replay changed cancelled finances or the other batch';
  end if;
  raise notice 'PASS pre-existing inflight: uncertain expiry preserved; late payment paid/cancelled/review with no capacity';
end $$;
rollback;
