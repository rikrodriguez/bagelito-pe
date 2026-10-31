begin;
\ir manual-idempotency-helpers.sql
do $$ declare role_name text; begin
 if not (select relrowsecurity from pg_class where oid='public.manual_reservation_operations'::regclass) then
  raise exception 'Manual operations must enable RLS';
 end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,'public.manual_reservation_operations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
   raise exception 'Direct operations table access granted to %', role_name;
  end if;
  if has_function_privilege(role_name,'public.prepare_manual_reservation_v1(uuid,text,text,text,text,integer,jsonb)','EXECUTE')
     is distinct from (role_name='service_role')
   or has_function_privilege(role_name,'public.finalize_manual_reservation_v1(uuid,text,text)','EXECUTE')
     is distinct from (role_name='service_role')
   or has_function_privilege(role_name,'public.read_manual_reservation_v1(uuid,text,text,text,text,integer)','EXECUTE')
     is distinct from (role_name='service_role') then
   raise exception 'Wrong RPC execution grant for %', role_name;
  end if;
 end loop;
 if exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
   where c.oid='public.manual_reservation_operations'::regclass and a.grantee=0) then
  raise exception 'Public table privileges must be absent';
 end if;
 if exists(select 1 from pg_proc where oid in (
   'public.prepare_manual_reservation_v1(uuid,text,text,text,text,integer,jsonb)'::regprocedure,
   'public.finalize_manual_reservation_v1(uuid,text,text)'::regprocedure,
   'public.read_manual_reservation_v1(uuid,text,text,text,text,integer)'::regprocedure) and not prosecdef) then
  raise exception 'Manual RPCs must be security definer';
 end if;
end $$;

insert into public.batches(id,name,status,capacity_packs,capacity_bagels,created_at)
values('00000000-0000-4000-8000-000000000901','Synthetic manual operations','orders_open',20,120,'2999-01-01');

-- A historical/imported code can precede sequence allocation. Do not reset or
-- synchronize the sequence: the new prepare must safely skip the collision.
create temporary table manual_fixture_collision(code text);
do $$ declare code text; begin
 select 'BAG-'||lpad((last_value+case when is_called then 1 else 0 end)::text,6,'0')
 into code from public.bagelito_order_code_seq;
 insert into manual_fixture_collision values(code);
 if not exists(select 1 from public.orders o where o.order_code=code) then
  perform bagelito_manual_fixture.direct(code,'00000000-0000-4000-8000-000000000901');
 end if;
end $$;

-- Exercise real role boundaries, not just ACL introspection.
set local role anon;
do $$ begin
 begin
  perform 1 from public.manual_reservation_operations;
  raise exception 'anon unexpectedly read operations';
 exception when insufficient_privilege then null; end;
 begin
  perform * from public.finalize_manual_reservation_v1('00000000-0000-4000-8000-000000000001',repeat('1',64),repeat('2',64));
  raise exception 'anon unexpectedly called finalize';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin
  perform * from public.prepare_manual_reservation_v1(
   '00000000-0000-4000-8000-000000000001',repeat('1',64),repeat('2',64),repeat('3',64),'image/png',32,'{}');
  raise exception 'authenticated unexpectedly called prepare';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ begin
 begin
  perform 1 from public.manual_reservation_operations;
  raise exception 'service_role unexpectedly read operations';
 exception when insufficient_privilege then null; end;
end $$;
select * from public.prepare_manual_reservation_v1(
 '00000000-0000-4000-8000-000000000901',repeat('1',64),repeat('2',64),repeat('3',64),'image/png',32,
 '{"pack_slug":"6-single","pack_name":"6 Classic","pack_units":6,"pack_type":"single","customer_name":"Synthetic Manual","whatsapp":"000000000","email":"manual@example.invalid","delivery_address":"Synthetic address","district":"Lince","address_reference":"","delivery_notes":"","marketing_opt_in":false,"total_amount":58,"payment_method":"Yape","payment_transaction_number":"SYNTHETIC-MANUAL-TRANSFER","payment_holder_name":"Synthetic Manual","payment_phone_number":"000000000","terms_accepted":true,"exact_amount_confirmed":true,"terms_version":"2026-10-26","items":[{"flavor_slug":"plain","flavor_name":"Plain","quantity":6}]}');
reset role;

