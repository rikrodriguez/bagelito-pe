-- PROPOSED ONLY. No remote installation or approval is authorized here.
-- Run after add-checkout-safety.sql and add-culqi-session-expiry.sql.
-- The net/refund/operation contract is unapproved; every pilot is disabled.
begin;
do $$ begin
  if current_user in ('anon','authenticated','service_role') then
    raise exception 'Charge GET schema requires a trusted migration owner';
  end if;
end $$;

create table if not exists public.culqi_charge_get_confirmation_policy (
  order_code text primary key,
  provider_charge_id text unique not null,
  contract_marker text not null default 'culqi_charge_get_reviewed_net_v1'
    check (contract_marker = 'culqi_charge_get_reviewed_net_v1'),
  enabled boolean not null default false,
  check ((order_code = 'BAG-000001' and provider_charge_id = 'chr_test_WIu0Hn7e9r2MqEue')
    or (order_code = 'BAG-000002' and provider_charge_id = 'chr_test_BGmSf0LA6lKdxdcz')
    or (order_code = 'BAG-000004' and provider_charge_id = 'chr_test_SA3U26iSk7KDn0BI'))
);
insert into public.culqi_charge_get_confirmation_policy(order_code, provider_charge_id)
values ('BAG-000001','chr_test_WIu0Hn7e9r2MqEue'),
  ('BAG-000002','chr_test_BGmSf0LA6lKdxdcz'),
  ('BAG-000004','chr_test_SA3U26iSk7KDn0BI')
on conflict (order_code) do nothing;

create table if not exists public.culqi_charge_get_receipts (
  provider text not null check (provider = 'culqi'),
  provider_charge_id text not null,
  order_id uuid not null references public.orders(id),
  checkout_session_id uuid not null,
  payment_attempt_id uuid not null references public.payment_attempts(id),
  charge_attempt_id uuid not null,
  source_id text not null,
  amount_minor integer not null check (amount_minor = 6600),
  currency_code text not null check (currency_code = 'PEN'),
  policy_order_code text not null references public.culqi_charge_get_confirmation_policy(order_code),
  contract_marker text not null check (contract_marker = 'culqi_charge_get_reviewed_net_v1'),
  provenance text not null default 'culqi_charge_get' check (provenance = 'culqi_charge_get'),
  observed_at timestamptz not null check (isfinite(observed_at)),
  confirmed_at timestamptz not null check (isfinite(confirmed_at)),
  capture boolean not null check (capture),
  current_amount_minor integer not null check (current_amount_minor = amount_minor),
  amount_refunded_minor integer not null check (amount_refunded_minor = 0),
  dispute boolean not null check (not dispute),
  capture_date_present boolean not null,
  applied_confirmation boolean not null,
  primary key (provider, provider_charge_id)
);

-- Service-role BYPASSRLS does not confer table privileges. Only the definer
-- may read policy or write/read receipts; callers cannot approve the policy.
alter table public.culqi_charge_get_confirmation_policy enable row level security;
alter table public.culqi_charge_get_receipts enable row level security;
revoke all on table public.culqi_charge_get_confirmation_policy,
  public.culqi_charge_get_receipts from public, anon, authenticated, service_role;

