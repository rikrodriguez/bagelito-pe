-- PROPOSED ONLY. Install before code that calls this RPC, after the retained
-- checkout-safety and session-expiry core. No remote operation is authorized.
-- Service-only reduced observations; this function never contacts Culqi and
-- does not authenticate a provider response on its own. The server must do so.
-- POST and GET provenance are distinct; no QA policy, pilot or webhook is made.
begin;
do $$ begin
  if current_user in ('anon','authenticated','service_role') then
    raise exception 'Charge confirmation schema requires a trusted migration owner';
  end if;
end $$;

create table if not exists public.culqi_charge_confirmation_receipts (
  provider text not null check (provider='culqi'),
  provider_charge_id text not null,
  order_id uuid not null references public.orders(id),
  checkout_session_id uuid not null,
  payment_attempt_id uuid not null references public.payment_attempts(id),
  charge_attempt_id uuid not null,
  source_id text not null,
  amount_minor integer not null check (amount_minor>0),
  currency_code text not null check (currency_code='PEN'),
  contract_marker text not null check (contract_marker='culqi_charge_result_net_v1'),
  provenance text not null check (provenance in ('culqi_charge_post','culqi_charge_get')),
  mode text not null check (mode in ('test','live')),
  observed_at timestamptz not null check (isfinite(observed_at)),
  confirmed_at timestamptz not null check (isfinite(confirmed_at) and confirmed_at>=observed_at),
  capture boolean not null check (capture),
  current_amount_minor integer not null check (current_amount_minor=amount_minor),
  amount_refunded_minor integer not null check (amount_refunded_minor=0),
  dispute boolean not null check (not dispute),
  capture_date_present boolean not null,
  applied_confirmation boolean not null,
  primary key (provider,provider_charge_id),
  unique (order_id,charge_attempt_id),
  check (provider_charge_id ~ ('^chr_'||mode||'_[A-Za-z0-9_-]{8,100}$')),
  check (source_id ~ ('^(tkn|ype)_'||mode||'_[A-Za-z0-9_-]{8,100}$'))
);

alter table public.culqi_charge_confirmation_receipts enable row level security;
-- BYPASSRLS is not table authorization: callers cannot manufacture receipts.
revoke all on table public.culqi_charge_confirmation_receipts
  from public,anon,authenticated,service_role;

