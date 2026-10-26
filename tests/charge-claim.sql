begin;
do $$
begin
 if to_regprocedure('public.claim_culqi_charge(uuid,text,text,boolean)') is null
   or to_regprocedure('public.prepare_culqi_token_session(uuid)') is null then
  raise exception 'ASSERTION FAILED: no atomic charge claim exists';
 end if;
end $$;
do $$
declare b uuid; o uuid; yape_order uuid; claimed boolean; session_one jsonb; session_two jsonb;
begin
 select (public.claim_culqi_charge((select id from orders where order_code='BAG-LEGACY'),'tkn_test_legacy','device_synthetic',false)->>'claimed')::boolean into claimed;
 if claimed is distinct from false then raise exception 'ASSERTION FAILED: migrated legacy attempt became chargeable'; end if;
 if (select payment_lane from public.orders where order_code='BAG-LEGACY') <> 'legacy' then
  raise exception 'ASSERTION FAILED: upgrade classified a legacy order as token-only';
 end if;
 begin
  perform public.prepare_culqi_token_session((select id from orders where order_code='BAG-LEGACY'));
  raise exception 'ASSERTION FAILED: legacy order received a token session' using errcode='Z0001';
 exception when sqlstate 'Z0001' then raise;
  when others then if sqlerrm <> 'Token payment session is blocked or expired' then raise; end if;
 end;
 -- Even clearing legacy ambiguity and external identity must not promote its lane.
 update public.orders set payment_order_id=null,payment_reconciliation_required=false,
  payment_reconciliation_reason=null,payment_charge_state='idle' where order_code='BAG-LEGACY';
 select (public.claim_culqi_charge((select id from orders where order_code='BAG-LEGACY'),'tkn_test_legacy1234','device_synthetic',false)->>'claimed')::boolean into claimed;
 if claimed is distinct from false then raise exception 'ASSERTION FAILED: legacy lane was chargeable'; end if;
 begin
  perform public.prepare_culqi_token_session((select id from orders where order_code='BAG-LEGACY'));
  raise exception 'ASSERTION FAILED: legacy lane received a token session after ID reset' using errcode='Z0001';
 exception when sqlstate 'Z0001' then raise;
  when others then if sqlerrm <> 'Token payment session is blocked or expired' then raise; end if;
 end;
 insert into public.batches(name,status,orders_open_at,orders_close_at)
 values ('SYNTHETIC ONLY','orders_open',now()-interval '1 day',now()+interval '1 day') returning id into b;
 select order_id into o from public.create_culqi_reservation_order(
  'BAG-SYNTHETIC-CLAIM',gen_random_uuid(),b,'6-single','6 single',6,'single',
  'Synthetic Test','000000000','synthetic@example.invalid','Synthetic address','Lince','','',false,58,
  now()+interval '30 minutes',true,'[{"flavor_slug":"plain","flavor_name":"Plain","quantity":6}]'::jsonb);
 if not exists(select 1 from public.orders where id=o and payment_lane='token' and payment_order_id is null) then
  raise exception 'ASSERTION FAILED: new reservation is not token-only';
 end if;
 session_one := public.prepare_culqi_token_session(o);
 session_two := public.prepare_culqi_token_session(o);
 if coalesce(session_one->>'sessionId','') = '' or session_one->>'sessionId' is distinct from session_two->>'sessionId' then
  raise exception 'ASSERTION FAILED: repeated prepare did not reuse the local session';
 end if;
 if (select count(*) from public.payment_attempts where order_id=o) <> 1
   or exists(select 1 from public.payment_attempts where order_id=o and provider_order_id is not null) then
  raise exception 'ASSERTION FAILED: prepare created multiple attempts or an external payment lane';
 end if;
 -- UI configuration is not the boundary: old preparation/attachment APIs stay inert.
 if public.claim_culqi_order_preparation(o) then
  raise exception 'ASSERTION FAILED: disabled external preparation was allowed';
 end if;
 begin
  perform public.attach_culqi_order(o,'{"id":"ord_test_forbidden1","amount":5800,"currency_code":"PEN"}');
  raise exception 'ASSERTION FAILED: disabled external order attachment was allowed' using errcode='Z0001';
 exception when sqlstate 'Z0001' then raise;
  when others then if sqlerrm <> 'Alternative payment orders are disabled; use token sessions' then raise; end if;
 end;
 update public.orders set payment_order_id='ord_test_mixedlane1' where id=o;
 select (public.claim_culqi_charge(o,'tkn_test_synthetic','device_synthetic',false)->>'claimed')::boolean into claimed;
 if claimed is distinct from false then raise exception 'ASSERTION FAILED: mixed lane became chargeable'; end if;
 begin
  perform public.prepare_culqi_token_session(o);
  raise exception 'ASSERTION FAILED: mixed lane received a token session' using errcode='Z0001';
 exception when sqlstate 'Z0001' then raise;
  when others then if sqlerrm <> 'Token payment session is blocked or expired' then raise; end if;
 end;
 update public.orders set payment_order_id=null where id=o;
 select (public.claim_culqi_charge(o,'tkn_test_synthetic','device_synthetic',false)->>'claimed')::boolean into claimed;
 if claimed is distinct from true then raise exception 'ASSERTION FAILED: first claim denied'; end if;
 select (public.claim_culqi_charge(o,'ype_test_synthetic','',false)->>'claimed')::boolean into claimed;
 if claimed is distinct from false then raise exception 'ASSERTION FAILED: Yape claimed after a card claim'; end if;
 begin
  perform public.prepare_culqi_token_session(o);
  raise exception 'ASSERTION FAILED: submitting charge reopened checkout' using errcode='Z0001';
 exception when sqlstate 'Z0001' then raise;
  when others then if sqlerrm <> 'Token payment session is blocked or expired' then raise; end if;
 end;
 select (public.claim_culqi_charge(o,'tkn_test_other1234','device_synthetic',false)->>'claimed')::boolean into claimed;
 if claimed is distinct from false then raise exception 'ASSERTION FAILED: duplicate claim allowed'; end if;
 update public.orders set payment_charge_state='requires_3ds' where id=o;
 select (public.claim_culqi_charge(o,'tkn_test_other1234','device_synthetic',true)->>'claimed')::boolean into claimed;
 if claimed is distinct from false then raise exception 'ASSERTION FAILED: mismatched 3DS claim allowed'; end if;
 select (public.claim_culqi_charge(o,'tkn_test_synthetic','device_synthetic',true)->>'claimed')::boolean into claimed;
 if claimed is distinct from true then raise exception 'ASSERTION FAILED: matching 3DS claim denied'; end if;
 select (public.claim_culqi_charge(o,'tkn_test_synthetic','device_synthetic',true)->>'claimed')::boolean into claimed;
 if claimed is distinct from false then raise exception 'ASSERTION FAILED: duplicate 3DS claim allowed'; end if;
 select order_id into yape_order from public.create_culqi_reservation_order(
  'BAG-SYNTHETIC-YAPE',gen_random_uuid(),b,'6-single','6 single',6,'single',
  'Synthetic Test','000000000','synthetic@example.invalid','Synthetic address','Lince','','',false,2000,
  clock_timestamp()+interval '30 minutes',true,'[{"flavor_slug":"plain","flavor_name":"Plain","quantity":6}]'::jsonb);
 perform public.prepare_culqi_token_session(yape_order);
 begin
  perform public.claim_culqi_charge(yape_order,'ype_test_synthetic','',true);
  raise exception 'ASSERTION FAILED: Yape accepted 3DS parameters' using errcode='Z0001';
 exception when sqlstate 'Z0001' then raise;
  when others then if sqlerrm <> 'Yape does not support card 3DS or payments above PEN 2000' then raise; end if;
 end;
 update public.orders set payment_amount_minor=200001,total_amount=2000.01 where id=yape_order;
 begin
  perform public.claim_culqi_charge(yape_order,'ype_test_synthetic','',false);
  raise exception 'ASSERTION FAILED: Yape accepted an amount above PEN 2000' using errcode='Z0001';
 exception when sqlstate 'Z0001' then raise;
  when others then if sqlerrm <> 'Yape does not support card 3DS or payments above PEN 2000' then raise; end if;
 end;
 update public.orders set payment_amount_minor=200000,total_amount=2000 where id=yape_order;
 select (public.claim_culqi_charge(yape_order,'ype_test_synthetic','',false)->>'claimed')::boolean into claimed;
 if claimed is distinct from true then raise exception 'ASSERTION FAILED: Yape token claim rejected'; end if;
 select (public.claim_culqi_charge(yape_order,'tkn_test_synthetic','device_synthetic',false)->>'claimed')::boolean into claimed;
 if claimed is distinct from false then raise exception 'ASSERTION FAILED: card claimed after a Yape claim'; end if;
 select (public.claim_culqi_charge(yape_order,'ype_test_secondtoken','',false)->>'claimed')::boolean into claimed;
 if claimed is distinct from false then raise exception 'ASSERTION FAILED: second Yape claim allowed'; end if;
 update public.orders set payment_charge_state='requires_3ds' where id=yape_order;
 begin
  perform public.claim_culqi_charge(yape_order,'ype_test_synthetic','',true);
  raise exception 'ASSERTION FAILED: Yape resumed an invalid 3DS state' using errcode='Z0001';
 exception when sqlstate 'Z0001' then raise;
  when others then if sqlerrm <> 'Yape does not support card 3DS or payments above PEN 2000' then raise; end if;
 end;

end $$;
rollback;
-- Service-role-only RPC boundary is part of the release contract.
do $$
declare signature text;
begin
 foreach signature in array array[
 'public.prepare_culqi_token_session(uuid)',
 'public.claim_culqi_order_preparation(uuid)',
 'public.claim_culqi_charge(uuid,text,text,boolean)',
 'public.finish_culqi_charge(uuid,uuid,text,text,text,jsonb)',
 'public.apply_culqi_payment_event(text,text,jsonb,jsonb)',
 'public.attach_culqi_order(uuid,jsonb)'
 ] loop
  if has_function_privilege('anon',signature,'execute') or has_function_privilege('authenticated',signature,'execute')
    or not has_function_privilege('service_role',signature,'execute') then
    raise exception 'Unexpected RPC permission: %',signature;
  end if;
 end loop;
end $$;
