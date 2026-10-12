-- Connection B: capacity scan starts after expiry, while A has not committed yet.
select pg_sleep(4);
do $$ begin
  if current_database() not like '%test%'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
  begin
    perform public.create_culqi_reservation_order('BAG-CAPACITY-NEW',gen_random_uuid(),
      '00000000-0000-4000-8000-000000007001','6-single','6 single',6,'single',
      'Synthetic','000000000','synthetic@example.invalid','Synthetic','Lince','','',false,58,
      clock_timestamp()+interval '30 minutes',true,
      '[{"flavor_slug":"plain","flavor_name":"Plain","quantity":6}]'::jsonb);
    raise exception 'Capacity race admitted a second reservation for a one-pack batch' using errcode='Z0001';
  exception when sqlstate 'Z0001' then raise;
    when others then
      if sqlerrm <> 'This Bagelito batch is full. Join the waitlist.' then raise; end if;
  end;
end $$;
