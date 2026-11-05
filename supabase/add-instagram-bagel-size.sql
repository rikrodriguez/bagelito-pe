alter table public.instagram_order_drafts
add column if not exists bagel_size text
  check (bagel_size is null or bagel_size in ('regular','mini'));

insert into public.instagram_agent_facts (fact_key, fact_value, source, updated_at)
values
(
  'mini_bagel_packs',
  '[
    {"slug":"mini-6-mixed","name":"6 mini mixed","units":6,"amount":25,"packType":"mixed","bagelSize":"mini"},
    {"slug":"mini-6-single","name":"6 mini single flavor","units":6,"amount":20,"packType":"single","bagelSize":"mini"},
    {"slug":"mini-12-mixed","name":"12 mini mixed","units":12,"amount":40,"packType":"mixed","bagelSize":"mini"},
    {"slug":"mini-12-single","name":"12 mini single flavor","units":12,"amount":35,"packType":"single","bagelSize":"mini"},
    {"slug":"mini-24-mixed","name":"24 mini mixed","units":24,"amount":75,"packType":"mixed","bagelSize":"mini"},
    {"slug":"mini-24-single","name":"24 mini single flavor","units":24,"amount":70,"packType":"single","bagelSize":"mini"}
  ]'::jsonb,
  'User-confirmed current Bagelito mini-bagel menu, 2026-11-03',
  now()
),
(
  'order_rules',
  '{
    "regular_pack_sizes":[6,12],
    "mini_pack_sizes":[6,12,24],
    "mini_flavors_rule":"Any current regular bagel flavor can be used for minis.",
    "fewer_than_6_regular_policy":"unknown_requires_review",
    "custom_colors_minimum_regular_bagels":6,
    "truth_rule":"Do not infer historical exceptions, promos, 4-unit orders, discounts or minimums that are not explicitly current."
  }'::jsonb,
  'User-confirmed current Bagelito ordering constraints, 2026-11-03 to 2026-11-04',
  now()
)
on conflict (fact_key) do update
set fact_value = excluded.fact_value,
    source = excluded.source,
    updated_at = excluded.updated_at;

create or replace view public.instagram_production_by_flavor
with (security_invoker = true)
as
select
  d.batch_id,
  i.item_key as flavor_key,
  max(i.item_name) as flavor_name,
  sum(i.quantity)::integer as bagels_required,
  count(distinct d.id)::integer as order_count,
  coalesce(d.bagel_size, 'regular') as bagel_size
from public.instagram_order_drafts d
join public.instagram_order_draft_items i on i.draft_id = d.id
where i.item_kind = 'bagel'
  and d.status in ('confirmed','in_production','ready_for_delivery')
group by d.batch_id, i.item_key, coalesce(d.bagel_size, 'regular');

revoke all on public.instagram_production_by_flavor from anon, authenticated;
grant select on public.instagram_production_by_flavor to service_role;
