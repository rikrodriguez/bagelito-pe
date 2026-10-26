-- Pass fixture_collision_kind=order or charge; recreate the foundation clone per case.
do $$ begin
  if current_database() <> 'bagelito_preflight_test'
    or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated preflight database and explicit test mode required';
  end if;
end $$;
select set_config('bagelito.rehearsal_collision_kind', :'fixture_collision_kind', false) as fixture_setting \gset
do $$ declare b uuid; n integer; kind text := current_setting('bagelito.rehearsal_collision_kind');
begin
  if kind not in ('order','charge') then raise exception 'Invalid synthetic collision kind'; end if;
  insert into public.batches(name,status) values('SYNTHETIC PREFLIGHT COLLISION','orders_open') returning id into b;
  for n in 1..2 loop
    insert into public.orders(batch_id,order_code,pack_slug,pack_name,pack_units,pack_type,
      customer_name,whatsapp,email,delivery_address,district,total_amount,payment_provider,
      payment_status,payment_currency,payment_amount_minor,payment_order_id,payment_charge_id,status)
    values(b,'BAG-SYNTHETIC-PREFLIGHT-'||n,'6-single','Synthetic six',6,'single',
      'Synthetic','000000000','preflight@example.invalid','Synthetic','Lince',66,'culqi',
      'pending','PEN',6600,
      case when kind='order' then 'ord_test_SYNTHETICCollision' else null end,
      case when kind='charge' then 'chr_test_SYNTHETICCollision' else null end,'payment_pending_review');
  end loop;
end $$;
\echo SEEDED duplicate synthetic payment identity
