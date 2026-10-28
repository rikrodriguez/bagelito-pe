create table if not exists public.instagram_agent_facts (
  fact_key text primary key,
  fact_value jsonb not null,
  source text not null,
  updated_at timestamptz not null default now()
);

alter table public.instagram_agent_facts enable row level security;
revoke all on table public.instagram_agent_facts from anon, authenticated;
grant select, insert, update, delete on table public.instagram_agent_facts to service_role;

insert into public.instagram_agent_facts (fact_key, fact_value, source, updated_at)
values
(
  'bagel_flavors',
  '[
    {"slug":"jalapeno-cheddar","name":"Jalapeno Cheddar","category":"classic","price":10,"seasonal":false},
    {"slug":"cheddar","name":"Cheddar","category":"classic","price":10,"seasonal":false},
    {"slug":"sesame","name":"Sesame","category":"classic","price":10,"seasonal":false},
    {"slug":"everything-bagel","name":"Everything Bagel","category":"classic","price":10,"seasonal":false},
    {"slug":"cinnamon-raisin","name":"Cinnamon Raisin","category":"classic","price":10,"seasonal":false},
    {"slug":"blueberry","name":"Blueberry","category":"classic","price":10,"seasonal":false},
    {"slug":"plain","name":"Plain","category":"classic","price":10,"seasonal":false},
    {"slug":"classic-onion","name":"Classic Onion","category":"classic","price":10,"seasonal":false},
    {"slug":"rainbow-custom-colors","name":"Rainbow / Custom Colors","category":"premium","price":12,"seasonal":false},
    {"slug":"snickerdoodle","name":"Snickerdoodle","category":"premium","price":12,"seasonal":true}
  ]'::jsonb,
  'src/data/flavors.ts',
  now()
),
(
  'packs',
  '[
    {"slug":"12-mixed","name":"12 mixed","units":12,"amount":115,"packType":"mixed"},
    {"slug":"6-mixed","name":"6 mixed","units":6,"amount":60,"packType":"mixed"},
    {"slug":"12-single","name":"12 single flavor","units":12,"amount":100,"packType":"single"},
    {"slug":"6-single","name":"6 single flavor","units":6,"amount":50,"packType":"single"}
  ]'::jsonb,
  'src/data/packs.ts',
  now()
)
on conflict (fact_key) do update
set fact_value = excluded.fact_value,
    source = excluded.source,
    updated_at = excluded.updated_at;