create or replace function public.confirm_culqi_charge_get(
  p_order_id uuid, p_checkout_session_id uuid, p_payment_attempt_id uuid,
  p_charge_attempt_id uuid, p_contract_marker text, p_observed_at timestamptz,
  p_observation jsonb
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  initial_batch_id uuid;
  o public.orders%rowtype;
  a public.payment_attempts%rowtype;
  receipt public.culqi_charge_get_receipts%rowtype;
  observed_charge text;
  observed_source text;
  decision_at timestamptz;
  next_order_state text;
  next_review boolean;
  next_reason text;
  newly_applied boolean;
  late_payment boolean;
begin
  -- Exact typed evidence, not a provider payload or caller approval flag.
  if p_order_id is null or p_checkout_session_id is null
    or p_payment_attempt_id is null or p_charge_attempt_id is null
    or p_contract_marker is distinct from 'culqi_charge_get_reviewed_net_v1'
    or p_observed_at is null or not isfinite(p_observed_at)
    or jsonb_typeof(p_observation) is distinct from 'object' then
    raise exception 'Invalid charge GET evidence';
  end if;
  if (select count(*) from jsonb_object_keys(p_observation)) <> 9
    or not p_observation ?& array['chargeId','sourceId','amountMinor','currencyCode',
      'capture','currentAmountMinor','amountRefundedMinor','dispute','captureDatePresent']
    or jsonb_typeof(p_observation->'chargeId') is distinct from 'string'
    or jsonb_typeof(p_observation->'sourceId') is distinct from 'string'
    or jsonb_typeof(p_observation->'amountMinor') is distinct from 'number'
    or jsonb_typeof(p_observation->'currentAmountMinor') is distinct from 'number'
    or jsonb_typeof(p_observation->'amountRefundedMinor') is distinct from 'number'
    or jsonb_typeof(p_observation->'currencyCode') is distinct from 'string'
    or p_observation->>'currencyCode' is distinct from 'PEN'
    or p_observation->'amountMinor' is distinct from '6600'::jsonb
    or p_observation->'currentAmountMinor' is distinct from '6600'::jsonb
    or p_observation->'amountRefundedMinor' is distinct from '0'::jsonb
    or p_observation->'capture' is distinct from 'true'::jsonb
    or p_observation->'dispute' is distinct from 'false'::jsonb
    or jsonb_typeof(p_observation->'captureDatePresent') is distinct from 'boolean' then
    raise exception 'Invalid charge GET evidence';
  end if;
  observed_charge := p_observation->>'chargeId';
  observed_source := p_observation->>'sourceId';
  if observed_charge !~ '^chr_test_[A-Za-z0-9_-]{8,100}$'
    or observed_source !~ '^(tkn|ype)_test_[A-Za-z0-9_-]{8,100}$' then
    raise exception 'Invalid charge GET evidence';
  end if;
  -- No writes, receipt or table approval can be requested by an RPC caller.
  if not exists(select 1 from public.culqi_charge_get_confirmation_policy
    where provider_charge_id=observed_charge and contract_marker=p_contract_marker and enabled) then
    return jsonb_build_object('applied',false,'duplicate',false,'requiresReview',true,
      'alreadyPaid',false,'paymentState','unknown','orderState','unknown');
  end if;

  select batch_id into initial_batch_id from public.orders
    where id=p_order_id and checkout_session_id=p_checkout_session_id;
  if not found then raise exception 'Charge GET binding mismatch'; end if;
  perform 1 from public.batches where id=initial_batch_id for update;
  if not found then raise exception 'Charge GET binding mismatch'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.batch_id is distinct from initial_batch_id
    or o.checkout_session_id is distinct from p_checkout_session_id then
    raise exception 'Charge GET binding mismatch';
  end if;
  perform 1 from public.payment_attempts where order_id=o.id and provider='culqi'
    order by id for update;
  select * into a from public.payment_attempts where id=p_payment_attempt_id;
  if not found or a.order_id is distinct from o.id or a.provider is distinct from 'culqi'
    or a.provider_order_id is not null or a.provider_charge_id is distinct from observed_charge
    or a.amount_minor is distinct from 6600 or a.currency_code is distinct from 'PEN'
    or o.payment_provider is distinct from 'culqi' or o.payment_lane is distinct from 'token'
    or o.payment_order_id is not null or o.payment_charge_id is distinct from observed_charge
    or o.payment_charge_attempt_id is distinct from p_charge_attempt_id
    or o.payment_charge_source_id is distinct from observed_source
    or o.payment_amount_minor is distinct from 6600 or o.payment_currency is distinct from 'PEN'
    or o.payment_charge_state is null or o.payment_charge_state not in ('submitted','uncertain')
    or exists(select 1 from public.payment_attempts where order_id=o.id and provider='culqi' and id<>a.id) then
    raise exception 'Charge GET binding mismatch';
  end if;
  perform 1 from public.culqi_charge_get_confirmation_policy
    where order_code=o.order_code and provider_charge_id=observed_charge
      and contract_marker=p_contract_marker and enabled for share;
  if not found then raise exception 'Charge GET binding mismatch'; end if;
  decision_at := clock_timestamp();
  if p_observed_at > decision_at or p_observed_at < decision_at-interval '2 minutes' then
    raise exception 'Invalid charge GET evidence';
  end if;

  select * into receipt from public.culqi_charge_get_receipts
    where provider='culqi' and provider_charge_id=observed_charge for update;
  if found then
    if receipt.order_id is distinct from o.id
      or receipt.checkout_session_id is distinct from p_checkout_session_id
      or receipt.payment_attempt_id is distinct from a.id
      or receipt.charge_attempt_id is distinct from p_charge_attempt_id
      or receipt.source_id is distinct from observed_source
      or receipt.policy_order_code is distinct from o.order_code
      or receipt.contract_marker is distinct from p_contract_marker then
      raise exception 'Charge GET binding mismatch';
    end if;
    -- Never replay a receipt into a later refund/reversal or change fulfillment.
    return jsonb_build_object('applied',false,'duplicate',true,
      'alreadyPaid',o.payment_status='paid',
      'requiresReview',o.payment_reconciliation_required or o.payment_status<>'paid',
      'paymentState',o.payment_status,'orderState',o.status);
  end if;

  newly_applied := o.payment_status is distinct from 'paid';
  if newly_applied and (o.payment_status is distinct from 'pending'
    or o.status is null or o.status not in ('payment_pending_review','needs_correction','cancelled')
    or (o.status='needs_correction' and (o.payment_reconciliation_required is distinct from true
      or o.payment_reconciliation_reason is distinct from 'charge_result_uncertain'))
    or a.status is distinct from 'pending' or a.paid_at is not null
    or o.payment_paid_at is not null
    or o.payment_expires_at is null or not isfinite(o.payment_expires_at)) then
    return jsonb_build_object('applied',false,'duplicate',false,'requiresReview',true,
      'alreadyPaid',false,
      'paymentState',o.payment_status,'orderState',o.status);
  end if;
  if not newly_applied and a.status is distinct from 'paid' then
    return jsonb_build_object('applied',false,'duplicate',false,'requiresReview',true,
      'alreadyPaid',true,
      'paymentState',o.payment_status,'orderState',o.status);
  end if;

  insert into public.culqi_charge_get_receipts(provider,provider_charge_id,order_id,
    checkout_session_id,payment_attempt_id,charge_attempt_id,source_id,amount_minor,
    currency_code,policy_order_code,contract_marker,observed_at,confirmed_at,capture,current_amount_minor,
    amount_refunded_minor,dispute,capture_date_present,applied_confirmation)
  values('culqi',observed_charge,o.id,p_checkout_session_id,a.id,p_charge_attempt_id,
    observed_source,6600,'PEN',o.order_code,p_contract_marker,p_observed_at,decision_at,true,6600,0,false,
    (p_observation->>'captureDatePresent')::boolean,newly_applied);

  if newly_applied then
    late_payment := o.status='cancelled' or o.payment_expires_at<=decision_at
      or coalesce(o.payment_reconciliation_reason in ('payment_expired_with_charge_unresolved','payment_after_reservation_release'),false);
    next_order_state := case when late_payment then 'cancelled' else 'payment_confirmed' end;
    next_review := o.payment_reconciliation_required;
    next_reason := o.payment_reconciliation_reason;
    if late_payment then
      next_review := true;
      next_reason := 'payment_after_reservation_release';
    elsif next_reason='charge_result_uncertain' then
      next_review := false;
      next_reason := null;
    end if;
    update public.orders set payment_status='paid',status=next_order_state,
      payment_charge_state='submitted',payment_paid_at=coalesce(payment_paid_at,decision_at),
      payment_failure_code=null,payment_failure_message=null,
      payment_reconciliation_required=next_review,payment_reconciliation_reason=next_reason
      where id=o.id;
    update public.payment_attempts set status='paid',paid_at=coalesce(paid_at,decision_at),
      failure_code=null,failure_message=null where id=a.id;
    if next_order_state<>o.status then
      insert into public.order_status_history(order_id,old_status,new_status,changed_by)
        values(o.id,o.status,next_order_state,'culqi charge GET');
    end if;
  end if;
  select * into o from public.orders where id=p_order_id;
  return jsonb_build_object('applied',newly_applied,'duplicate',false,'alreadyPaid',not newly_applied,
    'requiresReview',o.payment_reconciliation_required,'paymentState',o.payment_status,'orderState',o.status);
end $$;
revoke all on function public.confirm_culqi_charge_get(uuid,uuid,uuid,uuid,text,timestamptz,jsonb)
  from public,anon,authenticated;
grant execute on function public.confirm_culqi_charge_get(uuid,uuid,uuid,uuid,text,timestamptz,jsonb)
  to service_role;
do $$ begin
  if exists(select 1 from pg_class c join pg_roles r on r.oid=c.relowner
      where c.oid in ('public.culqi_charge_get_confirmation_policy'::regclass,
        'public.culqi_charge_get_receipts'::regclass)
        and r.rolname in ('anon','authenticated','service_role'))
    or exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner
      where p.oid='public.confirm_culqi_charge_get(uuid,uuid,uuid,uuid,text,timestamptz,jsonb)'::regprocedure
        and r.rolname in ('anon','authenticated','service_role')) then
    raise exception 'Charge GET schema requires a trusted migration owner';
  end if;
end $$;

commit;