-- Retain the core signature and normal finish path. Only three explicit
-- adverse observations receive durable quarantine rather than timeout review.
create or replace function public.finish_culqi_charge(
  p_order_id uuid,p_attempt_id uuid,p_state text,p_charge_id text,
  p_method text,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  o public.orders%rowtype;
  initial_batch_id uuid;
  adverse_issue text;
  reduced_observation jsonb;
  next_status text;
begin
  if p_state not in ('requires_3ds','submitted','uncertain') then raise exception 'Invalid charge state'; end if;
  if p_state='uncertain' and jsonb_typeof(p_payload)='object'
    and p_payload->>'reason' in ('refund_observed','dispute_observed','current_amount_mismatch') then
    adverse_issue:=p_payload->>'reason';
  end if;
  if adverse_issue is not null then
    select batch_id into initial_batch_id from public.orders where id=p_order_id;
    if not found then raise exception 'Stale charge attempt'; end if;
    perform 1 from public.batches where id=initial_batch_id for update;
    if not found then raise exception 'Stale charge attempt'; end if;
    select * into o from public.orders where id=p_order_id for update;
    if not found or o.batch_id is distinct from initial_batch_id
      or o.payment_charge_attempt_id is distinct from p_attempt_id then
      raise exception 'Stale charge attempt';
    end if;
    perform 1 from public.payment_attempts where order_id=o.id and provider='culqi' order by id for update;
    if o.payment_charge_id is not null and p_charge_id is not null and o.payment_charge_id<>p_charge_id then
      raise exception 'Conflicting charge identity';
    end if;
    if exists(select 1 from public.payment_attempts where order_id=o.id and provider='culqi'
      and provider_order_id is null and provider_charge_id is not null and p_charge_id is not null
      and provider_charge_id<>p_charge_id) then raise exception 'Conflicting charge identity'; end if;
    reduced_observation:=jsonb_build_object('stage','reconciliation_required','reason',adverse_issue);
    next_status:=case when o.payment_status='pending' and o.status in ('payment_pending_review','needs_correction')
      then 'needs_correction' else o.status end;
    update public.orders set status=next_status,
      payment_charge_state=case when payment_status<>'paid' and payment_charge_state='submitting'
        then 'uncertain' else payment_charge_state end,
      payment_charge_id=coalesce(p_charge_id,payment_charge_id),
      payment_metadata=reduced_observation,payment_reconciliation_required=true,
      payment_reconciliation_reason=case when payment_reconciliation_reason is null
        or payment_reconciliation_reason='charge_result_uncertain' then 'charge_observation_adverse'
        else payment_reconciliation_reason end where id=o.id;
    update public.payment_attempts set provider_charge_id=coalesce(p_charge_id,provider_charge_id),
      payment_method=p_method,provider_payload=reduced_observation
      where provider='culqi' and order_id=o.id and provider_order_id is null;
    if not found then raise exception 'Payment attempt not found'; end if;
    if next_status<>o.status then
      insert into public.order_status_history(order_id,old_status,new_status,changed_by)
        values(o.id,o.status,next_status,'culqi charge observation');
    end if;
    select * into o from public.orders where id=p_order_id;
    return jsonb_build_object('state',case when o.payment_status='paid' then 'paid' else o.payment_charge_state end);
  end if;

  -- Retain core behavior for 3DS, submitted and generic unknown results, while
  -- preserving a durable review that arrived during provider I/O.
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.payment_charge_attempt_id is distinct from p_attempt_id then raise exception 'Stale charge attempt'; end if;
  if o.payment_status='paid' then return jsonb_build_object('state','paid'); end if;
  if o.payment_charge_state<>'submitting' then return jsonb_build_object('state',o.payment_charge_state); end if;
  if p_state='submitted' and coalesce(p_charge_id,'')='' then raise exception 'Charge ID required'; end if;
  if o.payment_charge_id is not null and p_charge_id is not null and o.payment_charge_id<>p_charge_id then
    raise exception 'Conflicting charge identity';
  end if;
  update public.orders set payment_charge_state=p_state,payment_charge_id=coalesce(p_charge_id,payment_charge_id),
    payment_metadata=p_payload,payment_reconciliation_required=payment_reconciliation_required or p_state='uncertain',
    payment_reconciliation_reason=case when p_state='uncertain'
      and (payment_reconciliation_reason is null or payment_reconciliation_reason='charge_result_uncertain')
      then 'charge_result_uncertain' else payment_reconciliation_reason end
    where id=o.id;
  update public.payment_attempts set provider_charge_id=coalesce(p_charge_id,provider_charge_id),
    payment_method=p_method,provider_payload=p_payload
    where provider='culqi' and order_id=o.id and provider_order_id is null;
  if not found then raise exception 'Payment attempt not found'; end if;
  return jsonb_build_object('state',p_state);
end $$;
revoke all on function public.finish_culqi_charge(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.finish_culqi_charge(uuid,uuid,text,text,text,jsonb) to service_role;

create or replace function public.confirm_culqi_charge_result(
  p_order_id uuid,
  p_checkout_session_id uuid,
  p_charge_attempt_id uuid,
  p_observed_at timestamptz,
  p_provenance text,
  p_mode text,
  p_observation jsonb
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  initial_batch_id uuid;
  o public.orders%rowtype;
  a public.payment_attempts%rowtype;
  receipt public.culqi_charge_confirmation_receipts%rowtype;
  attempt_count integer;
  observed_charge text;
  observed_source text;
  observed_amount numeric;
  decision_at timestamptz;
  newly_applied boolean;
  late_payment boolean;
  adverse_observed boolean;
  next_order_state text;
  next_review boolean;
  next_reason text;
begin
  if p_order_id is null or p_checkout_session_id is null or p_charge_attempt_id is null
    or p_observed_at is null or not isfinite(p_observed_at)
    or p_provenance is null or p_provenance not in ('culqi_charge_post','culqi_charge_get')
    or p_mode is null or p_mode not in ('test','live')
    or jsonb_typeof(p_observation) is distinct from 'object' then
    raise exception 'Invalid charge confirmation evidence';
  end if;
  if (select count(*) from jsonb_object_keys(p_observation))<>9
    or not p_observation ?& array['chargeId','sourceId','amountMinor','currencyCode',
      'capture','currentAmountMinor','amountRefundedMinor','dispute','captureDatePresent']
    or jsonb_typeof(p_observation->'chargeId') is distinct from 'string'
    or jsonb_typeof(p_observation->'sourceId') is distinct from 'string'
    or jsonb_typeof(p_observation->'amountMinor') is distinct from 'number'
    or jsonb_typeof(p_observation->'currentAmountMinor') is distinct from 'number'
    or jsonb_typeof(p_observation->'amountRefundedMinor') is distinct from 'number'
    or jsonb_typeof(p_observation->'currencyCode') is distinct from 'string'
    or p_observation->>'currencyCode' is distinct from 'PEN'
    or p_observation->'capture' is distinct from 'true'::jsonb
    or p_observation->'amountRefundedMinor' is distinct from '0'::jsonb
    or p_observation->'dispute' is distinct from 'false'::jsonb
    or jsonb_typeof(p_observation->'captureDatePresent') is distinct from 'boolean' then
    raise exception 'Invalid charge confirmation evidence';
  end if;
  observed_amount:=(p_observation->>'amountMinor')::numeric;
  if observed_amount<=0 or observed_amount>2147483647 or trunc(observed_amount)<>observed_amount
    or p_observation->'currentAmountMinor' is distinct from p_observation->'amountMinor' then
    raise exception 'Invalid charge confirmation evidence';
  end if;
  observed_charge:=p_observation->>'chargeId';
  observed_source:=p_observation->>'sourceId';
  if observed_charge !~ ('^chr_'||p_mode||'_[A-Za-z0-9_-]{8,100}$')
    or observed_source !~ ('^(tkn|ype)_'||p_mode||'_[A-Za-z0-9_-]{8,100}$') then
    raise exception 'Invalid charge confirmation evidence';
  end if;

  -- Discover without an order lock, then use the reservation/webhook order:
  -- batch -> order -> all provider attempts in stable ID order.
  select batch_id into initial_batch_id from public.orders
    where id=p_order_id and checkout_session_id=p_checkout_session_id;
  if not found then raise exception 'Charge confirmation binding mismatch'; end if;
  perform 1 from public.batches where id=initial_batch_id for update;
  if not found then raise exception 'Charge confirmation binding mismatch'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.batch_id is distinct from initial_batch_id
    or o.checkout_session_id is distinct from p_checkout_session_id then
    raise exception 'Charge confirmation binding mismatch';
  end if;
  perform 1 from public.payment_attempts where order_id=o.id and provider='culqi'
    order by id for update;
  get diagnostics attempt_count=row_count;
  select * into a from public.payment_attempts
    where order_id=o.id and provider='culqi' and provider_order_id is null;
  if not found or attempt_count<>1
    or a.provider_charge_id is distinct from observed_charge
    or a.amount_minor::numeric is distinct from observed_amount or a.currency_code is distinct from 'PEN'
    or o.payment_provider is distinct from 'culqi' or o.payment_lane is distinct from 'token'
    or o.payment_order_id is not null or o.payment_charge_id is distinct from observed_charge
    or o.payment_charge_attempt_id is distinct from p_charge_attempt_id
    or o.payment_charge_source_id is distinct from observed_source
    or o.payment_amount_minor::numeric is distinct from observed_amount
    or o.total_amount is null or o.total_amount::text in ('NaN','Infinity','-Infinity')
    or round(o.total_amount*100) is distinct from observed_amount
    or o.order_code is null or o.order_code !~ '^BAG-[A-Z0-9_-]{1,80}$'
    or o.payment_currency is distinct from 'PEN'
    or o.payment_charge_state is null or o.payment_charge_state not in ('submitted','uncertain') then
    raise exception 'Charge confirmation binding mismatch';
  end if;
  -- Waiting for another financial operation cannot preserve stale observation
  -- freshness or reservation deadlines from transaction-start time.
  decision_at:=clock_timestamp();
  if p_observed_at>decision_at or p_observed_at<decision_at-interval '30 seconds' then
    raise exception 'Invalid charge confirmation evidence';
  end if;
  adverse_observed:=coalesce(o.payment_reconciliation_reason='charge_observation_adverse'
    or (o.payment_metadata->>'stage'='reconciliation_required' and o.payment_metadata->>'reason' in
      ('refund_observed','dispute_observed','current_amount_mismatch')),false);

  select * into receipt from public.culqi_charge_confirmation_receipts
    where provider='culqi' and provider_charge_id=observed_charge for update;
  if found then
    if receipt.order_id is distinct from o.id
      or receipt.checkout_session_id is distinct from p_checkout_session_id
      or receipt.payment_attempt_id is distinct from a.id
      or receipt.charge_attempt_id is distinct from p_charge_attempt_id
      or receipt.source_id is distinct from observed_source
      or receipt.amount_minor::numeric is distinct from observed_amount
      or receipt.currency_code is distinct from 'PEN' or receipt.mode is distinct from p_mode
      or receipt.contract_marker is distinct from 'culqi_charge_result_net_v1' then
      raise exception 'Charge confirmation binding mismatch';
    end if;
    -- Preserve the first POST/GET provenance and all current refund/fulfillment
    -- state. A later observation cannot replay a receipt into a new transition.
    return jsonb_build_object('applied',false,'duplicate',true,'alreadyPaid',o.payment_status='paid',
      'requiresReview',o.payment_reconciliation_required or o.payment_status<>'paid' or adverse_observed
        or coalesce(o.payment_reconciliation_reason in
          ('known_pending_refund','known_completed_refund','known_refund_unknown','charge_observation_adverse'),false),
      'paymentState',o.payment_status,'orderState',o.status);
  end if;

  newly_applied:=o.payment_status is distinct from 'paid';
  -- A trusted refund observation supersedes a prior capture, even if a legacy
  -- row's review flag is inconsistent. Do not create a new receipt in that case.
  if adverse_observed or coalesce(o.payment_reconciliation_reason in
    ('known_pending_refund','known_completed_refund','known_refund_unknown','charge_observation_adverse'),false) then
    return jsonb_build_object('applied',false,'duplicate',false,'alreadyPaid',not newly_applied,
      'requiresReview',true,'paymentState',o.payment_status,'orderState',o.status);
  end if;
  if newly_applied and (o.payment_status is distinct from 'pending'
    or o.status is null or o.status not in ('payment_pending_review','needs_correction','cancelled')
    or (o.status='needs_correction' and (o.payment_reconciliation_required is distinct from true
      or o.payment_reconciliation_reason is distinct from 'charge_result_uncertain'))
    or a.status is distinct from 'pending' or a.paid_at is not null or o.payment_paid_at is not null
    or o.payment_expires_at is null or not isfinite(o.payment_expires_at)
    or a.expires_at is null or not isfinite(a.expires_at)) then
    return jsonb_build_object('applied',false,'duplicate',false,'alreadyPaid',false,
      'requiresReview',true,'paymentState',o.payment_status,'orderState',o.status);
  end if;
  if not newly_applied and a.status is distinct from 'paid' then
    return jsonb_build_object('applied',false,'duplicate',false,'alreadyPaid',true,
      'requiresReview',true,'paymentState',o.payment_status,'orderState',o.status);
  end if;

  insert into public.culqi_charge_confirmation_receipts(provider,provider_charge_id,order_id,
    checkout_session_id,payment_attempt_id,charge_attempt_id,source_id,amount_minor,currency_code,
    contract_marker,provenance,mode,observed_at,confirmed_at,capture,current_amount_minor,
    amount_refunded_minor,dispute,capture_date_present,applied_confirmation)
  values('culqi',observed_charge,o.id,p_checkout_session_id,a.id,p_charge_attempt_id,observed_source,
    observed_amount::integer,'PEN','culqi_charge_result_net_v1',p_provenance,p_mode,p_observed_at,
    decision_at,true,observed_amount::integer,0,false,
    (p_observation->>'captureDatePresent')::boolean,newly_applied);

  if newly_applied then
    late_payment:=o.status='cancelled' or o.payment_expires_at<=decision_at or a.expires_at<=decision_at
      or coalesce(o.payment_reconciliation_reason in
        ('payment_expired_with_charge_unresolved','payment_after_reservation_release'),false)
      or exists(select 1 from public.order_status_history where order_id=o.id and new_status='cancelled');
    next_order_state:=case when late_payment then 'cancelled' else 'payment_confirmed' end;
    next_review:=o.payment_reconciliation_required;
    next_reason:=o.payment_reconciliation_reason;
    if late_payment then
      next_review:=true;
      next_reason:='payment_after_reservation_release';
    elsif next_reason='charge_result_uncertain' then
      next_review:=false;
      next_reason:=null;
    end if;
    update public.orders set payment_status='paid',status=next_order_state,
      payment_charge_state='submitted',payment_paid_at=coalesce(payment_paid_at,decision_at),
      payment_failure_code=null,payment_failure_message=null,
      payment_reconciliation_required=next_review,payment_reconciliation_reason=next_reason where id=o.id;
    update public.payment_attempts set status='paid',paid_at=coalesce(paid_at,decision_at),
      failure_code=null,failure_message=null where id=a.id;
    if next_order_state<>o.status then
      insert into public.order_status_history(order_id,old_status,new_status,changed_by)
        values(o.id,o.status,next_order_state,
          case when p_provenance='culqi_charge_post' then 'culqi charge POST' else 'culqi charge GET' end);
    end if;
  end if;
  select * into o from public.orders where id=p_order_id;
  return jsonb_build_object('applied',newly_applied,'duplicate',false,'alreadyPaid',not newly_applied,
    'requiresReview',o.payment_reconciliation_required,'paymentState',o.payment_status,'orderState',o.status);
end $$;

revoke all on function public.confirm_culqi_charge_result(uuid,uuid,uuid,timestamptz,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.confirm_culqi_charge_result(uuid,uuid,uuid,timestamptz,text,text,jsonb)
  to service_role;
do $$ begin
  if exists(select 1 from pg_class c join pg_roles r on r.oid=c.relowner
      where c.oid='public.culqi_charge_confirmation_receipts'::regclass
        and r.rolname in ('anon','authenticated','service_role'))
    or exists(select 1 from pg_proc p join pg_roles r on r.oid=p.proowner
      where p.oid in ('public.confirm_culqi_charge_result(uuid,uuid,uuid,timestamptz,text,text,jsonb)'::regprocedure,
        'public.finish_culqi_charge(uuid,uuid,text,text,text,jsonb)'::regprocedure)
        and r.rolname in ('anon','authenticated','service_role')) then
    raise exception 'Charge confirmation schema requires a trusted migration owner';
  end if;
end $$;
commit;
