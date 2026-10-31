-- Fixture helpers only; never installed by the application migration.
do $$ begin
 if current_database() <> 'bagelito_test'
   or current_setting('bagelito.test_mode', true) is distinct from 'on' then
  raise exception 'Exact isolated database and explicit test mode are required';
 end if;
end $$;
create schema bagelito_manual_fixture;
create function bagelito_manual_fixture.payload(overrides jsonb default '{}'::jsonb)
returns jsonb language sql as $$
 select jsonb_build_object(
 'pack_slug','6-single','pack_name','6 Classic','pack_units',6,'pack_type','single',
 'customer_name','Synthetic Manual','whatsapp','000000000','email','manual@example.invalid',
 'delivery_address','Synthetic address','district','Lince','address_reference','','delivery_notes','',
 'marketing_opt_in',false,'total_amount',58,'payment_method','Yape',
 'payment_transaction_number','SYNTHETIC-MANUAL-TRANSFER','payment_holder_name','Synthetic Manual',
 'payment_phone_number','000000000','terms_accepted',true,'exact_amount_confirmed',true,
 'terms_version','2026-10-26',
 'items',jsonb_build_array(jsonb_build_object('flavor_slug','plain','flavor_name','Plain','quantity',6))
 ) || overrides;
$$;
create function bagelito_manual_fixture.prepare(
 op uuid, payload jsonb default bagelito_manual_fixture.payload(),
 owner text default repeat('1',64), request text default repeat('2',64),
 proof text default repeat('3',64), mime text default 'image/png', size integer default 32
)
returns table(operation_id uuid,state text,order_code text,proof_path text,amount numeric,pack_slug text,replayed boolean)
language sql as $$
 select * from public.prepare_manual_reservation_v1(op,owner,request,proof,mime,size,payload);
$$;
create function bagelito_manual_fixture.finalize(
 op uuid, owner text default repeat('1',64), request text default repeat('2',64)
)
returns table(operation_id uuid,state text,order_code text,proof_path text,amount numeric,pack_slug text,replayed boolean)
language sql as $$
 select * from public.finalize_manual_reservation_v1(op,owner,request);
$$;

create function bagelito_manual_fixture.direct(p_code text,p_batch uuid)
returns uuid language sql as $$
 select r.order_id from public.create_reservation_order(
 p_order_code=>p_code,p_batch_id=>p_batch,p_pack_slug=>'6-single',p_pack_name=>'6 Classic',
 p_pack_units=>6,p_pack_type=>'single',p_customer_name=>'Synthetic imported manual',
 p_whatsapp=>'000000000',p_email=>'imported@example.invalid',p_delivery_address=>'Synthetic address',
 p_district=>'Lince',p_address_reference=>'',p_delivery_notes=>'',p_marketing_opt_in=>false,
 p_total_amount=>58,p_payment_method=>'Yape',p_payment_transaction_number=>'SYNTHETIC-IMPORTED',
 p_payment_holder_name=>'Synthetic imported manual',p_payment_phone_number=>'000000000',
 p_payment_screenshot_path=>'synthetic/imported.png',p_terms_accepted=>true,p_exact_amount_confirmed=>true,
 p_items=>'[{"flavor_slug":"plain","flavor_name":"Plain","quantity":6}]'::jsonb) r;
$$;

create function bagelito_manual_fixture.read(
 op uuid, owner text default repeat('1',64), request text default repeat('2',64),
 proof text default repeat('3',64), mime text default 'image/png', size integer default 32
)
returns table(operation_id uuid,state text,order_code text,proof_path text,amount numeric,pack_slug text,replayed boolean)
language sql as $$
 select * from public.read_manual_reservation_v1(op,owner,request,proof,mime,size);
$$;