do $$ declare first_row record; replay record; saved_payload jsonb; before_orders bigint; bad jsonb; changes jsonb; n integer := 0; begin
 select count(*) into before_orders from public.orders;
 select * into first_row from public.manual_reservation_operations where operation_id='00000000-0000-4000-8000-000000000901';
 saved_payload := first_row.order_payload;
 if first_row.order_code = (select code from manual_fixture_collision) then
  raise exception 'Prepare bound an already imported order code';
 end if;
 if first_row.state <> 'awaiting_proof' or first_row.order_id is not null
  or first_row.batch_id <> '00000000-0000-4000-8000-000000000901'
  or first_row.proof_path <> 'manual/00000000-0000-4000-8000-000000000901/'||repeat('3',64)||'.png'
  or saved_payload->>'order_code' <> first_row.order_code
  or saved_payload->>'payment_screenshot_path' <> first_row.proof_path then
  raise exception 'Prepare did not bind stable identity, quote, batch and proof';
 end if;
 select * into replay from bagelito_manual_fixture.prepare('00000000-0000-4000-8000-000000000901');
 if not replay.replayed or replay.order_code <> first_row.order_code or replay.state <> 'awaiting_proof'
  or replay.amount <> 58 or replay.pack_slug <> '6-single' then
  raise exception 'Pending exact replay must return original result';
 end if;
 if (select count(*) from public.orders) <> before_orders then raise exception 'Prepare consumed stock'; end if;

 foreach changes in array array[
  '{"total_amount":59}', '{"pack_name":"New quote"}', '{"terms_version":"future-version"}'
 ]::jsonb[] loop
  begin
   perform * from bagelito_manual_fixture.prepare('00000000-0000-4000-8000-000000000901',
    bagelito_manual_fixture.payload(changes));
   raise exception 'Expected pending quote/version drift rejection';
  exception when sqlstate 'P4091' then
   if sqlerrm <> 'Manual reservation quote changed.' then raise; end if;
  end;
 end loop;
 if (select order_payload from public.manual_reservation_operations where operation_id=first_row.operation_id)
   is distinct from saved_payload then raise exception 'Replay mutated quote snapshot'; end if;

 -- Changed logical input is represented by a changed service-computed hash;
 -- owner and every proof attribute are independently checked before any replay.
 for n in 1..11 loop
  begin
   perform * from bagelito_manual_fixture.prepare('00000000-0000-4000-8000-000000000901',
    bagelito_manual_fixture.payload(),
    case when n=1 then repeat('4',64) when n=6 then 'bad' else repeat('1',64) end,
    case when n=2 then repeat('4',64) when n=7 then 'bad' else repeat('2',64) end,
    case when n=3 then repeat('4',64) when n=8 then 'bad' else repeat('3',64) end,
    case when n=4 then 'image/jpeg' when n=9 then 'image/jpg' else 'image/png' end,
    case when n=5 then 33 when n=10 then 0 when n=11 then null else 32 end);
   raise exception 'Expected owner/request/proof conflict';
  exception when sqlstate 'P4090' then
   if sqlerrm <> 'Manual reservation operation conflict.' then raise; end if;
  end;
 end loop;
 foreach bad in array array[
  bagelito_manual_fixture.payload()-'terms_accepted',
  bagelito_manual_fixture.payload('{"terms_accepted":false}'),
  bagelito_manual_fixture.payload('{"terms_accepted":"true"}'),
  bagelito_manual_fixture.payload()-'exact_amount_confirmed',
  bagelito_manual_fixture.payload('{"exact_amount_confirmed":false}'),
  bagelito_manual_fixture.payload('{"total_amount":0}'),
  bagelito_manual_fixture.payload('{"total_amount":-1}'),
  bagelito_manual_fixture.payload('{"total_amount":"58"}'),
  bagelito_manual_fixture.payload('{"total_amount":58.001}'),
  bagelito_manual_fixture.payload('{"pack_units":0}'),
  bagelito_manual_fixture.payload('{"pack_units":6.5}'),
  bagelito_manual_fixture.payload('{"pack_units":12}'),
  bagelito_manual_fixture.payload('{"items":[]}'),
  bagelito_manual_fixture.payload('{"items":[{"flavor_slug":"plain","flavor_name":"Plain","quantity":-6}]}'),
  bagelito_manual_fixture.payload('{"items":[{"flavor_slug":"plain","flavor_name":"Plain","quantity":6.5}]}'),
  bagelito_manual_fixture.payload('{"items":[{"flavor_slug":"","flavor_name":"Plain","quantity":6}]}'),
  bagelito_manual_fixture.payload('{"payment_method":"Culqi"}'),
  bagelito_manual_fixture.payload('{"customer_name":""}'),
  bagelito_manual_fixture.payload()-'terms_version',
  bagelito_manual_fixture.payload('{"terms_version":""}')
 ]::jsonb[] loop
  begin
   perform * from bagelito_manual_fixture.prepare(gen_random_uuid(),bad);
   raise exception 'Invalid financial/consent/body shape accepted: %',bad;
  exception when invalid_parameter_value then null; end;
 end loop;
 if (select count(*) from public.manual_reservation_operations) <> 1 then
  raise exception 'Rejected prepare left operations behind';
 end if;
