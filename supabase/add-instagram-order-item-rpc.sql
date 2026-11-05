create or replace function public.replace_instagram_order_draft_items(
  p_draft_id uuid,
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_items_payload';
  end if;

  delete from public.instagram_order_draft_items
  where draft_id = p_draft_id;

  insert into public.instagram_order_draft_items (
    draft_id,
    item_kind,
    item_key,
    item_name,
    quantity,
    unit_price,
    metadata
  )
  select
    p_draft_id,
    item_kind,
    item_key,
    item_name,
    quantity,
    unit_price,
    metadata
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as item(
    item_kind text,
    item_key text,
    item_name text,
    quantity integer,
    unit_price numeric,
    metadata jsonb
  )
  where item_kind in ('bagel','schmear','addon')
    and nullif(trim(item_key), '') is not null
    and nullif(trim(item_name), '') is not null
    and quantity > 0;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.replace_instagram_order_draft_items(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.replace_instagram_order_draft_items(uuid,jsonb) to service_role;
