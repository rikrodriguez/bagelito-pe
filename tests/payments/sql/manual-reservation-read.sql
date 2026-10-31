begin;
\ir manual-idempotency-helpers.sql

-- Missing lookup is successful and empty. No operation, stock, or sequence
-- allocation is allowed, including after invalid metadata attempts.
do $$ declare before_ops bigint; before_orders bigint; before_code bigint; before_called boolean;
 bad_op uuid; bad_owner text; bad_req text; bad_sha text; bad_type text; bad_size integer; n integer; begin
 select count(*) into before_ops from public.manual_reservation_operations;
 select count(*) into before_orders from public.orders;
 select last_value,is_called into before_code,before_called from public.bagelito_order_code_seq;
 if exists(select 1 from bagelito_manual_fixture.read('00000000-0000-4000-8000-000000000930')) then
  raise exception 'Unknown valid read must return no rows';
 end if;
 for n in 1..10 loop
  bad_op:=gen_random_uuid();bad_owner:=repeat('1',64);bad_req:=repeat('2',64);
  bad_sha:=repeat('3',64);bad_type:='image/png';bad_size:=32;
  case n when 1 then bad_op:='00000000-0000-1000-8000-000000000001';
   when 2 then bad_owner:='bad';when 3 then bad_req:='bad';when 4 then bad_sha:='bad';
   when 5 then bad_type:='image/jpg';when 6 then bad_type:='text/plain';
   when 7 then bad_size:=0;when 8 then bad_size:=5242881;when 9 then bad_size:=null;
   when 10 then bad_op:=null;
  end case;
  begin
   perform * from bagelito_manual_fixture.read(bad_op,bad_owner,bad_req,bad_sha,bad_type,bad_size);
   raise exception 'Invalid unknown read metadata accepted';
  exception when invalid_parameter_value then null; end;
 end loop;
 if (select count(*) from public.manual_reservation_operations) <> before_ops
  or (select count(*) from public.orders) <> before_orders
  or (select last_value from public.bagelito_order_code_seq) <> before_code
  or (select is_called from public.bagelito_order_code_seq) is distinct from before_called then
  raise exception 'Read changed operations, orders, or sequence';
 end if;
end $$;

set local role anon;
do $$ begin
 begin
  perform * from public.read_manual_reservation_v1('00000000-0000-4000-8000-000000000930',
   repeat('1',64),repeat('2',64),repeat('3',64),'image/png',32);
  raise exception 'anon unexpectedly called read';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin
  perform * from public.read_manual_reservation_v1('00000000-0000-4000-8000-000000000930',
   repeat('1',64),repeat('2',64),repeat('3',64),'image/png',32);
  raise exception 'authenticated unexpectedly called read';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ begin
 if exists(select 1 from public.read_manual_reservation_v1('00000000-0000-4000-8000-000000000930',
  repeat('1',64),repeat('2',64),repeat('3',64),'image/png',32)) then
  raise exception 'Service-role missing read must return no rows';
 end if;
 begin
  perform 1 from public.manual_reservation_operations;
  raise exception 'service_role unexpectedly read operations directly';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

insert into public.batches(id,name,status,capacity_packs,capacity_bagels,created_at)
values('00000000-0000-4000-8000-000000000930','Synthetic manual read','orders_open',2,12,'2999-03-01');
select * from bagelito_manual_fixture.prepare('00000000-0000-4000-8000-000000000930');

-- Read the same pending and completed identity through actual service-role RPC.
set local role service_role;
select * from public.read_manual_reservation_v1('00000000-0000-4000-8000-000000000930',
 repeat('1',64),repeat('2',64),repeat('3',64),'image/png',32);
reset role;

