-- Read-only operator preflight, immediately BEFORE the first core installation.
-- Does not authorize replay, repair data, enable payments, or contact Culqi.
-- Stop on any error. Installed/partial core must use reviewed forward migrations.
do $$
begin
  if to_regclass('public.orders') is null or to_regclass('public.payment_attempts') is null
    or to_regclass('public.payment_webhook_events') is null
    or not exists(select 1 from pg_catalog.pg_attribute
      where attrelid=to_regclass('public.orders') and attname='payment_provider' and not attisdropped)
    or not exists(select 1 from pg_catalog.pg_attribute
      where attrelid=to_regclass('public.orders') and attname='payment_order_id' and not attisdropped)
    or not exists(select 1 from pg_catalog.pg_attribute
      where attrelid=to_regclass('public.orders') and attname='payment_charge_id' and not attisdropped) then
    raise exception using errcode='55000',
      message='Checkout safety preflight requires the payment-provider foundation';
  end if;

  if exists(select 1 from pg_catalog.pg_proc
      where oid=to_regprocedure('public.claim_culqi_charge(uuid,text,text,boolean)')
        and prorettype='boolean'::regtype) then
    raise exception using errcode='55000',
      message='Checkout safety preflight found an incompatible prior claim contract';
  end if;

  -- Reject empty and partial installations too: replay replaces RPCs even when
  -- the legacy UPDATE happens to match no rows. Do not infer safety from data.
  if exists(select 1 from pg_catalog.pg_attribute
      where attrelid='public.orders'::regclass and not attisdropped and attname in
        ('payment_lane','payment_preparation_claimed','payment_charge_state',
         'payment_charge_attempt_id','payment_charge_source_id','payment_charge_device_id',
         'payment_reconciliation_required','payment_reconciliation_reason'))
    or exists(select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in
        ('claim_culqi_order_preparation','prepare_culqi_token_session','claim_culqi_charge',
         'finish_culqi_charge','apply_culqi_payment_event','attach_culqi_order',
         'expire_culqi_token_session','guard_culqi_checkout_replay'))
    or exists(select 1 from pg_catalog.pg_trigger
      where tgrelid='public.orders'::regclass and tgname='orders_culqi_checkout_replay_guard') then
    raise exception using errcode='55000',
      message='Checkout safety core is already present; use forward migrations';
  end if;

  -- Aggregate internally; exceptions contain no order, charge or customer data.
  if exists(select 1 from public.orders where payment_provider='culqi' and payment_order_id is not null
      group by payment_order_id having count(*)>1)
    or exists(select 1 from public.orders where payment_provider='culqi' and payment_charge_id is not null
      group by payment_charge_id having count(*)>1) then
    raise exception using errcode='55000',
      message='Checkout safety preflight found duplicate Culqi payment identities';
  end if;
end $$;
