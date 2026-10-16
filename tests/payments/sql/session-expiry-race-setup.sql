-- Local isolated PostgreSQL fixtures only. No provider calls or real records.
do $$
declare b uuid; o uuid; s uuid; n integer; claimed jsonb;
begin
  if current_database() <> 'bagelito_test'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
  for n in 1..6 loop
    b := format('00000000-0000-4000-8000-%s',lpad((8100+n*10)::text,12,'0'))::uuid;
    o := format('00000000-0000-4000-8000-%s',lpad((8101+n*10)::text,12,'0'))::uuid;
    s := format('00000000-0000-4000-8000-%s',lpad((8102+n*10)::text,12,'0'))::uuid;
    insert into public.batches(id,name,status,capacity_packs)
      values(b,'EXPIRY RACE '||n,'orders_open',1);
    insert into public.orders(id,batch_id,checkout_session_id,order_code,
      pack_slug,pack_name,pack_units,pack_type,customer_name,whatsapp,email,
      delivery_address,district,total_amount,payment_provider,payment_status,
      payment_lane,payment_amount_minor,payment_currency,payment_expires_at,status)
    values(o,b,s,'BAG-EXPIRY-RACE-'||n,'6-single','6 single',6,'single',
      'Synthetic','000000000','synthetic@example.invalid','Synthetic','Lince',66,
      'culqi','pending','token',6600,'PEN',clock_timestamp()+interval '1 hour','payment_pending_review');
    perform public.prepare_culqi_token_session(o);
    if n in (3,6) then
      claimed := public.claim_culqi_charge(o,'tkn_test_expiry_race'||n,'device_fixture',false);
      if claimed->>'claimed' is distinct from 'true' then raise exception 'Race fixture claim rejected'; end if;
      perform public.finish_culqi_charge(o,(claimed->>'attempt_id')::uuid,'submitted',
        'chr_test_expiry_race'||n,'card','{}');
    end if;
  end loop;
end $$;
