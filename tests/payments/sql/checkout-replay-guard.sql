-- Synthetic PostgreSQL regression; root runs it in the isolated test runner.
\ir checkout-replay-guard-helpers.sql
begin;
do $$ declare o uuid; saved jsonb; result jsonb; attempt uuid; source_id text; checkout uuid;
begin
  -- Behavioral RED: without the forward guard this UPDATE succeeds and the test fails.
  o := pg_temp.seed_checkout_replay_guard('Reason');
  saved := pg_temp.checkout_replay_guard_snapshot();
  begin
    update public.orders set payment_reconciliation_required=true,
      payment_reconciliation_reason='legacy_payment_outcome_unknown' where id=o;
    raise exception 'Expected checkout evidence overwrite rejection' using errcode='Z0001';
  exception when sqlstate '23514' then
    if sqlerrm <> 'Checkout safety replay would overwrite reconciliation evidence' then raise; end if;
  end;
  if saved is distinct from pg_temp.checkout_replay_guard_snapshot() then
    raise exception 'Rejected evidence overwrite changed data or DDL';
  end if;

  o := pg_temp.seed_checkout_replay_guard('Promotion','uncertain',true);
  saved := pg_temp.checkout_replay_guard_snapshot();
  begin
    update public.orders set payment_charge_state='submitted' where id=o;
    raise exception 'Expected uncertain promotion rejection' using errcode='Z0001';
  exception when sqlstate '23514' then
    if sqlerrm <> 'Checkout safety replay would promote an uncertain charge' then raise; end if;
  end;
  if saved is distinct from pg_temp.checkout_replay_guard_snapshot() then
    raise exception 'Rejected uncertain promotion changed data or DDL';
  end if;

  -- A missing token reason is not evidence that this is a legacy order.
  o := pg_temp.seed_checkout_replay_guard('NullReason');
  update public.orders set payment_reconciliation_reason=null where id=o;
  saved := pg_temp.checkout_replay_guard_snapshot();
  begin
    update public.orders set payment_reconciliation_reason='legacy_payment_outcome_unknown' where id=o;
    raise exception 'Expected token legacy classification rejection' using errcode='Z0001';
  exception when sqlstate '23514' then
    if sqlerrm <> 'Checkout safety replay would overwrite reconciliation evidence' then raise; end if;
  end;
  if saved is distinct from pg_temp.checkout_replay_guard_snapshot() then
    raise exception 'Rejected token classification changed data or DDL';
  end if;

  -- True legacy classification with no previous reason remains possible.
  o := pg_temp.seed_checkout_replay_guard('Legacy');
  update public.orders set payment_lane='legacy',payment_reconciliation_reason=null where id=o;
  update public.orders set payment_reconciliation_reason='legacy_payment_outcome_unknown' where id=o;
  update public.orders set payment_reconciliation_reason='known_pending_refund' where id=o;
  saved := pg_temp.checkout_replay_guard_snapshot();
  begin
    update public.orders set payment_reconciliation_reason='legacy_payment_outcome_unknown' where id=o;
    raise exception 'Expected legacy evidence overwrite rejection' using errcode='Z0001';
  exception when sqlstate '23514' then
    if sqlerrm <> 'Checkout safety replay would overwrite reconciliation evidence' then raise; end if;
  end;
  if saved is distinct from pg_temp.checkout_replay_guard_snapshot() then
    raise exception 'Rejected legacy evidence overwrite changed data or DDL';
  end if;

  -- Normal charge completion and exact 3DS continuation remain allowed.
  o := pg_temp.seed_checkout_replay_guard('Normal','submitting');
  select payment_charge_attempt_id into attempt from public.orders where id=o;
  result := public.finish_culqi_charge(o,attempt,'submitted','chr_test_SYNTHETICReplayNormal','card','{}');
  if result->>'state' is distinct from 'submitted' then raise exception 'Normal completion was blocked'; end if;
  o := pg_temp.seed_checkout_replay_guard('ThreeDS','requires_3ds');
  result := public.claim_culqi_charge(o,'tkn_test_SYNTHETICReplayGuardThreeDS','device_synthetic',true);
  if result->>'claimed' is distinct from 'true' then raise exception 'Legitimate 3DS continuation was blocked'; end if;
  result := public.finish_culqi_charge(o,(result->>'attempt_id')::uuid,'submitted','chr_test_SYNTHETICReplayThreeDS','card','{}');
  if result->>'state' is distinct from 'submitted' then raise exception '3DS completion was blocked'; end if;

  -- Trusted event RPC settles a genuinely uncertain charge and clears only its own reason.
  o := pg_temp.seed_checkout_replay_guard('Paid','uncertain',true);
  select payment_charge_source_id into source_id from public.orders where id=o;
  result := public.apply_culqi_payment_event('evt_test_SYNTHETICReplayPaid','charge.creation.succeeded',
    jsonb_build_object('id','chr_test_SYNTHETICReplayGuardPaid','amount',6600,'currency_code','PEN',
      'source',jsonb_build_object('id',source_id)),'{}');
  if result->>'status' is distinct from 'paid' or not exists(select 1 from public.orders where id=o
      and payment_status='paid' and status='payment_confirmed' and payment_charge_state='submitted'
      and not payment_reconciliation_required and payment_reconciliation_reason is null) then
    raise exception 'Verified payment settlement was blocked or corrupted';
  end if;
  saved := pg_temp.checkout_replay_guard_snapshot();
  result := public.apply_culqi_payment_event('evt_test_SYNTHETICReplayPaid','charge.creation.succeeded',
    jsonb_build_object('id','chr_test_SYNTHETICReplayGuardPaid','amount',6600,'currency_code','PEN'),'{}');
  if result->>'duplicate' is distinct from 'true' or saved is distinct from pg_temp.checkout_replay_guard_snapshot() then
    raise exception 'Duplicate verified event changed protected data';
  end if;

  o := pg_temp.seed_checkout_replay_guard('Failed','uncertain',true);
  select payment_charge_source_id into source_id from public.orders where id=o;
  perform public.apply_culqi_payment_event('evt_test_SYNTHETICReplayFailed','charge.creation.failed',
    jsonb_build_object('id','chr_test_SYNTHETICReplayGuardFailed','amount',6600,'currency_code','PEN',
      'source',jsonb_build_object('id',source_id)),'{}');
  if not exists(select 1 from public.orders where id=o and payment_status='failed'
      and status='needs_correction' and payment_charge_state='idle' and payment_charge_id is null
      and payment_charge_attempt_id is null and not payment_reconciliation_required
      and payment_reconciliation_reason is null) then
    raise exception 'Verified failure release was blocked or corrupted';
  end if;

  -- Expiry preserves an authentic reason and claim; a fresh claim stays blocked.
  o := pg_temp.seed_checkout_replay_guard('Expiry');
  select payment_charge_attempt_id,checkout_session_id into attempt,checkout from public.orders where id=o;
  update public.orders set payment_expires_at=clock_timestamp()-interval '1 minute' where id=o;
  result := public.expire_culqi_token_session(o,checkout);
  if result->>'expired' is distinct from 'false' or not exists(select 1 from public.orders where id=o
      and payment_status='pending' and payment_charge_state='uncertain'
      and payment_reconciliation_reason='charge_result_uncertain' and payment_charge_attempt_id=attempt) then
    raise exception 'Uncertain expiry lost authentic evidence';
  end if;
  result := public.claim_culqi_charge(o,'tkn_test_SYNTHETICReplayFresh','device_synthetic',false);
  if result->>'claimed' is distinct from 'false' then raise exception 'Expired uncertain charge was retried'; end if;
  o := pg_temp.seed_checkout_replay_guard('IdleExpiry','idle');
  select checkout_session_id into checkout from public.orders where id=o;
  update public.orders set payment_expires_at=clock_timestamp()-interval '1 minute' where id=o;
  result := public.expire_culqi_token_session(o,checkout);
  if result->>'expired' is distinct from 'true' or not exists(select 1 from public.orders where id=o
      and payment_status='expired' and status='cancelled') then raise exception 'Safe idle expiry was blocked'; end if;

  -- Verified late payment still stays cancelled and requires manual review.
  o := pg_temp.seed_checkout_replay_guard('Late','uncertain',true);
  select payment_charge_source_id into source_id from public.orders where id=o;
  update public.orders set status='cancelled',payment_expires_at=clock_timestamp()-interval '1 minute' where id=o;
  perform public.apply_culqi_payment_event('evt_test_SYNTHETICReplayLate','charge.creation.succeeded',
    jsonb_build_object('id','chr_test_SYNTHETICReplayGuardLate','amount',6600,'currency_code','PEN',
      'source',jsonb_build_object('id',source_id)),'{}');
  if not exists(select 1 from public.orders where id=o and payment_status='paid' and status='cancelled'
      and payment_charge_state='submitted' and payment_reconciliation_required
      and payment_reconciliation_reason='payment_after_reservation_release') then
    raise exception 'Late verified payment did not retain its quarantine';
  end if;
  update public.orders set payment_reconciliation_reason='known_pending_refund' where id=o;
  if not exists(select 1 from public.orders where id=o and payment_reconciliation_reason='known_pending_refund') then
    raise exception 'Legitimate manual review reason was blocked';
  end if;
end $$;

do $$ declare f regprocedure := to_regprocedure('public.guard_culqi_checkout_replay()');
begin
  if f is null or not exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass
      and tgname='orders_culqi_checkout_replay_guard' and tgfoid=f::oid and tgenabled='O') then
    raise exception 'Checkout replay trigger is missing or disabled';
  end if;
  if exists(select 1 from pg_proc where oid=f::oid and (prosecdef or proconfig is distinct from array['search_path=pg_catalog']))
    or has_function_privilege('anon',f,'execute') or has_function_privilege('authenticated',f,'execute')
    or has_function_privilege('service_role',f,'execute') then
    raise exception 'Checkout replay guard exposed an executable or privileged function';
  end if;
end $$;
rollback;
\echo PASS checkout replay guard adversarial and legitimate transitions
