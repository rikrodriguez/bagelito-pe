begin;
do $$
declare batch_id uuid; blocked boolean := false;
begin
 insert into public.batches(name,status,orders_open_at,orders_close_at,capacity_packs,capacity_bagels)
 values ('SYNTHETIC ONLY','orders_open',now()+interval '1 day',now()+interval '2 days',20,220) returning id into batch_id;
 begin
  perform * from public.create_culqi_reservation_order(
   'BAG-SYNTHETIC-TEST',gen_random_uuid(),batch_id,'6-single','6 single',6,'single',
   'Synthetic Test','000000000','synthetic@example.invalid','Synthetic address','Lince','','',false,58,
   now()+interval '30 minutes',true,'[{"flavor_slug":"plain","flavor_name":"Plain","quantity":6}]'::jsonb
  );
 exception when others then
  if sqlerrm like '%not opened%' then blocked := true; else raise; end if;
 end;
 if not blocked then raise exception 'ASSERTION FAILED: future opening accepted a reservation'; end if;
end $$;
rollback;
