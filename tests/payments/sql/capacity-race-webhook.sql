-- Connection A: payment is verified before expiry, but commit is deliberately slow.
begin;
do $$ begin
  if current_database() not like '%test%'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
  if (select payment_expires_at from public.orders where order_code='BAG-CAPACITY-OLD') <= clock_timestamp() then
    raise exception 'Race fixture started too late: rerun in a fresh isolated database';
  end if;
end $$;
select public.apply_culqi_payment_event('evt_test_capacityrace','charge.creation.succeeded',
  '{"id":"chr_test_capacityrace","amount":5800,"currency":"PEN","metadata":{"bagelito_order_code":"BAG-CAPACITY-OLD"},"source":{"id":"tkn_test_capacityrace"}}','{}');
select pg_sleep(5);
commit;
