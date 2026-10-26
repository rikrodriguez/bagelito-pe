-- Existing QA policies are enabled only inside this rolled-back synthetic
-- fixture to prove they cannot clear a new adverse observation. No new policy.
begin;
do $$ begin
  if current_database()<>'bagelito_test' or current_setting('bagelito.test_mode',true) is distinct from 'on' then
    raise exception 'Isolated test database and explicit test mode are required';
  end if;
  if exists(select 1 from public.orders where order_code='BAG-000001') then
    raise exception 'Synthetic adverse recovery fixture collided';
  end if;
end $$;
update public.culqi_charge_get_confirmation_policy set enabled=true where order_code='BAG-000001';
update public.culqi_status_charge_recovery_policy set enabled=true where qa_project_ref='qaahskendqdkynwtylho';
create temporary table adverse_qa_fixture_batch(id uuid primary key);
with b as (insert into public.batches(name,status) values('SYNTHETIC ADVERSE QA EXCLUSION','orders_open') returning id)
insert into adverse_qa_fixture_batch select id from b;
do $$ declare issue text; o public.orders%rowtype; claim jsonb; attempt_uuid uuid;
  proof jsonb; r jsonb; before_order jsonb; before_attempt jsonb; before_history jsonb;
begin
  proof:='{"chargeId":"chr_test_WIu0Hn7e9r2MqEue","sourceId":"tkn_test_SYNTHETICAdverseSource","amountMinor":6600,"currencyCode":"PEN","capture":true,"currentAmountMinor":6600,"amountRefundedMinor":0,"dispute":false,"captureDatePresent":false}';
  foreach issue in array array['refund_observed','dispute_observed','current_amount_mismatch'] loop
    delete from public.orders where batch_id=(select id from adverse_qa_fixture_batch);
    insert into public.orders(batch_id,checkout_session_id,order_code,pack_slug,pack_name,pack_units,pack_type,
      customer_name,whatsapp,email,delivery_address,district,total_amount,payment_provider,payment_status,
      payment_lane,payment_amount_minor,payment_currency,payment_expires_at,status)
    values((select id from adverse_qa_fixture_batch),gen_random_uuid(),'BAG-000001','6-single','6 single',6,'single',
      'Synthetic','000000000','synthetic@example.invalid','Synthetic','Lince',66,'culqi','pending','token',6600,
      'PEN',clock_timestamp()+interval '30 minutes','payment_pending_review') returning * into o;
    perform public.prepare_culqi_token_session(o.id);
    claim:=public.claim_culqi_charge(o.id,'tkn_test_SYNTHETICAdverseSource','device_synthetic',false);
    perform public.finish_culqi_charge(o.id,(claim->>'attempt_id')::uuid,'uncertain',
      'chr_test_WIu0Hn7e9r2MqEue','card',jsonb_build_object('reason',issue));
    select * into o from public.orders where id=o.id;
    select id into attempt_uuid from public.payment_attempts where order_id=o.id and provider='culqi' and provider_order_id is null;
    before_order:=to_jsonb(o);
    select to_jsonb(a) into before_attempt from public.payment_attempts a where id=attempt_uuid;
    select jsonb_agg(to_jsonb(h) order by h.id) into before_history from public.order_status_history h where order_id=o.id;
    r:=public.confirm_culqi_charge_get(o.id,o.checkout_session_id,attempt_uuid,o.payment_charge_attempt_id,
      'culqi_charge_get_reviewed_net_v1',clock_timestamp(),proof);
    if r->>'applied' is distinct from 'false' or r->>'requiresReview' is distinct from 'true' then
      raise exception 'Old pilot GET cleared adverse observation';
    end if;
    r:=public.confirm_culqi_status_charge_get(o.id,o.checkout_session_id,attempt_uuid,o.payment_charge_attempt_id,
      'culqi_charge_get_reviewed_net_v1',clock_timestamp(),proof);
    if r->>'applied' is distinct from 'false' or r->>'requiresReview' is distinct from 'true'
      or (select to_jsonb(x) from public.orders x where id=o.id) is distinct from before_order
      or (select to_jsonb(a) from public.payment_attempts a where id=attempt_uuid) is distinct from before_attempt
      or (select jsonb_agg(to_jsonb(h) order by h.id) from public.order_status_history h where order_id=o.id) is distinct from before_history
      or exists(select 1 from public.culqi_charge_get_receipts where order_id=o.id)
      or exists(select 1 from public.culqi_status_charge_receipts where order_id=o.id) then
      raise exception 'QA recovery changed durable adverse observation';
    end if;
  end loop;
end $$;
rollback;
\echo 'PASS: unchanged pilot/status QA GET RPCs cannot clear durable adverse observations'
