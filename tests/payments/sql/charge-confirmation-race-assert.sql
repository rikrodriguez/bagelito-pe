select set_config('bagelito.confirmation_case', :'scenario', false);
do $$ declare n integer:=current_setting('bagelito.confirmation_case')::integer;
  o public.orders%rowtype; receipt_count integer; history_count integer;
begin
  if current_database()<>'bagelito_test' or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
  select * into o from public.orders where id='00000000-0000-4000-8000-000000009111';
  select count(*) into receipt_count from public.culqi_charge_confirmation_receipts where order_id=o.id;
  select count(*) into history_count from public.order_status_history where order_id=o.id and new_status='payment_confirmed';
  if n in (1,2,3) then
    if o.payment_status is distinct from 'paid' or o.status is distinct from 'payment_confirmed'
      or receipt_count<>1 or history_count<>1
      or not exists(select 1 from public.culqi_charge_confirmation_receipts where order_id=o.id
        and provenance=case when n=2 then 'culqi_charge_get' else 'culqi_charge_post' end
        and applied_confirmation=(n<>2)) then
      raise exception 'Concurrent confirmation/webhook duplicated or retagged transition';
    end if;
  elsif n=4 then
    if o.payment_status is distinct from 'paid' or o.status is distinct from 'cancelled'
      or not o.payment_reconciliation_required or o.payment_reconciliation_reason is distinct from 'payment_after_reservation_release'
      or receipt_count<>1 or history_count<>0
      or (select count(*) from public.orders where batch_id=o.batch_id and status<>'cancelled')<>1
      or not exists(select 1 from public.orders where batch_id=o.batch_id
        and order_code='BAG-SYNTHETIC-RESULT-REPLACEMENT' and payment_status='pending' and pack_units=6) then
      raise exception 'Late confirmation changed replacement capacity';
    end if;
  elsif n in (5,6,7) then
    if o.payment_status is distinct from 'pending' or receipt_count<>0 or history_count<>0 then
      raise exception 'Rejected racing confirmation left effects';
    end if;
    if n=5 and o.payment_reconciliation_reason is distinct from 'known_completed_refund' then
      raise exception 'Racing refund evidence was lost';
    elsif n=6 and o.payment_charge_attempt_id is distinct from '00000000-0000-4000-8000-000000009115'::uuid then
      raise exception 'Racing replacement claim was lost';
    end if;
  else raise exception 'Unknown confirmation assertion'; end if;
  raise notice 'PASS charge confirmation race %',n;
end $$;
