begin;
select set_config('bagelito.charge_get_case', :'scenario', true);
do $$ declare n integer:=current_setting('bagelito.charge_get_case')::integer; active_count integer;
begin
  if current_database()<>'bagelito_test' or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required'; end if;
  if n=4 then
    if exists(select 1 from public.culqi_charge_get_receipts where order_id='00000000-0000-4000-8000-000000009011')
      or not exists(select 1 from public.orders where id='00000000-0000-4000-8000-000000009011'
        and payment_status='pending' and payment_charge_attempt_id='00000000-0000-4000-8000-000000009015'
        and payment_charge_source_id='ype_test_SYNTHETICOther') then raise exception 'Stale GET altered current claim'; end if;
  else
    if (select count(*) from public.culqi_charge_get_receipts where order_id='00000000-0000-4000-8000-000000009011')<>1
      or not exists(select 1 from public.culqi_charge_get_receipts where order_id='00000000-0000-4000-8000-000000009011'
        and applied_confirmation and provenance='culqi_charge_get')
      or (select count(*) from public.order_status_history where order_id='00000000-0000-4000-8000-000000009011'
        and changed_by='culqi charge GET')<>1 then raise exception 'GET race duplicated or lost receipt/history'; end if;
    if n=1 and not exists(select 1 from public.orders where id='00000000-0000-4000-8000-000000009011'
      and payment_status='paid' and status='payment_confirmed') then raise exception 'GET duplicate lost confirmed state'; end if;
    if n in (2,3) and not exists(select 1 from public.orders where id='00000000-0000-4000-8000-000000009011'
      and payment_status='paid' and status='cancelled' and payment_reconciliation_required
      and payment_reconciliation_reason='payment_after_reservation_release') then raise exception 'Late GET lost quarantine'; end if;
    if n=3 then
      select count(*) into active_count from public.orders where batch_id='00000000-0000-4000-8000-000000009010'
        and status<>'cancelled' and not(payment_provider='culqi' and payment_status in ('pending','failed')
          and payment_expires_at<=clock_timestamp());
      if active_count<>1 or not exists(select 1 from public.orders where order_code='BAG-SYNTHETIC-GET-CAPACITY') then
        raise exception 'Late GET oversold replacement capacity'; end if;
    end if;
  end if;
  if exists(select 1 from public.payment_webhook_events where provider_order_id='chr_test_WIu0Hn7e9r2MqEue') then
    raise exception 'GET reconciliation fabricated an event'; end if;
  update public.culqi_charge_get_confirmation_policy set enabled=false where order_code='BAG-000001';
end $$;
commit;
