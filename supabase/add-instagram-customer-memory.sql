create or replace function public.get_instagram_customer_memory(
  p_contact_id uuid,
  p_exclude_draft_id uuid default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
with trusted_drafts as (
  select d.*
  from public.instagram_order_drafts d
  where d.contact_id = p_contact_id
    and (
      d.payment_status = 'confirmed'
      or d.status in ('confirmed','in_production','ready_for_delivery','delivered')
    )
    and (p_exclude_draft_id is null or d.id <> p_exclude_draft_id)
),
latest as (
  select d.*
  from trusted_drafts d
  order by coalesce(d.payment_verified_at, d.updated_at, d.created_at) desc
  limit 1
),
memory_totals as (
  select
    count(*)::int as trusted_order_count,
    coalesce(sum(total_amount),0)::numeric as lifetime_revenue
  from trusted_drafts
),
latest_items as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'item_kind', i.item_kind,
        'item_key', i.item_key,
        'item_name', i.item_name,
        'quantity', i.quantity,
        'unit_price', i.unit_price
      )
      order by i.created_at asc
    ),
    '[]'::jsonb
  ) as items
  from public.instagram_order_draft_items i
  join latest l on l.id = i.draft_id
),
preferred_flavors as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'item_key', f.item_key,
        'item_name', f.item_name,
        'quantity', f.total_quantity
      )
      order by f.total_quantity desc, f.item_name asc
    ),
    '[]'::jsonb
  ) as flavors
  from (
    select
      i.item_key,
      max(i.item_name) as item_name,
      sum(i.quantity)::int as total_quantity
    from public.instagram_order_draft_items i
    join trusted_drafts d on d.id = i.draft_id
    where i.item_kind = 'bagel'
      and i.quantity > 0
    group by i.item_key
    order by sum(i.quantity) desc, max(i.item_name) asc
    limit 8
  ) f
)
select jsonb_build_object(
  'trusted_order_count', mt.trusted_order_count,
  'lifetime_revenue', mt.lifetime_revenue,
  'is_returning_customer', mt.trusted_order_count > 0,
  'preferred_flavors', pf.flavors,
  'latest_order',
    case when l.id is null then null else jsonb_build_object(
      'draft_id', l.id,
      'pack_slug', l.pack_slug,
      'pack_name', l.pack_name,
      'units', l.units,
      'customer_name', l.customer_name,
      'phone', l.phone,
      'district', l.district,
      'delivery_address', l.delivery_address,
      'address_reference', l.address_reference,
      'delivery_notes', l.delivery_notes,
      'payment_method', l.payment_method,
      'payment_status', l.payment_status,
      'total_amount', l.total_amount,
      'updated_at', l.updated_at
    ) end,
  'latest_items', li.items
)
from memory_totals mt
cross join preferred_flavors pf
cross join latest_items li
left join latest l on true;
$$;

revoke all on function public.get_instagram_customer_memory(uuid,uuid) from public;
grant execute on function public.get_instagram_customer_memory(uuid,uuid) to service_role;