end $$;

do $$ declare bad_op uuid; bad_owner text; bad_req text; bad_sha text; bad_type text; bad_size integer; n integer; r record; begin
 for n in 1..9 loop
  bad_op:=gen_random_uuid();bad_owner:=repeat('1',64);bad_req:=repeat('2',64);
  bad_sha:=repeat('3',64);bad_type:='image/png';bad_size:=32;
  case n when 1 then bad_op:='00000000-0000-1000-8000-000000000001';
   when 2 then bad_owner:='bad';when 3 then bad_req:='bad';when 4 then bad_sha:='bad';
   when 5 then bad_type:='image/jpg';when 6 then bad_type:='text/plain';
   when 7 then bad_size:=0;when 8 then bad_size:=5242881;when 9 then bad_size:=null;
  end case;
  begin
   perform * from bagelito_manual_fixture.prepare(bad_op,bagelito_manual_fixture.payload(),bad_owner,bad_req,bad_sha,bad_type,bad_size);
   raise exception 'Invalid operation/proof metadata accepted';
  exception when invalid_parameter_value then null; end;
 end loop;
 for n in 1..3 loop
  select * into r from bagelito_manual_fixture.prepare(gen_random_uuid(),bagelito_manual_fixture.payload(),
   repeat('1',64),repeat('2',64),repeat('3',64),
   case n when 1 then 'image/jpeg' when 2 then 'image/png' else 'image/webp' end,
   case n when 1 then 1 else 5242880 end);
  if r.proof_path not like ('%' || case n when 1 then '.jpg' when 2 then '.png' else '.webp' end) then
   raise exception 'Proof extension not canonical';
  end if;
 end loop;
end $$;

-- Thirty-two occupied generated codes exhaust the bounded allocator. Roll
-- back only the synthetic imports; ordinary nextval gaps deliberately persist.
do $$ declare code_before bigint; orders_before bigint; operations_before bigint; n integer; code text; begin
 select last_value into code_before from public.bagelito_order_code_seq;
 select count(*) into orders_before from public.orders;
 select count(*) into operations_before from public.manual_reservation_operations;
 begin
  update public.batches set capacity_packs=null,capacity_bagels=null where id='00000000-0000-4000-8000-000000000901';
  for n in 1..32 loop
   code := 'BAG-'||lpad((code_before+n)::text,6,'0');
   if not exists(select 1 from public.orders o where o.order_code=code) then
    perform bagelito_manual_fixture.direct(code,'00000000-0000-4000-8000-000000000901');
   end if;
  end loop;
  begin
   perform * from bagelito_manual_fixture.prepare(gen_random_uuid());
   raise exception 'Expected bounded code allocation failure';
  exception when object_not_in_prerequisite_state then
   if sqlerrm <> 'Could not allocate a reservation order code.' then raise; end if;
  end;
  if (select last_value from public.bagelito_order_code_seq) <> code_before+32
   or (select count(*) from public.manual_reservation_operations) <> operations_before then
   raise exception 'Allocator exceeded bound or persisted an unusable operation';
  end if;
  raise exception using errcode='P6000',message='Rollback synthetic allocator imports';
 exception when sqlstate 'P6000' then null;
 end;
 if (select count(*) from public.orders) <> orders_before then
  raise exception 'Synthetic allocator imports escaped fixture rollback';
 end if;
end $$;

-- Integer JSON numbers with a decimal representation are canonicalized before
-- calling the immutable original RPC's integer casts.
select * from bagelito_manual_fixture.prepare('00000000-0000-4000-8000-000000000906',
 bagelito_manual_fixture.payload('{"pack_units":6.0,"items":[{"flavor_slug":"plain","flavor_name":"Plain","quantity":6.0}]}'));
select * from bagelito_manual_fixture.finalize('00000000-0000-4000-8000-000000000906');

