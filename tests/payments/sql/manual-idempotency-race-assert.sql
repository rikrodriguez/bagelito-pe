do $$ declare first_op public.manual_reservation_operations%rowtype;
 loser public.manual_reservation_operations%rowtype; begin
 if current_database()<>'bagelito_test' or current_setting('bagelito.test_mode',true) is distinct from 'on' then
  raise exception 'Exact isolated database and explicit test mode are required';
 end if;
 select * into first_op from public.manual_reservation_operations where operation_id='00000000-0000-4000-8000-000000000910';
 if first_op.state is distinct from 'completed' or first_op.order_id is null
  or (select count(*) from public.orders where id=first_op.order_id)<>1
  or (select count(*) from public.order_items where order_id=first_op.order_id)<>1
  or (select count(*) from public.order_status_history where order_id=first_op.order_id)<>1 then
  raise exception 'Concurrent same-key finalization duplicated or lost committed data';
 end if;
 if (select count(*) from public.manual_reservation_operations where operation_id in (
  '00000000-0000-4000-8000-000000000910','00000000-0000-4000-8000-000000000911'))<>2
  or not exists(select 1 from public.manual_reservation_operations where operation_id='00000000-0000-4000-8000-000000000911'
    and request_hash=repeat('2',64) and state='awaiting_proof') then
  raise exception 'Concurrent prepare conflict replaced first immutable operation';
 end if;
 select * into loser from public.manual_reservation_operations where operation_id='00000000-0000-4000-8000-000000000913';
 if loser.state is distinct from 'awaiting_proof' or loser.order_id is not null
  or loser.proof_path <> 'manual/00000000-0000-4000-8000-000000000913/'||repeat('3',64)||'.png'
  or (select count(*) from public.orders where batch_id='00000000-0000-4000-8000-000000000912')<>1
  or (select sum(pack_units) from public.orders where batch_id='00000000-0000-4000-8000-000000000912')<>6
  or exists(select 1 from public.orders where order_code=loser.order_code) then
  raise exception 'Concurrent different operations overbooked last slot or lost pending identity/proof';
 end if;
 if (select count(*) from public.orders where payment_screenshot_path in (
  select proof_path from public.manual_reservation_operations where operation_id in (
   '00000000-0000-4000-8000-000000000910','00000000-0000-4000-8000-000000000912')))<>2 then
  raise exception 'Committed orders do not retain their bound proof paths';
 end if;
end $$;
