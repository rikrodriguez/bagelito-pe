-- Populated upgrade fixture: prior provider outcomes must not be reset to idle.
do $$
declare b uuid; o uuid;
begin
 insert into public.batches(name,status) values('SYNTHETIC LEGACY','orders_open') returning id into b;
 select order_id into o from public.create_culqi_reservation_order(
 'BAG-LEGACY',gen_random_uuid(),b,'6-single','6 single',6,'single',
 'Synthetic Test','000000000','synthetic@example.invalid','Synthetic address','Lince','','',false,58,
 now()+interval '30 minutes',true,'[{"flavor_slug":"plain","flavor_name":"Plain","quantity":6}]'::jsonb);
 update public.orders set payment_order_id='ord_test_legacy' where id=o;
 insert into public.payment_attempts(order_id,provider,provider_order_id,provider_charge_id,amount_minor)
 values(o,'culqi','ord_test_legacy','chr_test_unknown_outcome',5800);
end $$;