-- New unavailable operations fail before sequence allocation or persistence.
-- Replays keep their binding and never reserve stock during prepare.
do $$ declare n integer; op_count bigint; code_before bigint; first_replay record; begin
 select count(*) into op_count from public.manual_reservation_operations;
 for n in 1..6 loop
  update public.batches set status='orders_open',orders_open_at=null,orders_close_at=null,
   capacity_packs=20,capacity_bagels=120 where id='00000000-0000-4000-8000-000000000901';
  case n
   when 1 then update public.batches set status='closed' where id='00000000-0000-4000-8000-000000000901';
   when 2 then update public.batches set orders_open_at='2999-12-31' where id='00000000-0000-4000-8000-000000000901';
   when 3 then update public.batches set orders_close_at='2000-01-01' where id='00000000-0000-4000-8000-000000000901';
   when 4 then update public.batches set capacity_packs=0 where id='00000000-0000-4000-8000-000000000901';
   when 5 then update public.batches set capacity_bagels=0 where id='00000000-0000-4000-8000-000000000901';
   when 6 then update public.batches set capacity_packs=1,capacity_bagels=6 where id='00000000-0000-4000-8000-000000000901';
  end case;
  select last_value into code_before from public.bagelito_order_code_seq;
  begin
   perform * from bagelito_manual_fixture.prepare(gen_random_uuid());
   raise exception 'New unavailable operation unexpectedly prepared';
  exception when raise_exception then
   if sqlerrm not in (
    'This Bagelito batch is currently closed. Join the waitlist for the next opening.',
    'Reservation batch has not opened yet.',
    'This Bagelito batch has already closed. Join the waitlist for the next batch.',
    'This Bagelito batch is full. Join the waitlist.',
    'This Bagelito batch is full for the pack size selected. Join the waitlist.') then raise; end if;
  end;
  if (select count(*) from public.manual_reservation_operations) <> op_count
   or (select last_value from public.bagelito_order_code_seq) <> code_before then
   raise exception 'Unavailable new prepare persisted state or allocated a code';
  end if;
  select * into first_replay from bagelito_manual_fixture.prepare('00000000-0000-4000-8000-000000000901');
  if first_replay.state <> 'awaiting_proof' or not first_replay.replayed then
   raise exception 'Pending exact prepare replay must precede current intake checks';
  end if;
 end loop;
 update public.batches set status='orders_open',orders_open_at=null,orders_close_at=null,
  capacity_packs=null,capacity_bagels=null where id='00000000-0000-4000-8000-000000000901';
 perform * from bagelito_manual_fixture.prepare('00000000-0000-4000-8000-000000000907');
 update public.batches set capacity_packs=20,capacity_bagels=120 where id='00000000-0000-4000-8000-000000000901';
end $$;

set local role service_role;
select * from public.finalize_manual_reservation_v1(
 '00000000-0000-4000-8000-000000000901',repeat('1',64),repeat('2',64));
reset role;

-- A completed operation recovers its original quote even after intake closes,
-- another batch appears, and the caller derives a different price/version.
update public.batches set status='closed' where id='00000000-0000-4000-8000-000000000901';
insert into public.batches(id,name,status,capacity_packs,capacity_bagels,created_at)
values('00000000-0000-4000-8000-000000000902','Synthetic newer closed batch','closed',0,0,'2999-01-02');
do $$ declare completed record; replay record; pending record; n integer; begin
 select * into pending from public.manual_reservation_operations
 where batch_id='00000000-0000-4000-8000-000000000901' and order_id is null limit 1;
 select * into replay from public.prepare_manual_reservation_v1(pending.operation_id,
  pending.owner_hash,pending.request_hash,pending.proof_sha256,pending.proof_type,pending.proof_size,
  pending.order_payload-array['batch_id','order_code','payment_screenshot_path']);
 if replay.state <> 'awaiting_proof' or not replay.replayed
  or replay.order_code <> pending.order_code or replay.proof_path <> pending.proof_path then
  raise exception 'Pending replay changed original batch/quote/proof binding';
 end if;
 begin
  perform * from bagelito_manual_fixture.finalize(pending.operation_id);
  raise exception 'Closed original batch must still block pending finalize';
 exception when raise_exception then
  if sqlerrm <> 'This Bagelito batch is currently closed. Join the waitlist for the next opening.' then raise; end if;
 end;
 if not exists(select 1 from public.manual_reservation_operations
  where operation_id=pending.operation_id and state='awaiting_proof'
  and batch_id=pending.batch_id and proof_path=pending.proof_path) then
  raise exception 'Closed-batch rejection lost pending binding';
 end if;
 select * into completed from public.manual_reservation_operations where operation_id='00000000-0000-4000-8000-000000000901';
 select * into replay from bagelito_manual_fixture.prepare(completed.operation_id,
  bagelito_manual_fixture.payload('{"total_amount":99,"terms_version":"future-version"}'));
 if replay.state <> 'completed' or not replay.replayed or replay.order_code <> completed.order_code
  or replay.proof_path <> completed.proof_path or replay.amount <> 58 then
  raise exception 'Completed prepare replay failed to recover original';
 end if;
 select * into replay from bagelito_manual_fixture.finalize(completed.operation_id);
 if replay.state <> 'completed' or not replay.replayed or replay.order_code <> completed.order_code then
  raise exception 'Completed finalize replay did not bypass new intake';
 end if;
 if (select count(*) from public.orders where order_code=completed.order_code) <> 1
  or (select count(*) from public.order_items where order_id=completed.order_id) <> 1
  or (select count(*) from public.order_status_history where order_id=completed.order_id) <> 1 then
  raise exception 'Replay duplicated order/items/history';
 end if;
 if not exists(select 1 from public.orders where id=completed.order_id and total_amount=58
   and terms_accepted and exact_amount_confirmed and pack_units=6
   and payment_screenshot_path=completed.proof_path
   and payment_transaction_number='SYNTHETIC-MANUAL-TRANSFER') then
  raise exception 'Finalized financial/consent/proof fields differ';
 end if;
 for n in 1..3 loop
  begin
   perform * from bagelito_manual_fixture.finalize(
    case when n=3 then gen_random_uuid() else completed.operation_id end,
    case when n=1 then repeat('4',64) else repeat('1',64) end,
    case when n=2 then repeat('4',64) else repeat('2',64) end);
   raise exception 'Expected generic finalize conflict';
  exception when sqlstate 'P4090' then
   if sqlerrm <> 'Manual reservation operation conflict.' then raise; end if;
  end;
 end loop;
