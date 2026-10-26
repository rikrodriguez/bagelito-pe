do $$
declare b uuid; o uuid;
begin
 insert into public.batches(name,status) values ('SYNTHETIC CONCURRENCY','orders_open') returning id into b;
 select order_id into o from public.create_culqi_reservation_order(
 'BAG-CONCURRENCY',gen_random_uuid(),b,'6-single','6 single',6,'single',
 'Synthetic Test','000000000','synthetic@example.invalid','Synthetic address','Lince','','',false,58,
 now()+interval '30 minutes',true,'[{"flavor_slug":"plain","flavor_name":"Plain","quantity":6}]'::jsonb);
 perform public.prepare_culqi_token_session(o);
end $$;
