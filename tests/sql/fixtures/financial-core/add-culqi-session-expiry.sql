-- PROPOSED ONLY. Apply after add-checkout-safety.sql following isolated review.
-- Does not enable payments, contact a provider, or confirm a charge.
begin;

create or replace function public.expire_culqi_token_session(
  p_order_id uuid, p_checkout_session_id uuid
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  initial_batch_id uuid;
  o public.orders%rowtype;
  old_status text;
  charge_unresolved boolean;
begin
  if p_order_id is null or p_checkout_session_id is null then return null; end if;

  -- Discover the batch without taking the order lock first. This follows the
  -- reservation/webhook lock order and avoids order -> batch deadlocks.
  select batch_id into initial_batch_id from public.orders
    where id = p_order_id and checkout_session_id = p_checkout_session_id;
  if not found then return null; end if;
  perform 1 from public.batches where id = initial_batch_id for update;
  if not found then return null; end if;
  select * into o from public.orders
    where id = p_order_id and checkout_session_id = p_checkout_session_id for update;
  if not found or o.batch_id is distinct from initial_batch_id then return null; end if;

  if o.payment_provider = 'culqi' and o.payment_lane = 'token'
    and o.payment_order_id is null and o.payment_status = 'pending'
    and o.payment_expires_at is not null and o.payment_expires_at <= clock_timestamp() then
    -- Attempt rows are locked only after batch -> order. Claim/finish/webhook
    -- cannot change charge evidence while this decision is being committed.
    perform 1 from public.payment_attempts where order_id = o.id and provider = 'culqi'
      order by id for update;
    charge_unresolved := o.payment_charge_state is distinct from 'idle'
      or o.payment_preparation_claimed is distinct from false
      or o.payment_charge_id is not null
      or o.payment_charge_attempt_id is not null
      or o.payment_charge_source_id is not null
      or o.payment_charge_device_id is not null
      or o.payment_reconciliation_required is distinct from false
      or o.payment_reconciliation_reason is not null
      or o.status is null or o.status not in ('payment_pending_review', 'needs_correction', 'cancelled')
      or exists(select 1 from public.payment_attempts where order_id = o.id and provider = 'culqi'
        and (provider_order_id is not null or provider_charge_id is not null or paid_at is not null
          or status is null or status not in ('pending', 'expired')));

    if charge_unresolved then
      -- Expiry is not evidence that an initiated charge failed. Preserve all
      -- payment/fulfillment/claim state and explicitly block another attempt.
      update public.orders set payment_reconciliation_required = true,
        payment_reconciliation_reason = coalesce(payment_reconciliation_reason,
          'payment_expired_with_charge_unresolved') where id = o.id;
    else
      old_status := o.status;
      update public.orders set payment_status = 'expired', status = 'cancelled' where id = o.id;
      update public.payment_attempts set status = 'expired'
        where order_id = o.id and provider = 'culqi' and provider_order_id is null and status = 'pending';
      if old_status <> 'cancelled' then
        insert into public.order_status_history(order_id, old_status, new_status, changed_by)
          values(o.id, old_status, 'cancelled', 'payment expiry');
      end if;
    end if;
    select * into o from public.orders where id = o.id;
  end if;

  -- The capacity predicate is unchanged: expired pending holds already stop
  -- consuming capacity. A later verified payment still follows webhook rules.
  return jsonb_build_object('paymentStatus', o.payment_status,
    'orderStatus', o.status, 'reconciliationRequired', o.payment_reconciliation_required,
    'expired', o.payment_status = 'expired');
end $$;

revoke all on function public.expire_culqi_token_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.expire_culqi_token_session(uuid, uuid) to service_role;

commit;
