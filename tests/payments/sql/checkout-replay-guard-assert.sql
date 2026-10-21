\ir checkout-replay-guard-helpers.sql
do $$ declare saved jsonb;
begin
  select snapshot into saved from public.checkout_replay_guard_baseline where label='complete';
  if saved is null or saved is distinct from pg_temp.checkout_replay_guard_snapshot() then
    raise exception 'Checkout replay changed protected data or core DDL';
  end if;
  if (select count(*) from public.orders where order_code in
      ('BAG-SYNTHETIC-RG-PERSISTUNKNOWN','BAG-SYNTHETIC-RG-PERSISTKNOWN')
      and payment_charge_state='uncertain' and payment_reconciliation_required
      and payment_reconciliation_reason='charge_result_uncertain') <> 2 then
    raise exception 'Checkout replay lost authentic synthetic reconciliation evidence';
  end if;
end $$;
\echo PASS protected replay complete data and core DDL unchanged
