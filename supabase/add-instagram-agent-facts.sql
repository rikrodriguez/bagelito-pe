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
    {"slug":"jalapeno-cheddar","name":"Jalapeno Cheddar","category":"premium","price":12,"seasonal":false},
    {"slug":"cheddar","name":"Cheddar","category":"premium","price":12,"seasonal":false},
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
,
(
  'sales_response_policy',
  '{
    "commercial_exception_intents":["flavors","menu","how_to_order"],
    "goal":"Reduce back-and-forth and move an interested customer toward an order without sounding pushy.",
    "preferred_structure":[
      "warm_greeting",
      "active_promo_if_explicitly_current",
      "current_regular_flavors_or_products",
      "relevant_packs_and_current_prices",
      "schmears_or_addons_when_relevant",
      "current_production_or_delivery_timing_when_known",
      "exact_information_needed_to_order",
      "proactive_approved_human_used_photos"
    ],
    "truth_rule":"Learn structure and sales rhythm from Dawn; all promo, price, date, delivery, availability and inventory facts must come from current live sources."
  }'::jsonb,
  'Live audit of Dawn current Instagram handling, 2026-10-28',
  now()
)

,
(
  'sales_skill_v2',
  '{
    "version":"bagelito-chat-sales-2026-11-04-v2",
    "goal":"Answer the latest customer question, reduce uncertainty, and move exactly one decision forward.",
    "maximum_questions_per_turn":1,
    "principles":["latest_question_first","one_clear_next_decision","progressive_disclosure","diagnose_before_persuade","live_facts_only","crm_is_operational_memory","human_handoff_for_consequential_exceptions","no_pressure_after_natural_close"],
    "objection_protocol":["acknowledge","clarify_if_needed","answer_from_live_facts","confirm_resolution","resume_smallest_next_step"],
    "payment_rules":{"request_requires_verified_quote":true,"evidence_is_not_confirmation":true,"currency":"PEN","display":"S/."},
    "operational_field_bundle":{"allowed_stage":"details_collection","allowed_fields":["customer_name","phone","district","address"],"rule":"One decision per turn does not forbid one compact structured bundle of non-decision operational fields after the order itself is configured."},
    "historical_directional_evidence":{"analyzable_conversations":521,"clear_next_step_with_signal_pct":38.1,"clear_next_step_without_signal_pct":16.7,"decision_question_with_signal_pct":32.2,"decision_question_without_signal_pct":20.6,"one_text_burst_signal_pct":24.9,"two_text_burst_signal_pct":20.5,"after_12h_signal_pct":3.8,"micro_conversion":{"ask_flavors_advance_pct":50.0,"ask_quantity_advance_pct":39.5,"ask_contact_details_advance_pct":53.8,"one_question_advance_pct":30.7,"two_question_advance_pct":21.4,"no_question_advance_pct":17.6,"analyzed_dawn_to_customer_transitions":2014,"caveat":"heuristic immediate-progress associations, not causal uplift"},"caveat":"heuristic association, not causal uplift"}
  }'::jsonb,
  'Bagelito historical Instagram audit + reviewed sales research, 2026-11-04',
  now()
),
(
  'ghl_crm_config',
  '{
    "enabled":false,
    "target_name":"Bagelito",
    "locationId":null,
    "pipelineId":null,
    "stages":{},
    "contactFields":{},
    "opportunityFields":{},
    "reason":"Waiting for the new dedicated Bagelito HighLevel sub-account. Never fall back to a legacy location."
  }'::jsonb,
  'CRM safety reset before dedicated Bagelito GHL sub-account, 2026-11-04',
  now()
)
on conflict (fact_key) do update
set fact_value = excluded.fact_value,
    source = excluded.source,
    updated_at = excluded.updated_at;
