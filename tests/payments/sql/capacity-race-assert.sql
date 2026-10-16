do $$
declare active_count integer;
begin
  if current_database() not like '%test%'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
  if not exists(select 1 from public.orders where order_code='BAG-CAPACITY-OLD'
    and payment_status='paid' and status='payment_confirmed' and not payment_reconciliation_required) then
    raise exception 'The pre-expiry payment did not retain its reserved capacity';
  end if;
  select count(*) into active_count from public.orders
    where batch_id='00000000-0000-4000-8000-000000007001' and status<>'cancelled'
      and not (payment_status in ('pending','failed') and payment_expires_at<=clock_timestamp());
  if active_count <> 1 then raise exception 'Expected one active reservation, got %',active_count; end if;
end $$;
