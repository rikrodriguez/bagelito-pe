-- Forward migration AFTER add-checkout-safety.sql and add-culqi-session-expiry.sql.
-- Preserves existing evidence; never reconstructs previously overwritten reasons.
-- Does not enable payments, confirm a charge, or contact any provider.
begin;

do $$ declare signature text;
begin
  if (select count(*) from pg_catalog.pg_attribute where attrelid=to_regclass('public.orders')
      and not attisdropped and attname in ('payment_provider','payment_status','payment_lane',
        'payment_charge_state','payment_reconciliation_required','payment_reconciliation_reason')) <> 6 then
    raise exception using errcode='55000',message='Checkout replay guard requires both core migrations';
  end if;
  foreach signature in array array[
    'public.prepare_culqi_token_session(uuid)',
    'public.claim_culqi_charge(uuid,text,text,boolean)',
    'public.finish_culqi_charge(uuid,uuid,text,text,text,jsonb)',
    'public.apply_culqi_payment_event(text,text,jsonb,jsonb)',
    'public.expire_culqi_token_session(uuid,uuid)'
  ] loop
    if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure(signature)
        and prorettype='jsonb'::regtype) then
      raise exception using errcode='55000',message='Checkout replay guard requires both core migrations';
    end if;
  end loop;
end $$;

create or replace function public.guard_culqi_checkout_replay()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
  if old.payment_provider='culqi' and new.payment_provider='culqi' then
    -- Only the destructive legacy classification is blocked. Authentic review
    -- changes and verified webhook/GET settlement retain their existing rules.
    if old.payment_charge_state='uncertain'
      and new.payment_reconciliation_reason='legacy_payment_outcome_unknown'
      and new.payment_reconciliation_reason is distinct from old.payment_reconciliation_reason
      and (old.payment_lane='token' or old.payment_reconciliation_reason is not null) then
      raise exception using errcode='23514',
        message='Checkout safety replay would overwrite reconciliation evidence';
    end if;
    if old.payment_lane='token' and old.payment_charge_state='uncertain'
      and new.payment_charge_state='submitted'
      and old.payment_status is distinct from 'paid'
      and new.payment_status is distinct from 'paid' then
      raise exception using errcode='23514',
        message='Checkout safety replay would promote an uncertain charge';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_culqi_checkout_replay() from public,anon,authenticated,service_role;

-- Preserve the trigger OID on replay as well as its behavior. A conflicting or
-- disabled trigger fails closed instead of silently replacing an unknown one.
do $$ declare reason_att smallint; state_att smallint;
begin
  select attnum into reason_att from pg_catalog.pg_attribute
    where attrelid='public.orders'::regclass and attname='payment_reconciliation_reason' and not attisdropped;
  select attnum into state_att from pg_catalog.pg_attribute
    where attrelid='public.orders'::regclass and attname='payment_charge_state' and not attisdropped;
  if exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.orders'::regclass
      and tgname='orders_culqi_checkout_replay_guard') then
    if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.orders'::regclass
        and tgname='orders_culqi_checkout_replay_guard'
        and tgfoid='public.guard_culqi_checkout_replay()'::regprocedure
        and tgtype=19 and tgenabled='O' and tgnargs=0 and tgqual is null
        and tgattr::text=reason_att::text||' '||state_att::text) then
      raise exception using errcode='55000',message='Checkout replay guard trigger has an incompatible definition';
    end if;
  else
    create trigger orders_culqi_checkout_replay_guard
      before update of payment_reconciliation_reason,payment_charge_state on public.orders
      for each row execute function public.guard_culqi_checkout_replay();
  end if;
end $$;

commit;
