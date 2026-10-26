-- PREPARED OPERATION ONLY. Choosing/authorizing a real batch is external.
-- Keep the compatible checkout/status/webhook application and retained core RPCs.
-- Do not revert to main's direct payment DML or set CULQI_ENABLED=false:
-- existing checkouts and authenticated callbacks must remain available.
--
-- In the SAME database session, explicitly set these parameters before running:
--   bagelito.intake_close_batch_id = one canonical UUID selected by the operator
--   bagelito.intake_close_expected_status = orders_open
--   bagelito.intake_close_expected_action = close_one_batch_intake_only
-- These are intention guards, not authorization or project verification.
-- One atomic statement; works in autocommit or inside a reviewed transaction.
-- The batch lock serializes with reservation RPCs and the INSERT trigger. A
-- reservation committed before this lock is acquired remains valid.
-- No orders, deadlines, capacity, attempts, events, credentials or app flags change.
-- Source fingerprints pin corrected expiry and the lock/window trigger bodies
-- from 55994415. A different valid definition requires review of this operation.
do $$
declare
  target_text text := current_setting('bagelito.intake_close_batch_id',true);
  expected_status text := current_setting('bagelito.intake_close_expected_status',true);
  expected_action text := current_setting('bagelito.intake_close_expected_action',true);
  target_id uuid;
  signature text;
  fn regprocedure;
  batch_row public.batches%rowtype;
  changed integer;
  previous_lock_timeout text;
begin
  if expected_action is distinct from 'close_one_batch_intake_only'
    or expected_status is distinct from 'orders_open'
    or (target_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') is not true then
    raise exception using errcode='22023',message='Explicit single-batch intake parameters are required';
  end if;
  target_id := target_text::uuid;
  if not (pg_has_role(current_user,(select c.relowner from pg_catalog.pg_class c
      where c.oid='public.batches'::regclass),'USAGE')
      or pg_has_role(current_user,'service_role','USAGE'))
    or not has_table_privilege(current_user,'public.batches','SELECT')
    or not has_table_privilege(current_user,'public.batches','UPDATE') then
    raise exception using errcode='42501',message='Existing owner or service-role table authorization is required';
  end if;
  if current_setting('session_replication_role') is distinct from 'origin' then
    raise exception using errcode='55000',message='Normal reservation trigger execution is required';
  end if;
  for signature in select unnest(array[
    'public.prepare_culqi_token_session(uuid)',
    'public.claim_culqi_charge(uuid,text,text,boolean)',
    'public.finish_culqi_charge(uuid,uuid,text,text,text,jsonb)',
    'public.apply_culqi_payment_event(text,text,jsonb,jsonb)',
    'public.expire_culqi_token_session(uuid,uuid)'
  ]) loop
    fn := to_regprocedure(signature);
    if fn is null or not exists(select 1 from pg_catalog.pg_proc p
        where p.oid=fn and p.prorettype='jsonb'::regtype and not p.proretset and p.prosecdef) then
      raise exception using errcode='55000',message='Compatible JSONB core RPC contracts are required';
    end if;
    if has_function_privilege('anon',fn,'execute')
      or has_function_privilege('authenticated',fn,'execute')
      or not has_function_privilege('service_role',fn,'execute') then
      raise exception using errcode='55000',message='Core RPC service-role isolation is required';
    end if;
  end loop;
  fn := to_regprocedure('public.create_culqi_reservation_order(text,uuid,uuid,text,text,integer,text,text,text,text,text,text,text,text,boolean,numeric,timestamptz,boolean,jsonb)');
  if fn is null or not exists(select 1 from pg_catalog.pg_proc p
      where p.oid=fn and p.prorettype='record'::regtype and p.proretset and p.prosecdef)
    or has_function_privilege('anon',fn,'execute')
    or has_function_privilege('authenticated',fn,'execute')
    or not has_function_privilege('service_role',fn,'execute') then
    raise exception using errcode='55000',message='Compatible isolated reservation RPC contract is required';
  end if;
  if (select md5(p.prosrc) from pg_catalog.pg_proc p
      where p.oid='public.expire_culqi_token_session(uuid,uuid)'::regprocedure)
        is distinct from 'a30caa42266ee03003897b584acda9b7'
    or (select md5(p.prosrc) from pg_catalog.pg_proc p
      where p.oid=to_regprocedure('public.enforce_reservation_window()'))
        is distinct from '3c27036c0c0ca397f890f56f12fda565'
    or not exists(select 1 from pg_catalog.pg_trigger t
      where t.tgrelid='public.orders'::regclass and t.tgname='orders_reservation_window'
        and t.tgfoid=to_regprocedure('public.enforce_reservation_window()')
        and t.tgtype=7 and not t.tgisinternal and t.tgenabled in ('O','A')) then
    raise exception using errcode='55000',message='Reviewed expiry and enabled reservation lock trigger are required';
  end if;

  previous_lock_timeout := current_setting('lock_timeout');
  perform set_config('lock_timeout','5s',true);
  select * into batch_row from public.batches where id=target_id for update;
  if not found then
    raise exception using errcode='P0002',message='Configured intake batch does not exist';
  end if;
  if batch_row.status is distinct from expected_status then
    raise exception using errcode='55000',message='Intake batch no longer has the expected open status';
  end if;
  update public.batches set status='closed' where id=target_id and status=expected_status;
  get diagnostics changed=row_count;
  if changed is distinct from 1 then
    raise exception using errcode='40001',message='Intake closure did not affect exactly one batch';
  end if;
  perform set_config('lock_timeout',previous_lock_timeout,true);
  raise notice 'Intake closure applied to exactly one batch';
end $$;