end $$;

-- Known downstream failure rolls back all original RPC writes and completion.
update public.batches set status='orders_open',capacity_packs=20,capacity_bagels=120
where id='00000000-0000-4000-8000-000000000902';
select * from bagelito_manual_fixture.prepare(
 '00000000-0000-4000-8000-000000000903',bagelito_manual_fixture.payload('{"customer_name":"Synthetic Manual Rollback"}'));
create function bagelito_manual_fixture.history_fault() returns trigger language plpgsql as $$
begin
 if exists(select 1 from public.orders where id=new.order_id and customer_name='Synthetic Manual Rollback') then
  raise exception 'Synthetic manual history failure';
 end if;
 return new;
end $$;
create trigger manual_fixture_history_fault before insert on public.order_status_history
for each row execute function bagelito_manual_fixture.history_fault();
do $$ declare pending record; orders_before bigint; items_before bigint; history_before bigint; begin
 select * into pending from public.manual_reservation_operations where operation_id='00000000-0000-4000-8000-000000000903';
 select count(*) into orders_before from public.orders;
 select count(*) into items_before from public.order_items;
 select count(*) into history_before from public.order_status_history;
 begin
  perform * from bagelito_manual_fixture.finalize(pending.operation_id);
  raise exception 'History fault must reject finalize';
 exception when raise_exception then
  if sqlerrm <> 'Synthetic manual history failure' then raise; end if;
 end;
 if (select count(*) from public.orders) <> orders_before
  or (select count(*) from public.order_items) <> items_before
  or (select count(*) from public.order_status_history) <> history_before
  or exists(select 1 from public.manual_reservation_operations where operation_id=pending.operation_id
    and (state<>'awaiting_proof' or order_id is not null or proof_path<>pending.proof_path)) then
  raise exception 'History failure left partial order data or operation completion';
 end if;
end $$;
drop trigger manual_fixture_history_fault on public.order_status_history;

-- Separate operation keys intentionally represent separate orders even when the
-- transfer data are equal. No unsupported global transfer-number uniqueness.
select * from bagelito_manual_fixture.prepare('00000000-0000-4000-8000-000000000904');
select * from bagelito_manual_fixture.prepare('00000000-0000-4000-8000-000000000905');
select * from bagelito_manual_fixture.finalize('00000000-0000-4000-8000-000000000904');
select * from bagelito_manual_fixture.finalize('00000000-0000-4000-8000-000000000905');
do $$ begin
 if (select count(*) from public.manual_reservation_operations where operation_id in (
   '00000000-0000-4000-8000-000000000904','00000000-0000-4000-8000-000000000905')
   and state='completed') <> 2 then raise exception 'Distinct keys were incorrectly grouped'; end if;
end $$;
rollback;
\echo 'PASS: manual operation ACL/RLS; consent and financial shape; deterministic proof; quote conflict; exact and completed replay; atomic history rollback; distinct keys'