do $$ declare before_row jsonb; before_orders bigint; before_code bigint; result record;
 phase integer; n integer; begin
 for phase in 1..2 loop
  if phase=2 then
   perform * from bagelito_manual_fixture.finalize('00000000-0000-4000-8000-000000000930');
   update public.batches set status='closed',capacity_packs=0,capacity_bagels=0
    where id='00000000-0000-4000-8000-000000000930';
   insert into public.batches(id,name,status,capacity_packs,capacity_bagels,created_at)
    values('00000000-0000-4000-8000-000000000931','Synthetic newer unavailable batch','closed',0,0,'2999-03-02');
  end if;
  select to_jsonb(o) into before_row from public.manual_reservation_operations o
   where operation_id='00000000-0000-4000-8000-000000000930';
  select count(*) into before_orders from public.orders;
  select last_value into before_code from public.bagelito_order_code_seq;
  select * into result from bagelito_manual_fixture.read('00000000-0000-4000-8000-000000000930');
  if to_jsonb(result) is distinct from jsonb_build_object(
   'operation_id','00000000-0000-4000-8000-000000000930','state',
   case phase when 1 then 'awaiting_proof' else 'completed' end,
   'order_code',before_row->>'order_code','proof_path',before_row->>'proof_path',
   'amount',58,'pack_slug','6-single','replayed',true) then
   raise exception 'Read returned incorrect or partial operation row';
  end if;
  -- Every owner/request/proof attribute is bound. Malformed changes are also
  -- conflicts on existing rows, without revealing an order code or proof path.
  for n in 1..11 loop
   begin
    perform * from bagelito_manual_fixture.read('00000000-0000-4000-8000-000000000930',
     case when n=1 then repeat('4',64) when n=6 then 'bad' else repeat('1',64) end,
     case when n=2 then repeat('4',64) when n=7 then 'bad' else repeat('2',64) end,
     case when n=3 then repeat('4',64) when n=8 then 'bad' else repeat('3',64) end,
     case when n=4 then 'image/jpeg' when n=9 then 'image/jpg' else 'image/png' end,
     case when n=5 then 33 when n=10 then 0 when n=11 then null else 32 end);
    raise exception 'Expected private read conflict';
   exception when sqlstate 'P4090' then
    if sqlerrm <> 'Manual reservation operation conflict.' then raise; end if;
   end;
  end loop;
  if (select to_jsonb(o) from public.manual_reservation_operations o
    where operation_id='00000000-0000-4000-8000-000000000930') is distinct from before_row
   or (select count(*) from public.orders) <> before_orders
   or (select last_value from public.bagelito_order_code_seq) <> before_code then
   raise exception 'Read mutated operation, quote, completion, stock, or sequence';
  end if;
  if phase=1 then
   -- Reading pending does not finalize it or accept a changed current quote.
   begin
    perform * from bagelito_manual_fixture.prepare('00000000-0000-4000-8000-000000000930',
     bagelito_manual_fixture.payload('{"total_amount":99,"terms_version":"future-version"}'));
    raise exception 'Pending read must not accept new quote';
   exception when sqlstate 'P4091' then null; end;
  else
   -- Current quote/version changes remain irrelevant to committed recovery.
   perform * from bagelito_manual_fixture.prepare('00000000-0000-4000-8000-000000000930',
    bagelito_manual_fixture.payload('{"total_amount":99,"terms_version":"future-version"}'));
   select * into result from bagelito_manual_fixture.read('00000000-0000-4000-8000-000000000930');
   if result.amount <> 58 or result.pack_slug <> '6-single' or result.state <> 'completed' then
    raise exception 'Read depended on changed current quote/catalog/intake';
   end if;
  end if;
 end loop;
end $$;

set local role service_role;
select * from public.read_manual_reservation_v1('00000000-0000-4000-8000-000000000930',
 repeat('1',64),repeat('2',64),repeat('3',64),'image/png',32);
reset role;
rollback;
\echo 'PASS: manual private read; empty lookup without effects; actual roles; owner/request/proof conflicts; pending quote guard; completed original recovery'
