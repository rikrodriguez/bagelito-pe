alter table public.orders
add column if not exists custom_request text;

create or replace function public.finalize_instagram_order_draft(
  p_draft_id uuid,
  p_actor text default 'instagram-yape-evidence'
)
returns table(order_id uuid, order_code text)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_draft public.instagram_order_drafts%rowtype;
  v_batch public.batches%rowtype;
  v_order_id uuid;
  v_order_code text;
  v_bagel_units integer;
  v_bagel_lines integer;
  v_pack_type text;
  v_reserved_packs integer;
  v_reserved_bagels integer;
  v_now timestamptz:=clock_timestamp();
begin
  if p_draft_id is null then raise exception 'draft_id_required'; end if;
  perform pg_advisory_xact_lock(hashtext(p_draft_id::text)::bigint);

  select * into v_draft
  from public.instagram_order_drafts
  where id=p_draft_id
  for update;
  if not found then raise exception 'instagram_order_draft_not_found'; end if;

  if v_draft.final_order_id is not null then
    return query select o.id,o.order_code from public.orders o where o.id=v_draft.final_order_id;
    return;
  end if;

  if not coalesce(v_draft.quote_verified,false) then raise exception 'quote_not_verified'; end if;
  if v_draft.total_amount is null or v_draft.total_amount<=0 then raise exception 'verified_total_required'; end if;
  if v_draft.handoff_reason is not null
     or (
       nullif(btrim(v_draft.custom_request),'') is not null
       and coalesce(v_draft.custom_request_status,'none') <> 'approved_standard_pricing'
     ) then
    raise exception 'human_review_must_be_resolved';
  end if;
  if v_draft.payment_status not in ('evidence_received','confirmed') then
    raise exception 'payment_evidence_required';
  end if;
  if nullif(btrim(v_draft.payment_evidence_path),'') is null and v_draft.payment_status<>'confirmed' then
    raise exception 'payment_evidence_path_required';
  end if;
  if v_draft.batch_id is null then raise exception 'batch_required'; end if;
  if nullif(btrim(v_draft.pack_slug),'') is null or nullif(btrim(v_draft.pack_name),'') is null or coalesce(v_draft.units,0)<1 then
    raise exception 'pack_required';
  end if;
  if nullif(btrim(v_draft.customer_name),'') is null then raise exception 'customer_name_required'; end if;
  if nullif(btrim(v_draft.phone),'') is null then raise exception 'phone_required'; end if;
  if nullif(btrim(v_draft.district),'') is null then raise exception 'district_required'; end if;
  if nullif(btrim(v_draft.delivery_address),'') is null then raise exception 'delivery_address_required'; end if;

  select coalesce(sum(quantity),0)::integer,count(*)::integer
  into v_bagel_units,v_bagel_lines
  from public.instagram_order_draft_items
  where draft_id=p_draft_id and item_kind='bagel';
  if v_bagel_units<>v_draft.units then raise exception 'bagel_quantity_does_not_match_pack'; end if;
  v_pack_type:=case when v_bagel_lines>1 then 'mixed' else 'single' end;

  select * into v_batch from public.batches where id=v_draft.batch_id for update;
  if not found then raise exception 'batch_not_found'; end if;
  if v_batch.status<>'orders_open' then raise exception 'batch_closed'; end if;
  if v_batch.orders_open_at is not null and v_now<v_batch.orders_open_at then raise exception 'batch_not_open'; end if;
  if v_batch.orders_close_at is not null and v_now>=v_batch.orders_close_at then raise exception 'batch_closed'; end if;

  select count(*)::integer,coalesce(sum(o.pack_units),0)::integer
  into v_reserved_packs,v_reserved_bagels
  from public.orders o
  where o.batch_id=v_draft.batch_id
    and o.status<>'cancelled'
    and not (
      o.payment_provider='culqi'
      and o.payment_status in ('pending','failed')
      and o.payment_expires_at is not null
      and o.payment_expires_at<=v_now
    );
  if v_batch.capacity_packs is not null and v_reserved_packs+1>v_batch.capacity_packs then
    raise exception 'batch_pack_capacity_exceeded';
  end if;
  if v_batch.capacity_bagels is not null and v_reserved_bagels+v_draft.units>v_batch.capacity_bagels then
    raise exception 'batch_bagel_capacity_exceeded';
  end if;

  v_order_code:=public.next_order_code();
  insert into public.orders(
    order_code,batch_id,pack_slug,pack_name,pack_units,pack_type,
    customer_name,whatsapp,email,delivery_address,district,address_reference,delivery_notes,
    total_amount,payment_method,payment_screenshot_path,terms_accepted,exact_amount_confirmed,
    status,marketing_opt_in,payment_provider,payment_status,payment_currency,payment_amount_minor,
    payment_paid_at,payment_lane,source_channel,source_reference,instagram_draft_id,custom_request,admin_notes
  ) values (
    v_order_code,v_draft.batch_id,v_draft.pack_slug,v_draft.pack_name,v_draft.units,v_pack_type,
    v_draft.customer_name,v_draft.phone,nullif(btrim(v_draft.email),''),v_draft.delivery_address,v_draft.district,
    nullif(btrim(v_draft.address_reference),''),nullif(btrim(v_draft.delivery_notes),''),
    v_draft.total_amount,'Yape',v_draft.payment_evidence_path,false,v_draft.payment_status='confirmed',
    case when v_draft.payment_status='confirmed' then 'payment_confirmed' else 'payment_pending_review' end,
    false,'manual',case when v_draft.payment_status='confirmed' then 'paid' else 'pending' end,'PEN',round(v_draft.total_amount*100)::integer,
    case when v_draft.payment_status='confirmed' then coalesce(v_draft.payment_verified_at,v_now) else null end,
    'legacy','instagram',p_draft_id::text,p_draft_id,nullif(btrim(v_draft.custom_request),''),
    concat_ws(
      E'\n',
      'Created from Instagram conversational order draft; payment evidence requires verification.',
      case
        when nullif(btrim(v_draft.custom_request),'') is not null
          then 'Approved custom request: '||v_draft.custom_request
        else null
      end
    )
  ) returning id into v_order_id;

  insert into public.order_items(
    order_id,flavor_slug,flavor_name,quantity,item_kind,item_key,item_name,unit_price,line_total,metadata
  )
  select
    v_order_id,i.item_key,i.item_name,i.quantity,i.item_kind,i.item_key,i.item_name,i.unit_price,
    coalesce(i.line_total,case when i.unit_price is not null then i.unit_price*i.quantity else null end),i.metadata
  from public.instagram_order_draft_items i
  where i.draft_id=p_draft_id;

  insert into public.order_status_history(order_id,old_status,new_status,changed_by)
  values(v_order_id,null,case when v_draft.payment_status='confirmed' then 'payment_confirmed' else 'payment_pending_review' end,coalesce(nullif(btrim(p_actor),''),'instagram-yape-evidence'));

  update public.instagram_order_drafts
  set final_order_id=v_order_id,
      status=case when payment_status='confirmed' then 'confirmed' else 'payment_verification' end,
      sales_stage=case when payment_status='confirmed' then 'confirmed' else 'payment_evidence_received' end,
      quote_sent_at=coalesce(quote_sent_at,v_now),
      updated_at=v_now
  where id=p_draft_id;

  return query select v_order_id,v_order_code;
end;
$$;

revoke all on function public.finalize_instagram_order_draft(uuid,text)
from public,anon,authenticated;
grant execute on function public.finalize_instagram_order_draft(uuid,text)
to service_role;
